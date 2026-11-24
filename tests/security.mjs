import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import worker from '../dist/server/index.js';

const sqlite = new DatabaseSync(':memory:');
for (const file of readdirSync('drizzle').filter(x => x.endsWith('.sql')).sort()) sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
const DB = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    let args = [];
    const query = {
      bind(...values) {args = values; return query;},
      async first() {return statement.get(...args) || null;},
      async all() {return {results: statement.all(...args)};},
      async run() {return statement.run(...args);}
    };
    return query;
  },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results;}
    catch(error) {sqlite.exec('ROLLBACK'); throw error;}
  }
};
const allow = {async limit(){return {success:true};}};
const deny = {async limit(){return {success:false};}};
const env = {DB, API_LIMITER:allow, WRITE_LIMITER:allow, SESSION_LIMITER:allow, ASSETS:{async fetch(){return new Response('<html>game</html>');}}};
const origin = 'https://game.example';
function call(path, body, {cookie='', headers={}, environment=env, method='POST'}={}) {
  return worker.fetch(new Request(origin + path, {
    method, headers:{'Origin':origin,'Content-Type':'application/json',cookie,...headers},
    ...(method==='GET'?{}:{body:typeof body==='string'?body:JSON.stringify(body)})
  }), environment);
}
let passed=0;
async function check(name, action) {await action(); passed++; console.log('PASS: '+name);}
const profile = {playerId:'victim-player', username:'プレイヤー',avatar:'🎮',level:1,totalPoints:0,totalEarnedPoints:0};
const score = {...profile,gameId:'memory',score:100,won:true,durationMs:10000,rulesVersion:1};
let cookie, playerId;
await check('unauthenticated writes rejected',async()=>assert.equal((await call('/api/profile',profile)).status,401));
await check('cross-origin and missing Origin rejected',async()=>{
  for(const value of ['https://evil.example','null','']) assert.equal((await call('/api/session',{}, {headers:{Origin:value}})).status,403);
});
await check('server creates random identity and protected cookie',async()=>{
  const response=await call('/api/session',{playerId:'victim-player'});
  assert.equal(response.status,201);
  playerId=(await response.json()).playerId;
  assert.notEqual(playerId,'victim-player');
  const fullCookie=response.headers.get('set-cookie');
  for(const flag of ['__Host-mgl_session=','HttpOnly','SameSite=Strict','Secure','Path=/']) assert.ok(fullCookie.includes(flag));
  cookie=fullCookie.split(';')[0];
  const stored=sqlite.prepare('SELECT * FROM player_sessions').get();
  assert.notEqual(stored.token_hash,cookie.split('=')[1]);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
await check('existing session remains stable',async()=>assert.equal((await (await call('/api/session',{}, {cookie})).json()).playerId,playerId));
await check('forged cookie rejected',async()=>assert.equal((await call('/api/profile',profile,{cookie:'__Host-mgl_session='+'a'.repeat(64)})).status,401));
await check('public player ID cannot select another profile',async()=>{
  sqlite.prepare('INSERT INTO player_profiles (player_id,username,avatar,level,total_points,updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('victim-player','Victim','🎮',5,500,'2026-01-01');
  assert.equal((await call('/api/profile',profile,{cookie})).status,201);
  assert.equal(sqlite.prepare('SELECT username FROM player_profiles WHERE player_id = ?').get('victim-player').username,'Victim');
  assert.equal(sqlite.prepare('SELECT username FROM player_profiles WHERE player_id = ?').get(playerId).username,profile.username);
});
await check('valid score belongs to authenticated identity',async()=>{
  assert.equal((await call('/api/scores',score,{cookie})).status,201);
  assert.equal(sqlite.prepare('SELECT player_id FROM scores').get().player_id,playerId);
});
await check('invalid JSON shapes rejected without server error',async()=>{
  for(const body of ['null','[]','true','123','"text"','{']) assert.equal((await call('/api/profile',body,{cookie})).status,400);
});
await check('actual body byte limit enforced without Content-Length',async()=>{
  assert.equal((await call('/api/profile',{...profile,extra:'あ'.repeat(800)},{cookie})).status,413);
  assert.equal((await call('/api/scores',{...score,extra:'x'.repeat(5000)},{cookie,headers:{'Content-Length':'1'}})).status,413);
});
await check('incorrect content type rejected',async()=>assert.equal((await call('/api/profile',profile,{cookie,headers:{'Content-Type':'text/plain'}})).status,415));
await check('numeric coercion and out of range values rejected',async()=>{
  for(const change of [{score:'100'},{score:null},{score:1.1},{score:-1},{score:1e10},{durationMs:-1},{durationMs:'1'},{rulesVersion:1.5},{won:'false'},{level:'1'},{totalPoints:null},{totalEarnedPoints:'123'},{username:'a'.repeat(17)},{username:'<script>'},{username:'a\u0000b'}]) {
    assert.equal((await call('/api/scores',{...score,...change},{cookie})).status,400,JSON.stringify(change));
  }
});
await check('scores above the per-game cap rejected',async()=>{
  for(const change of [{gameId:'memory',score:1001},{gameId:'hangman',score:501},{gameId:'reversi',score:5001}]) {
    assert.equal((await call('/api/scores',{...score,...change},{cookie})).status,400,JSON.stringify(change));
  }
});
await check('rankings aggregate recorded game scores and use latest profile',async()=>{
  await call('/api/profile',{...profile,username:'更新',avatar:'🐱',totalEarnedPoints:321},{cookie});
  const response=await call('/api/rankings?gameId=memory&rulesVersion=1',null,{method:'GET'});
  const rows=(await response.json()).rows;
  assert.equal(rows[0].username,'更新'); assert.equal(rows[0].avatar,'🐱'); assert.equal(rows[0].score,100);
  await call('/api/scores',{...score,username:'更新',avatar:'🐱',gameId:'hangman',score:50},{cookie});
  const earned=await call('/api/rankings?type=earned',null,{method:'GET'}),top=(await earned.json()).rows.find(row=>row.playerId===playerId);
  assert.equal(top.totalScore,150);assert.equal(top.username,'更新');
});
await check('rate limits fail closed and return retry information',async()=>{
  for(const binding of ['API_LIMITER','WRITE_LIMITER','SESSION_LIMITER']) {
    const response=await call(binding==='SESSION_LIMITER'?'/api/session':'/api/profile',binding==='SESSION_LIMITER'?{}:profile,{cookie,environment:{...env,[binding]:deny}});
    assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
  }
  assert.equal((await call('/api/profile',profile,{cookie,environment:{...env,WRITE_LIMITER:null}})).status,503);
});
await check('expired sessions cannot write',async()=>{
  sqlite.prepare('UPDATE player_sessions SET expires_at=0').run();
  assert.equal((await call('/api/profile',profile,{cookie})).status,401);
});
await check('static pages have framing and content protections',async()=>{
  const response=await call('/',null,{method:'GET'});
  assert.equal(response.status,200);assert.equal(response.headers.get('X-Frame-Options'),'DENY');
  assert.ok(response.headers.get('Content-Security-Policy').includes("object-src 'none'"));
});
sqlite.close();
console.log(`${passed} security scenarios passed`);
