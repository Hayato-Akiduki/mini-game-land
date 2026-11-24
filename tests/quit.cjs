// Games without a natural early ending expose el._quit, wired to the "ここで終了" bar.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./client-html.cjs')();
const {clientRoot}=require('./client-html.cjs');

const QUITTABLE=['pinpull','watersort','sokoban','blockpuzzle','slide','tetris','solitaire','sudoku','lightsout','minigolf'];
for(const id of QUITTABLE){
  const src=fs.readFileSync(path.join(clientRoot,'js/games',id+'.js'),'utf8');
  assert.match(src,/el\._quit=\(\)=>/,`${id} can be ended early`);
}
assert.match(html,/id="game-quit-bar"[^>]*hidden/);
assert.match(html,/id="game-quit-btn" onclick="quitGame\(\)" aria-label="ここで終了" hidden>/);
// Rules/restart/pause/quit sit in the top bar, so games that redraw their screen keep them.
assert.match(html,/<div id="topbar-game"[\s\S]*?id="game-quit-bar"[\s\S]*?id="game-rules-btn" onclick="openRules\(activeGameId\)"[\s\S]*?id="game-restart-btn" onclick="startGame\(activeGameId\)"/);

// recordQuit: once per run, keeps the score, shows a neutral heading, never touches the streak.
const fn=name=>html.match(new RegExp(`function ${name}\\([^]*?\\n}`))[0];
const calls=[];
const ctx={DIRECT_POINT_GAMES:new Set(),resultSession:{gameId:'pinpull',finished:false},saveData:{streak:4},
  addScore:(n,id)=>calls.push(['addScore',n,id]),recordGameResult:(id,s,won)=>calls.push(['record',id,s,won]),
  checkMetaProgress:()=>{},presentGameResult:(id,s,won,force,heading)=>calls.push(['present',id,s,won,heading])};
vm.createContext(ctx);vm.runInContext(fn('claimTerminalResult')+';'+html.match(/function recordQuit\([^\n]*\n/)[0],ctx);
ctx.recordQuit('pinpull',45.4);ctx.recordQuit('pinpull',90);
assert.deepEqual(calls,[['addScore',45,'pinpull'],['record','pinpull',45,false],['present','pinpull',45,false,'🏁 ここで終了']]);
assert.equal(ctx.saveData.streak,4,'stopping is not a loss');

// The bar shows only while a quittable run is in progress.
const bar={hidden:true},gs={},classes=new Set(['playing-game']);
const ui={document:{getElementById:id=>id==='game-quit-bar'?bar:gs,body:{classList:{contains:c=>classes.has(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c)}}},resultSession:{finished:false}};
vm.createContext(ui);vm.runInContext(fn('updateQuitBar'),ui);
ui.updateQuitBar();assert.equal(bar.hidden,true,'hidden when the game has no quit');
gs._quit=()=>{};ui.updateQuitBar();assert.equal(bar.hidden,false);
classes.add('result-open');ui.updateQuitBar();assert.equal(bar.hidden,true,'hidden on the result screen');
classes.delete('result-open');ui.resultSession.finished=true;ui.updateQuitBar();assert.equal(bar.hidden,true,'hidden after the run ends');

// Result screen: NEW RECORD is steady and the home button text is blue.
assert.doesNotMatch(html.match(/\.new-record-badge \{[^}]*\}/)[0],/animation/);
assert.match(html,/class="btn result-home-btn" onclick="goHome\(\)">ホームへ/);
assert.match(html,/\.result-home-btn \{[^}]*color:var\(--accent4\)/);
console.log('quit ok');
