import { HttpError, readJson, getSession, createSession, checkOrigin, rateLimit, secureResponse } from './security.js';
const GAME_IDS = new Set([
  'memory','reaction','quiz','blackjack','solitaire','hangman','slide','roulette',
  'shiritori','tetris','breakout','trivia','monster','runner','shooting',
  'minesweeper','animequiz','slot','pinball','snake','aimtrainer',
  'simon','typing','sokoban','reversi','lightsout','pong','fighter','watersort','sudoku','minigolf','pinpull','gaterunner',
  'fruitmerge','whackamole','blockpuzzle','highlow'
]);
const AVATARS = new Set(['🎮','🙂','🐣','🦊','🐱','🐶','🐼','🐸','🤖','👻','🧙','🥷','🐉','👑','👾','🚀','🐹','🐰','🐧','🐵','🐙','🦁','🦄','🦈','🦖','🧛','🧚','🌠','💠','🍉','🔨','🧩','🃏','⚔️','🛸']);


function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function getRankings(request, env) {
  const url = new URL(request.url);
  const type = cleanText(url.searchParams.get('type'), 16) || 'game';
  if (type === 'level' || type === 'points') {
    const order = type === 'level'
      ? 'level DESC, total_points DESC, updated_at ASC'
      : 'total_points DESC, level DESC, updated_at ASC';
    const result = await env.DB.prepare(
      `SELECT player_id, username, avatar, level, total_points, updated_at
       FROM player_profiles
       ORDER BY ${order}
       LIMIT 10`
    ).all();
    return json({
      type,
      rows: (result.results || []).map((row) => ({
        playerId: row.player_id,
        username: row.username,
        avatar: row.avatar,
        level: row.level,
        totalPoints: row.total_points,
        updatedAt: row.updated_at
      }))
    });
  }
  if (type !== 'game') return json({ error: 'Unknown ranking type' }, 400);
  const gameId = cleanText(url.searchParams.get('gameId'), 32);
  const rulesVersion = Math.max(1, Math.min(100, Number(url.searchParams.get('rulesVersion')) || 1));
  if (!GAME_IDS.has(gameId)) return json({ error: 'Unknown game' }, 400);

  const result = await env.DB.prepare(
    `SELECT ranked.player_id,
            COALESCE(profile.username, ranked.username) AS username,
            COALESCE(profile.avatar, ranked.avatar) AS avatar,
            ranked.score, ranked.played_at
     FROM (
       SELECT player_id, username, avatar, score, played_at,
              ROW_NUMBER() OVER (
                PARTITION BY player_id
                ORDER BY score DESC, played_at ASC
              ) AS player_rank
       FROM scores
       WHERE game_id = ? AND rules_version = ?
     ) AS ranked
     LEFT JOIN player_profiles AS profile ON profile.player_id = ranked.player_id
     WHERE player_rank = 1
     ORDER BY score DESC, played_at ASC
     LIMIT 10`
  ).bind(gameId, rulesVersion).all();

  return json({
    rows: (result.results || []).map((row) => ({
      playerId: row.player_id,
      username: row.username,
      avatar: row.avatar,
      score: row.score,
      playedAt: row.played_at
    }))
  });
}

function parsePlayerProfile(body) {
  const playerId = cleanText(body.playerId, 80);
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const avatar = AVATARS.has(body.avatar) ? body.avatar : '🎮';
  const level = body.level;
  const totalPoints = body.totalPoints;
  if (
    playerId.length < 8 || username.length < 1 || username.length > 16 || /[<>\x00-\x1f\x7f]/.test(username) ||
    !Number.isInteger(level) || level < 1 || level > 1000 ||
    !Number.isSafeInteger(totalPoints) || totalPoints < 0 || totalPoints > 1000000000
  ) return null;
  return { playerId, username, avatar, level, totalPoints, updatedAt: new Date().toISOString() };
}

function profileUpsert(env, profile) {
  return env.DB.prepare(
    `INSERT INTO player_profiles (player_id, username, avatar, level, total_points, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET
       username = excluded.username,
       avatar = excluded.avatar,
       level = excluded.level,
       total_points = excluded.total_points,
       updated_at = excluded.updated_at`
  ).bind(profile.playerId, profile.username, profile.avatar, profile.level, profile.totalPoints, profile.updatedAt);
}

async function savePlayerProfile(request, env, playerId) {
  const body = await readJson(request, 2048);
  body.playerId = playerId;
  const profile = parsePlayerProfile(body);
  if (!profile) return json({ error: 'Invalid profile' }, 400);
  await profileUpsert(env, profile).run();
  return json({ ok: true }, 201);
}

async function saveScore(request, env, playerId) {
  const body = await readJson(request, 4096);
  body.playerId = playerId;
  const username = cleanText(body.username, 16);
  const avatar = AVATARS.has(body.avatar) ? body.avatar : '🎮';
  const gameId = cleanText(body.gameId, 32);
  const score = body.score;
  const rulesVersion = body.rulesVersion;
  const durationMs = body.durationMs;
  const won = body.won ? 1 : 0;
  const profile = parsePlayerProfile(body);

  if (
    playerId.length < 8 || username.length < 1 || /[<>]/.test(username) ||
    !GAME_IDS.has(gameId) || typeof body.won !== 'boolean' ||
    !Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > 86400000 ||
    !Number.isSafeInteger(score) || score < 0 ||
    score > 1000000000 || !Number.isInteger(rulesVersion) ||
    rulesVersion < 1 || rulesVersion > 100 || !profile
  ) {
    return json({ error: 'Invalid score' }, 400);
  }

  const id = crypto.randomUUID();
  const playedAt = new Date().toISOString();
  const scoreStatement = env.DB.prepare(
    `INSERT INTO scores
      (id, player_id, username, avatar, game_id, score, won, played_at, duration_ms, rules_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, playerId, username, avatar, gameId, score, won, playedAt, durationMs, rulesVersion);
  await env.DB.batch([scoreStatement, profileUpsert(env, profile)]);

  return json({ ok: true }, 201);
}

async function route(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        await rateLimit(env.API_LIMITER, 'ip:' + (request.headers.get('cf-connecting-ip') || 'local'));
      }
      let session;
      if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
        checkOrigin(request);
        if (url.pathname === '/api/session') {
          await rateLimit(env.SESSION_LIMITER, 'ip:' + (request.headers.get('cf-connecting-ip') || 'local'));
          await readJson(request, 128);
          return await createSession(request, env);
        }
        session = await getSession(request, env);
        if (!session) throw new HttpError(401, 'Session required');
        await rateLimit(env.WRITE_LIMITER, session.player_id);
      }
      if (request.method === 'GET' && url.pathname === '/api/rankings') {
        return await getRankings(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/api/scores') {
        return await saveScore(request, env, session.player_id);
      }
      if (request.method === 'POST' && url.pathname === '/api/profile') {
        return await savePlayerProfile(request, env, session.player_id);
      }
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error('Request failed', {path: new URL(request.url).pathname});
      return json({ error: 'Server error' }, 500);
    }
}

export default {
  async fetch(request, env) { return secureResponse(await route(request, env), request); }
};
