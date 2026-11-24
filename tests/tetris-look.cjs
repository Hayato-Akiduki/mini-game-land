// Tetris presentation: sharp canvases, a three-piece next queue, clear/drop/game-over effects,
// and a result dialog that waits for the game-over animation without delaying the record.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=require('./client-html.cjs')();
const {clientRoot}=require('./client-html.cjs');
const src=fs.readFileSync(path.join(clientRoot,'js/games/tetris.js'),'utf8');
assert.match(src,/function tetrisCanvas\(cv,w,h\)\{const d=Math\.min\(2,window\.devicePixelRatio\|\|1\)/,'canvases follow devicePixelRatio');
assert.match(src,/const queue=\[randPiece\(\),randPiece\(\),randPiece\(\)\];/,'three upcoming pieces');
for(const type of ['lock','flash','sparks','text','trail'])assert(src.includes(`addFx({type:'${type}'`),`${type} effect`);
assert.match(src,/fxRAF=fx\.length&&canvas\.isConnected\?requestAnimationFrame\(fxLoop\):0/,'effect loop stops when idle');
assert.match(src,/el\._cleanup=\(\)=>\{cancelAnimationFrame\(fxRAF\)/);
// The record happens at once; only the dialog waits.
assert.match(src,/resultSession\.presentDelay=1500;\n    if\(score>0\)recordWin\('tetris',score\);/);
assert.match(html,/if\(session\.presentDelay>0\)\{const wait=session\.presentDelay;session\.presentDelay=0;resultTimer=gameDelay\(/);
assert.match(html,/@media \(hover:hover\) and \(pointer:fine\) \{ #game-screen\[data-game="tetris"\] \.tet-btns \{ display:none; \} \}/);
console.log('tetris look ok');
