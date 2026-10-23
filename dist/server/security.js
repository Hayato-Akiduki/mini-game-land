const SESSION_SECONDS = 60 * 60 * 24 * 365;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function readJson(request, limit) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Expected application/json');
  }
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'Request too large');
  if (!request.body) throw new HttpError(400, 'Invalid JSON');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Request too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new HttpError(400, 'Invalid JSON object'); }
}

function cookieName(request) {
  return new URL(request.url).protocol === 'https:' ? '__Host-mgl_session' : 'mgl_session_local';
}

async function tokenHash(token) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
}

export async function getSession(request, env) {
  const token = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName(request) + '='))?.split('=')[1];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare('SELECT player_id FROM player_sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await tokenHash(token), Date.now()).first();
}

export async function createSession(request, env) {
  const existing = await getSession(request, env);
  if (existing) return Response.json({playerId: existing.player_id});
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const playerId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM player_sessions WHERE expires_at <= ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO player_sessions (token_hash, player_id, expires_at) VALUES (?, ?, ?)')
      .bind(await tokenHash(token), playerId, Date.now() + SESSION_SECONDS * 1000)
  ]);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return Response.json({playerId}, {status: 201, headers: {
    'Set-Cookie': `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`
  }});
}

export function checkOrigin(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin ||
      ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site'))) {
    throw new HttpError(403, 'Same-origin request required');
  }
}

export async function rateLimit(binding, key) {
  if (!binding) throw new HttpError(503, 'Service unavailable');
  if (!(await binding.limit({key})).success) throw new HttpError(429, 'Too many requests');
}

export function secureResponse(response, request) {
  const result = new Response(response.body, response);
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('X-Frame-Options', 'DENY');
  result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  result.headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  if (new URL(request.url).protocol === 'https:') result.headers.set('Strict-Transport-Security', 'max-age=31536000');
  if (new URL(request.url).pathname.startsWith('/api/')) result.headers.set('Cache-Control', 'no-store');
  if (response.status === 429) result.headers.set('Retry-After', '60');
  return result;
}
