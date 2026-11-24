// Trivia data stays well-formed: 4 distinct options, a valid answer index, an explanation,
// no duplicate questions, and the advertised question count matches the data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {clientRoot}=require('./client-html.cjs');
const src=fs.readFileSync(path.join(clientRoot,'js/games/quiz.js'),'utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(src.match(/const QUIZ_DATA = \[[\s\S]*?\n\];/)[0]+';globalThis.data=QUIZ_DATA;',ctx);
const data=ctx.data;
assert.ok(data.length>=60,'enough questions for varied games');
const seen=new Set();
for(const [i,q] of data.entries()){
  assert.ok(typeof q.q==='string'&&q.q.length>3,`#${i} has a question`);
  assert.equal(q.opts.length,4,`#${i} has 4 options`);
  assert.equal(new Set(q.opts).size,4,`#${i} options are distinct`);
  assert.ok(Number.isInteger(q.a)&&q.a>=0&&q.a<4,`#${i} answer index`);
  assert.ok(typeof q.exp==='string'&&q.exp.length>0,`#${i} has an explanation`);
  assert.ok(!seen.has(q.q),`#${i} is not a duplicate`);seen.add(q.q);
}
const core=fs.readFileSync(path.join(clientRoot,'js/core.js'),'utf8');
const advertised=core.match(/id:'quiz'[^\n]*|quiz:\{goal:[^\n]*/g).join(' ').match(/(?:全|難問)(\d+)問/g)||[];
assert.ok(advertised.length>=2,'game card and help mention the total');
for(const n of advertised)assert.equal(n.replace(/\D/g,''),String(data.length),'advertised count matches the data');
console.log(`quiz ok: ${data.length} questions`);
