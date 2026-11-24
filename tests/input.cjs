// Keyboard and touch support shared by games (dist/client/js/input.js), plus checks that
// every game can be played with either a keyboard or a touch screen.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {clientRoot}=require('./client-html.cjs');
const read=f=>fs.readFileSync(path.join(clientRoot,f),'utf8');

// ---- input.js in a small fake DOM ----
class FakeElement{
  constructor(tag,attrs={},rect=null){this.tagName=tag.toUpperCase();this.attrs={...attrs};this.rect=rect;this.children=[];this.parent=null;this.tabIndex=0;this.clicked=0;}
  getAttribute(k){return k in this.attrs?this.attrs[k]:null;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  get dataset(){const d={};for(const [k,v] of Object.entries(this.attrs))if(k.startsWith('data-'))d[k.slice(5).replace(/-(\w)/g,(_,c)=>c.toUpperCase())]=v;return d;}
  append(...kids){for(const k of kids){k.parent=this;this.children.push(k);}return this;}
  // Supports the selector forms input.js uses: tag, [attr], [attr="v"], tag[attr], tag:not([attr="v"]).
  hasAttr(a){const [,k,v]=a.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);return v===undefined?k in this.attrs:this.attrs[k]===v;}
  matches(sel){return sel.split(',').some(s=>{
    const m=s.trim().match(/^([a-z]*)((?::not\(\[[^\]]+\]\))*)((?:\[[^\]]+\])*)$/);if(!m)throw new Error('selector '+s);
    if(m[1]&&this.tagName!==m[1].toUpperCase())return false;
    if([...m[2].matchAll(/:not\((\[[^\]]+\])\)/g)].some(([,a])=>this.hasAttr(a)))return false;
    return [...m[3].matchAll(/\[[^\]]+\]/g)].every(([a])=>this.hasAttr(a));});}
  closest(sel){for(let n=this;n;n=n.parent)if(n.matches(sel))return n;return null;}
  querySelectorAll(sel){const out=[];const walk=n=>{for(const c of n.children){if(c.matches(sel))out.push(c);walk(c);}};walk(this);return out;}
  getBoundingClientRect(){return this.rect;}
  getClientRects(){return this.rect?[this.rect]:[];}
  focus(){doc.activeElement=this;}
  click(){this.clicked++;}
}
const listeners={};
const doc={activeElement:null,body:Object.assign(new FakeElement('body'),{classList:{set:new Set(['playing-game']),contains(c){return this.set.has(c);}}}),
  addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn),querySelectorAll:()=>[],getElementById:()=>null};
const ctx={document:doc,window:{addEventListener(){}},Element:FakeElement,CSS:{escape:s=>s},queueMicrotask,Math,Number,String,Map,Set,Object};
vm.createContext(ctx);vm.runInContext(read('js/input.js')+';globalThis.api={gameKey,onGameKey,clearGameKeys,heldKeys,navNeighbor,get keyboardMode(){return keyboardMode;}};',ctx);
const api=ctx.api;
function press(key,target=doc.body,extra={}){
  const e={key,target,defaultPrevented:false,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,repeat:false,preventDefault(){this.defaultPrevented=true;},...extra};
  for(const fn of listeners.keydown)fn(e);return e;
}
function release(key){const e={key,target:doc.body};for(const fn of listeners.keyup)fn(e);}

// gameKey: shortcuts ignore typing, modifiers, dialogs, and Enter/Space on a focused button.
const button=new FakeElement('button'),input=new FakeElement('input',{type:'text'}),range=new FakeElement('input',{type:'range'});
assert.equal(api.gameKey({key:'H',target:doc.body}),'h','single characters are lower-cased');
assert.equal(api.gameKey({key:'ArrowLeft',target:doc.body}),'ArrowLeft');
assert.equal(api.gameKey({key:'a',target:input}),null,'typing in a text field is not a shortcut');
assert.equal(api.gameKey({key:'ArrowLeft',target:range}),'ArrowLeft','a slider is not a text field');
assert.equal(api.gameKey({key:'a',target:doc.body,ctrlKey:true}),null,'browser shortcuts pass through');
assert.equal(api.gameKey({key:' ',target:button}),null,'Space on a focused button only presses that button');
assert.equal(api.gameKey({key:'1',target:button}),'1','other keys still work while a button has focus');
doc.body.classList.set.add('result-open');assert.equal(api.gameKey({key:'h',target:doc.body}),null,'result screen blocks shortcuts');doc.body.classList.set.delete('result-open');
doc.body.classList.set.delete('playing-game');assert.equal(api.gameKey({key:'h',target:doc.body}),null,'only while a game is open');doc.body.classList.set.add('playing-game');

// onGameKey: the first handler that uses a key prevents the browser default; clearing removes them.
const seen=[];api.onGameKey(k=>{seen.push(k);return k==='x';});
assert.equal(press('x').defaultPrevented,true);assert.equal(press('y').defaultPrevented,false);
assert.deepEqual(seen,['x','y']);
assert.equal(api.keyboardMode,true,'key presses switch to keyboard mode');
api.clearGameKeys();press('x');assert.equal(seen.length,2,'handlers are dropped when the game ends');

// heldKeys: movement keys stay down until released, honor when(), and reset when the game ends.
let allowed=true;const held=api.heldKeys({left:['ArrowLeft','a'],right:['ArrowRight']},{when:()=>allowed});
press('A');assert.equal(held.left,true,'letter keys match regardless of case');
press('ArrowLeft');release('a');assert.equal(held.left,true,'still held by the other key');
release('ArrowLeft');assert.equal(held.left,false);
allowed=false;assert.equal(press('ArrowRight').defaultPrevented,false,'outside play the key keeps its normal job');assert.equal(held.right,false);
allowed=true;press('ArrowRight');api.clearGameKeys();assert.equal(held.right,false,'leaving the game releases held keys');

// Enter/Space press non-native role="button" elements, but not native buttons (the browser does that).
const chip=new FakeElement('div',{role:'button'});press('Enter',chip);press(' ',chip);assert.equal(chip.clicked,2);
press('Enter',chip,{repeat:true});assert.equal(chip.clicked,2,'auto-repeat does not press again');
press('Enter',button);assert.equal(button.clicked,0);
chip.setAttribute('aria-disabled','true');press('Enter',chip);assert.equal(chip.clicked,2);

// Arrow keys move between data-nav items by position, staying in the same row or column.
const rect=(x,y)=>({left:x,top:y,width:40,height:40});
const group=new FakeElement('div',{'data-nav-group':'g'});
const cells=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)cells.push(new FakeElement('button',{'data-nav':''},rect(c*50,r*50)));
group.append(...cells);
assert.equal(api.navNeighbor(group,cells[4],[1,0]),cells[5]);
assert.equal(api.navNeighbor(group,cells[4],[0,-1]),cells[1]);
assert.equal(api.navNeighbor(group,cells[2],[1,0]),null,'stops at the edge');
cells[5].disabled=true;assert.equal(api.navNeighbor(group,cells[3],[1,0]),cells[4]);assert.notEqual(api.navNeighbor(group,cells[4],[1,0]),cells[5],'skips disabled items');
doc.activeElement=cells[0];const e=press('ArrowDown',cells[0]);assert.equal(doc.activeElement,cells[3]);assert.equal(e.defaultPrevented,true,'arrow does not scroll the page');

// ---- Every game file ----
const gameFiles=fs.readdirSync(path.join(clientRoot,'js/games')).filter(f=>f.endsWith('.js'));
const KEYBOARD=/onGameKey|heldKeys|addEventListener\('keydown'|addEventListener\("keydown"|\.onkeydown|data-nav|<input|<button|createElement\('button'\)/;
for(const f of gameFiles){
  const src=read('js/games/'+f);
  assert.ok(KEYBOARD.test(src),`${f} can be played with a keyboard`);
  // Clickable divs must be reachable from the keyboard.
  for(const [tag] of src.matchAll(/<div\b[^>]*\bonclick=[^>]*>/g))assert.match(tag,/role="button"|role=\\?"button/,`${f}: clickable <div> needs role="button": ${tag.slice(0,80)}`);
  for(const m of src.matchAll(/(\w+)\s*=\s*document\.createElement\('div'\)/g)){
    const after=src.slice(m.index,m.index+500),v=m[1];
    if(after.includes(`${v}.addEventListener('click'`))assert.ok(after.includes(`${v}.setAttribute('role','button')`),`${f}: clickable div "${v}" needs role="button"`);
  }
  // Hover-only interactions would leave touch players stuck.
  assert.ok(!/addEventListener\('mouseover'|addEventListener\('mouseenter'/.test(src),`${f} does not depend on hover`);
}
// Real-time games need both: a keyboard control scheme and touch input.
const REALTIME={breakout:/heldKeys/,shooting:/shootKeys/,aimtrainer:/heldKeys/,pong:/keyDown/,snake:/setDir/,tetris:/tetrisKeyHandler/,runner:/jump/,pinball:/keyState/,fighter:/keys\.left/,gaterunner:/select\(/,fruitmerge:/drop\(\)/,minigolf:/nudge/,pachinko:/shootBall/,whackamole:/KEYS\.indexOf/};
for(const [id,keyboard] of Object.entries(REALTIME)){
  const src=read(`js/games/${id}.js`);
  assert.ok(keyboard.test(src),`${id} has keyboard controls`);
  assert.ok(/touch|pointer|onclick|<button/.test(src),`${id} has touch controls`);
}
// Shared styles: a visible focus ring, tap-friendly targets, and key hints hidden on touch screens.
const css=read('css/app.css');
assert.match(css,/\[role="button"\]:focus-visible, \[data-nav\]:focus-visible/);
assert.match(css,/@media \(hover:none\) and \(pointer:coarse\) \{ \.kbd-hint \{ display:none; \} \}/);
console.log(`input ok: ${gameFiles.length} games`);
