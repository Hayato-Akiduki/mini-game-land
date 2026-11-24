// Real-time games pause when the player leaves the tab/app and resume only on request.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./client-html.cjs')();
const {clientRoot}=require('./client-html.cjs');

const PAUSABLE=['snake','breakout','runner','shooting','fighter','pong','gaterunner','tetris','pinball','whackamole','typing','shiritori','reaction','aimtrainer'];
for(const id of PAUSABLE){
  const src=fs.readFileSync(path.join(clientRoot,'js/games',id+'.js'),'utf8');
  assert.match(src,/setGamePause\(el,\{\s*pause\(\)\{[\s\S]*?return true;[\s\S]*?resume\(\)\{/,`${id} registers pause/resume`);
}
assert.match(html,/id="pause-overlay"[^>]*role="dialog" aria-modal="true"[^>]*hidden/);
assert.match(html,/id="game-pause-btn" onclick="pauseGame\(\)"[^>]*hidden/);
assert.match(html,/document\.addEventListener\('visibilitychange',\(\)=>\{if\(document\.hidden\)pauseGame\(\);\}\);/);
assert.match(html,/function startGame\(name\) \{\n  clearGamePause\(\);/);
assert.match(html,/function goHome\(\) \{\n  clearGamePause\(\);/);

// pauseGame / resumeGame against a small fake page.
const blockStart=html.indexOf('// ---- Pause ----');
const block=html.slice(blockStart,html.indexOf("document.addEventListener('visibilitychange'",blockStart));
const classes=new Set(['playing-game']),overlay={hidden:true},calls=[];
const gs={};
const ctx={activeGameId:'snake',resultSession:{finished:false},updateQuitBar(){},
  document:{getElementById:id=>id==='game-screen'?gs:id==='pause-overlay'?overlay:null,
    body:{classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)}}}};
vm.createContext(ctx);
vm.runInContext(block+';this.setGamePause=setGamePause;this.pauseGame=pauseGame;this.resumeGame=resumeGame;this.clearGamePause=clearGamePause;',ctx);
let active=false;
ctx.setGamePause(gs,{pause(){calls.push('pause');return active;},resume(){calls.push('resume');}});
assert.equal(ctx.pauseGame(),false,'nothing running yet: no pause screen');assert.equal(overlay.hidden,true);
active=true;
assert.equal(ctx.pauseGame(),true);assert.equal(overlay.hidden,false);assert(classes.has('game-paused'));
assert.equal(ctx.pauseGame(),false,'already paused: handlers are not called twice');
ctx.resumeGame();assert.equal(overlay.hidden,true);assert.deepEqual(calls,['pause','pause','resume']);
ctx.resumeGame();assert.deepEqual(calls,['pause','pause','resume'],'resume only once');
classes.add('result-open');assert.equal(ctx.pauseGame(),false,'result screen is never paused');classes.delete('result-open');
ctx.resultSession.finished=true;assert.equal(ctx.pauseGame(),false,'finished runs are never paused');ctx.resultSession.finished=false;
ctx.pauseGame();ctx.activeGameId='tetris';ctx.resumeGame();assert.equal(calls.at(-1),'pause','a stale pause never resumes another game');
ctx.activeGameId='snake';ctx.pauseGame();ctx.clearGamePause();assert.equal(overlay.hidden,true);assert.equal(gs._pauseHandlers,null);
console.log(`pause ok: ${PAUSABLE.length} games`);
