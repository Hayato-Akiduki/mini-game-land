const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./client-html.cjs')();
for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script);
const source=html.slice(html.indexOf('// Ad-inspired mini-games:'),html.indexOf('// Water Sort:'));
const awards=[],delays=[],listeners=new Map();let scheduled,cancelled=0;
const fixedMath=Object.create(Math);fixedMath.random=()=>.25;
const ctx={games:{},onGameKey:()=>()=>{},Math:fixedMath,gameDelay:f=>delays.push(f),recordWin:(id,score)=>awards.push({id,score,won:true}),recordLoss:(score,id)=>awards.push({id,score,won:false}),requestAnimationFrame:f=>{scheduled=f;return 1;},cancelAnimationFrame:()=>cancelled++,document:{addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)}};
vm.createContext(ctx);vm.runInContext(source+';globalThis.api={stages:PIN_PULL_STAGES,initial:pinPullInitial,pull:pinPullMove,apply:gateRunnerApply,course:gateRunnerCourse,speed:GATE_RUNNER_SPEED};',ctx);
const {stages,initial,pull,apply,course,speed}=ctx.api;
function solve(stage){
  const queue=[{state:initial(stage),path:[]}],seen=new Set();
  for(const entry of queue){
    if(entry.state.won)return entry.path;
    for(let i=0;i<stage.pins.length;i++){
      const next=pull(stage,entry.state,i);if(!next||next.failed)continue;
      const key=JSON.stringify([next.rooms,next.removed]);if(seen.has(key))continue;seen.add(key);queue.push({state:next,path:[...entry.path,i]});
    }
  }
  return null;
}
const solutions=stages.map(stage=>{
  const path=solve(stage);assert.ok(path&&path.length,'Every stage is solvable');
  let state=initial(stage),before=JSON.stringify(state);
  assert.equal(pull(stage,state,-1),null);assert.equal(pull(stage,state,100),null);
  for(const p of path){
    const old=JSON.stringify(state),next=pull(stage,state,p);assert.equal(JSON.stringify(state),old,'Moves do not mutate undo history');
    assert.equal(pull(stage,next,p),null,'Cannot pull a pin twice');state=next;
    const cooled=state.rooms.reduce((n,r)=>n+r.stone,0);
    for(const kind of ['water','lava'])assert.equal(state.rooms.reduce((n,r)=>n+r[kind],0)+cooled,stage.rooms.reduce((n,r)=>n+(r[kind]||0),0),'Liquid conservation');
    assert.equal(state.rooms.reduce((n,r)=>n+r.gold,0),stage.rooms.reduce((n,r)=>n+(r.gold||0),0),'Treasure conservation');
  }
  assert.ok(state.won);assert.equal(JSON.stringify(initial(stage)),before);return path;
});
assert.match(pull(stages[1],initial(stages[1]),0).failed,/宝物/);
assert.match(pull(stages[1],initial(stages[1]),1).failed,/探検家/);
// Cooling leaves only surplus water available for the next chamber.
const cooled=pull(stages[3],initial(stages[3]),2);assert.equal(cooled.rooms[2].water,1);assert.equal(cooled.rooms[2].lava,0);
function node(){return {style:{},textContent:'',innerHTML:'',disabled:false,hidden:false,setAttribute(k,v){this[k]=v;}};}
function mockEl(){const nodes={};return {nodes,querySelector:id=>nodes[id]??=node()};}
const el=mockEl();ctx.games.pinpull(el);
const clickPin=i=>el.nodes['#pin-board'].onclick({target:{closest:()=>({dataset:{pin:String(i)}})}});
const flush=()=>{while(delays.length)delays.shift()();};
for(let stage=0;stage<stages.length;stage++){
  if(stage===1){
    clickPin(0);clickPin(2);assert.match(el.nodes['#pin-status'].textContent,/宝物/,'Animation locks repeat clicks');flush();
    el.nodes['#pin-next'].onclick();assert.equal(awards.length,0,'Cannot advance a failed stage');
    el.nodes['#pin-undo'].onclick();assert.equal(el.nodes['#pin-undo'].disabled,true);
    clickPin(1);flush();el.nodes['#pin-reset'].onclick();
    el.nodes['#pin-hint'].onclick();el.nodes['#pin-hint'].onclick();
  }
  for(const p of solutions[stage]){clickPin(p);flush();}
  assert.equal(el.nodes['#pin-next'].hidden,false);el.nodes['#pin-next'].onclick();
}
assert.deepEqual(awards,[{id:'pinpull',score:210,won:true}]);
el.nodes['#pin-next'].onclick();clickPin(0);assert.equal(awards.length,1);
const exitEl=mockEl();ctx.games.pinpull(exitEl);exitEl.nodes['#pin-board'].onclick({target:{closest:()=>({dataset:{pin:'0'}})}});exitEl._cleanup();flush();assert.equal(awards.length,1,'No reward after leaving');
assert.equal(apply(10,{kind:'gate',op:'+',value:5}),15);
assert.equal(apply(10,{kind:'gate',op:'×',value:2}),20);
assert.equal(apply(11,{kind:'gate',op:'÷',value:2}),5);
assert.equal(apply(5,{kind:'gate',op:'-',value:10}),0);
assert.equal(apply(5,{kind:'enemy',value:10}),0);
// Two-step gates run top to bottom; division and ×1.5 round down.
assert.equal(apply(10,{kind:'gate',steps:[['+',5],['×',2]]}),30);
assert.equal(apply(10,{kind:'gate',steps:[['×',2],['+',5]]}),25);
assert.equal(apply(11,{kind:'gate',steps:[['÷',2],['×',3]]}),15);
assert.equal(apply(11,{kind:'gate',steps:[['×',1.5]]}),16);
assert.equal(apply(4,{kind:'gate',steps:[['-',6],['×',3]]}),0);
// Courses are generated per run: the two gates of a section never tie, the best route
// always beats the boss, and taking the worse gate every time never does.
for(let i=0;i<500;i++){
  const rows=course(()=>Math.random());let best=10,worst=10;
  for(const row of rows.slice(0,-1)){
    assert.equal(row.choices.length,2);const v=row.choices.map(e=>apply(best,e));assert.notEqual(v[0],v[1],'no ties');
    best=Math.max(...v);worst=Math.min(...row.choices.map(e=>apply(worst,e)));
  }
  const boss=rows.at(-1).choices[0];assert.equal(boss.kind,'boss');
  assert.ok(best>boss.value,'best route wins');assert.ok(worst<=boss.value,'worst route loses');
}
for(const random of [()=>.25,()=>.75]){
  let n=10;for(const row of course(random)){n=Math.max(...row.choices.map(e=>apply(n,e)));assert.ok(n>0,'A safe route exists for either lane arrangement');}
}
function runner(){
  const el=mockEl(),canvas=el.querySelector('#gate-canvas');
  canvas.getContext=()=>new Proxy({},{get:()=>()=>{}});canvas.getBoundingClientRect=()=>({left:0,width:400});canvas.setPointerCapture=()=>{};
  ctx.games.gaterunner(el);return el;
}
const rows=course(()=>.25);
function race(best){
  const el=runner();el.nodes['#gate-start'].onclick();el.nodes['#gate-start'].onclick();let now=1;scheduled(now);
  let count=10,previousZ=0;
  for(const row of rows){
    const values=row.choices.map(e=>apply(count,e)),choice=best?values.indexOf(Math.max(...values)):values.indexOf(Math.min(...values));
    el.nodes[choice===0?'#gate-left':'#gate-right'].onclick();count=values[choice];
    // Start and arrive exactly at each gate using controlled frame times.
    let remaining=(row.z-previousZ)/speed;
    while(remaining>1e-8){const dt=Math.min(.04,remaining);now+=dt*1000;scheduled(now);remaining-=dt;}
    now+=.001;scheduled(now);previousZ=row.z;
    if(count<=0)break;
  }
  const award=awards.at(-1);assert.equal(award.id,'gaterunner');assert.equal(award.won,best);
  if(best)assert.equal(award.score,180+count);
  const length=awards.length;scheduled(now+100);el.nodes['#gate-start'].onclick();assert.equal(awards.length,length,'Reward is awarded only once');
  el._cleanup();assert.equal(listeners.has('keydown'),false);
}
race(true);race(false);
const idle=runner(),prior=awards.length;
idle.nodes['#gate-canvas'].onpointerdown({button:0,pointerId:1,clientX:320,preventDefault(){}});assert.equal(idle.nodes['#gate-right']['aria-pressed'],'true');
idle.nodes['#gate-canvas'].onpointercancel();idle.nodes['#gate-canvas'].onpointermove({pointerId:1,clientX:30});assert.equal(idle.nodes['#gate-right']['aria-pressed'],'true');
idle.nodes['#gate-start'].onclick();idle._cleanup();scheduled(50000);assert.equal(awards.length,prior);assert.ok(cancelled);
for(const id of ['pinpull','gaterunner'])assert.ok(fs.readFileSync('dist/server/index.js','utf8').includes(`'${id}'`));
console.log('PASS: all five pin stages solvable, hazards/cooling/conservation, undo/retry/hints, animation locking, one-time rewards; runner arithmetic, safe routes, full win/loss races, pointer cancellation and navigation cleanup');
