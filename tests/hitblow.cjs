// Hit & Blow: judging, distinct-digit secrets, and a full game in both modes with one reward.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {clientRoot}=require('./client-html.cjs');
const src=fs.readFileSync(path.join(clientRoot,'js/games/hitblow.js'),'utf8');
const awards=[],listeners=new Map();
const ctx={games:{},awards,playSfx(){},startGame(){},recordWin:(id,s)=>awards.push([id,s,true]),recordLoss:(s,id)=>awards.push([id,s,false]),
  document:{addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)}};
vm.createContext(ctx);vm.runInContext(src,ctx);
const judge=(a,b)=>JSON.parse(JSON.stringify(ctx.hitBlowJudge(a,b)));

assert.deepEqual(judge([1,2,3],[1,2,3]),{hit:3,blow:0});
assert.deepEqual(judge([1,2,3],[3,1,2]),{hit:0,blow:3});
assert.deepEqual(judge([1,2,3],[1,3,9]),{hit:1,blow:1});
assert.deepEqual(judge([0,5,7,9],[4,6,8,1]),{hit:0,blow:0});
assert.deepEqual(judge([0,5,7,9],[9,5,0,2]),{hit:1,blow:2});
for(let i=0;i<200;i++)for(const len of [3,4]){const s=ctx.hitBlowSecret(len);assert.equal(s.length,len);assert.equal(new Set(s).size,len);assert.ok(s.every(d=>Number.isInteger(d)&&d>=0&&d<=9));}

// Minimal DOM stand-in: buttons by data attribute, nodes by id.
function node(){return {innerHTML:'',textContent:'',dataset:{},disabled:false,className:'',scrollTop:0,scrollHeight:0,classList:{add(){},remove(){}},querySelector:()=>node(),closest:()=>null};}
function play(len,findAnswer){
  const nodes={},buttons=[];let modeButtons=[];
  const el={querySelector:sel=>nodes[sel]??=node(),querySelectorAll:sel=>sel==='[data-hb-mode]'?modeButtons:[],set innerHTML(v){if(v.includes('data-hb-mode'))modeButtons=[3,4].map(n=>({dataset:{hbMode:String(n)},onclick:null}));},get innerHTML(){return '';}};
  ctx.games.hitblow(el);
  modeButtons.find(b=>b.dataset.hbMode===String(len)).onclick();
  const key=k=>listeners.get('keydown')({key:k,target:{},preventDefault(){}});
  return {el,nodes,key};
}
// Deterministic run: fix Math.random so the secret is known.
vm.runInContext('Math.random=()=>0',ctx);
for(const len of [3,4]){
  const before=awards.length,secret=ctx.hitBlowSecret(len,()=>0),g=play(len);
  const dup=secret.slice();for(const d of dup)g.key(String(d));g.key('Backspace');g.key(String(dup.at(-1)));
  g.key(String(dup[0]));// duplicate digit is ignored
  g.key('Enter');
  assert.equal(awards.length,before+1,`${len}-digit win records once`);
  const [id,score,won]=awards.at(-1);assert.equal(id,'hitblow');assert.equal(won,true);
  assert.equal(score,len===3?500:1000,'first-try win gets the full base score');
  g.key('1');g.key('Enter');assert.equal(awards.length,before+1,'no input after the game ends');
}
// Running out of tries is a single loss with 0 points.
{
  const before=awards.length,g=play(3);
  const secret=ctx.hitBlowSecret(3,()=>0).join(''),guesses=[];
  for(let n=12;guesses.length<10;n++){const t=String(n).padStart(3,'0');if(new Set(t).size===3&&t!==secret)guesses.push(t);}
  for(const s of guesses){for(const c of s)g.key(c);g.key('Enter');}
  assert.equal(awards.length,before+1);assert.deepEqual(awards.at(-1),['hitblow',0,false]);
}
assert.ok(fs.readFileSync(path.join(clientRoot,'..','server','index.js'),'utf8').includes("'hitblow'"),'server accepts hitblow scores');
console.log('hitblow ok: judging, secrets, wins in both modes, loss after max tries');
