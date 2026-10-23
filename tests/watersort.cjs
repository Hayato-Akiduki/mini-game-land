const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('dist/client/index.html','utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
const code=html.slice(html.indexOf('const WATER_SORT_STAGES'),html.indexOf('games.watersort ='));
const ctx=vm.createContext({});
vm.runInContext(code+';globalThis.api={stages:WATER_SORT_STAGES,pour:waterSortPour,solved:waterSortSolved}',ctx);
const {stages,pour,solved}=ctx.api;
assert.equal(pour([[0],[1]],0,1),null);
assert.equal(pour([[0],[]],0,0),null);
assert.equal(pour([[],[]],0,1),null);
assert.equal(pour([[0],[0,0,0,0]],0,1),null);
const board=[[1,0,0],[0,0,0]];
assert.equal(JSON.stringify(pour(board,0,1)),JSON.stringify([[1,0],[0,0,0,0]]));
assert.equal(JSON.stringify(board),JSON.stringify([[1,0,0],[0,0,0]]));
assert.equal(solved([[0,0],[]]),false);
assert.equal(solved([[0,0,0,0],[]]),true);
// Explore legal pours, folding interchangeable tube positions to keep the search small.
function solve(initial){
  const queue=[initial],seen=new Set();
  for(let p=0;p<queue.length;p++){
    const b=queue[p];
    if(solved(b))return true;
    for(let i=0;i<b.length;i++)for(let j=0;j<b.length;j++){
      const n=pour(b,i,j);if(!n)continue;
      const key=n.map(t=>t.join('')).sort().join('|');
      if(!seen.has(key)){seen.add(key);queue.push(n);}
    }
    assert.ok(queue.length<200000,'Search exceeded expected board size');
  }
  return false;
}
for(const [i,stage] of stages.entries()){
  assert.equal(solved(stage),false);
  const counts={};stage.flat().forEach(c=>counts[c]=(counts[c]||0)+1);
  assert.ok(Object.values(counts).every(n=>n===4));
  assert.ok(solve(stage),`Stage ${i+1} is solvable`);
}
assert.ok(fs.readFileSync('dist/server/index.js','utf8').includes("'watersort'"));
console.log('Water Sort: legal moves, immutability, victory, all stage solutions and script syntax passed.');
