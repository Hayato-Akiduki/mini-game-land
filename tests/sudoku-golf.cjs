const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./client-html.cjs')();
for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script);
const source=html.slice(html.indexOf('const SUDOKU_PUZZLE'),html.lastIndexOf('loadSave();'));
const listeners=new Map(),awards=[];
const context={games:{},onGameKey:()=>()=>{},Math,document:{addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)},recordWin:(...args)=>awards.push(args),requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}};
vm.createContext(context);vm.runInContext(source+';globalThis.api={puzzle:SUDOKU_PUZZLE,solution:SUDOKU_SOLUTION,conflicts:sudokuConflicts,complete:sudokuComplete,holes:MINI_GOLF_HOLES,step:miniGolfStep};',context);
const {puzzle,solution,conflicts,complete,holes,step}=context.api;
assert.equal(complete([...solution].map(Number)),true);
assert.equal(complete([...puzzle].map(Number)),false);
const broken=[...solution].map(Number);broken[0]=broken[1];assert.ok(conflicts(broken,0));assert.equal(complete(broken),false);
function countSolutions(board){let count=0;function visit(){const i=board.indexOf(0);if(i<0){count++;return;}for(let n=1;n<=9&&count<2;n++){board[i]=n;if(!conflicts(board,i))visit();}board[i]=0;}visit();return count;}
assert.equal(countSolutions([...puzzle].map(Number)),1);
function node(){return {style:{},value:'60',dataset:{},hidden:false,disabled:false,innerHTML:'',textContent:'',setAttribute(){},focus(){},querySelector(){return node();}};}
for(const easy of [true,false]){
  const nodes={},el={querySelector:id=>nodes[id]??=node()};context.games.sudoku(el);
  nodes[easy?'#sdk-easy':'#sdk-normal'].onclick();
  const input=n=>nodes['#sdk-pad'].onclick({target:{closest:()=>({dataset:{digit:n}})}});
  nodes['#sdk-memo'].onclick();input(1);assert.match(nodes['#sdk-grid'].innerHTML,/、メモ1/);
  nodes['#sdk-undo'].onclick();assert.doesNotMatch(nodes['#sdk-grid'].innerHTML,/、メモ1/);
  nodes['#sdk-memo'].onclick();input(2);nodes['#sdk-undo'].onclick();
  const before=awards.length;for(let i=0;i<81;i++)nodes['#sdk-hint'].onclick();
  assert.equal(awards.length,before+1);assert.equal(awards.at(-1)[0],'sudoku');
  nodes['#sdk-hint'].onclick();input(1);assert.equal(awards.length,before+1);
  el._cleanup();assert.equal(listeners.has('keydown'),false);
}
function settle(b,h){for(let i=0;i<2500&&(b.vx||b.vy);i++)step(b,h);assert.equal(b.vx,0);assert.equal(b.vy,0);}
const wallBall={x:110,y:160,vx:200,vy:0};step(wallBall,holes[1]);for(let i=0;i<8;i++)step(wallBall,holes[1]);assert.ok(wallBall.vx<0,'wall reflects ball');
const edge={x:8,y:200,vx:-200,vy:0};step(edge,holes[0]);assert.ok(edge.vx>0);assert.ok(edge.x>=7);
const captured={x:290,y:85,vx:0,vy:-20};step(captured,holes[0]);assert.equal(captured.sunk,true);
// A safe waypoint route can complete each course with actual fixed-step physics.
const routes=[[[290,80]],[[70,100],[290,65]],[[290,340],[290,195],[75,195],[75,65],[300,65]]];
for(let i=0;i<holes.length;i++){
  const h=holes[i],b={x:h.start[0],y:h.start[1],vx:0,vy:0,sunk:false};
  for(const [x,y] of routes[i]){
    const dx=x-b.x,dy=y-b.y,d=Math.hypot(dx,dy),speed=Math.min(420,d*1.08+5);
    b.vx=dx/d*speed;b.vy=dy/d*speed;settle(b,h);
    assert.ok(Math.hypot(b.x-x,b.y-y)<14,`Hole ${i+1} waypoint ${x},${y}: ${b.x},${b.y}`);
  }
  assert.ok(b.sunk,`Hole ${i+1} is completable`);
}
assert.ok(fs.readFileSync('dist/server/index.js','utf8').includes("'sudoku','minigolf'"));
// Exercise the game controller as well as physics: drag cancellation, stage buttons,
// a single terminal award, and cancellation when leaving the game.
let scheduled=null,cancelled=false;
context.requestAnimationFrame=f=>{scheduled=f;return 7;};context.cancelAnimationFrame=id=>{assert.equal(id,7);cancelled=true;};
// Re-run only the minigolf function; later games declare top-level consts that can't be redeclared.
const golfStart=source.indexOf('games.minigolf=function'),golfEnd=source.indexOf('\n// GAME',golfStart);
assert.ok(golfStart>=0&&golfEnd>golfStart,'minigolf source found');
vm.runInContext(source.slice(golfStart,golfEnd).replace('  start();raf=', '  el.test={get ball(){return ball;},get index(){return index;}};start();raf='),context);
const golfNodes={},canvasContext=new Proxy({},{get:()=>()=>{}});
const golfEl={querySelector:id=>golfNodes[id]??=node()};
golfEl.querySelector('#golf-course').getContext=()=>canvasContext;
golfNodes['#golf-course'].getBoundingClientRect=()=>({left:0,top:0,width:360,height:400});
golfNodes['#golf-course'].setPointerCapture=()=>{};
context.games.minigolf(golfEl);
const course=golfNodes['#golf-course'];
course.onpointerdown({pointerId:1,button:0,clientX:70,clientY:320,preventDefault(){}});
course.onpointercancel();course.onpointerup({pointerId:1,clientX:20,clientY:320});
assert.equal(golfEl.test.ball.vx,0);
const priorAwards=awards.length;let now=1;
for(let i=0;i<3;i++){
  golfNodes['#golf-next'].onclick();assert.equal(golfEl.test.index,i,'Cannot skip an unfinished hole');
  for(const [x,y] of routes[i]){
    const b=golfEl.test.ball,dx=x-b.x,dy=y-b.y;
    golfNodes['#golf-angle'].value=String(Math.atan2(dy,dx)*180/Math.PI);
    golfNodes['#golf-power'].value=String(Math.min(420,Math.hypot(dx,dy)*1.08+5)/4.2);
    golfNodes['#golf-shot'].onclick();
    for(let n=0;n<1400;n++){now+=1000/120;scheduled(now);if(b.sunk||(!b.vx&&!b.vy))break;}
  }
  assert.ok(golfEl.test.ball.sunk);if(i<2)golfNodes['#golf-next'].onclick();
}
assert.equal(awards.length,priorAwards+1);assert.equal(awards.at(-1)[0],'minigolf');
scheduled(now+20);golfNodes['#golf-shot'].onclick();assert.equal(awards.length,priorAwards+1);
golfEl._cleanup();assert.ok(cancelled);
console.log('PASS: Sudoku unique solution, conflicts, memo/undo, both difficulties, one-time reward, cleanup; golf reflection, friction, capture and playable routes for all 3 holes; script syntax');
