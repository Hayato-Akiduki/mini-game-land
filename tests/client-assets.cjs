// The page is split into a stylesheet and ordered scripts. Check that every referenced
// file exists, that no script file is left unreferenced, that each game lives in its own
// file, and that the service worker precaches everything the page loads.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {clientScripts,clientRoot}=require('./client-html.cjs');
const html=fs.readFileSync(path.join(clientRoot,'index.html'),'utf8');
const scripts=clientScripts();
assert.ok(scripts.length>10,'page loads its scripts');
assert.equal(scripts[0],'js/bgm.js');assert.equal(scripts.at(-1),'js/main.js');
assert.ok(!/<script>/.test(html)&&!/<style>/.test(html),'no inline script or style blocks left in index.html');

const styles=[...html.matchAll(/<link rel="stylesheet" href="\/([^"]+)">/g)].map(m=>m[1]);
assert.deepEqual(styles,['css/app.css']);
for(const f of [...styles,...scripts])assert.ok(fs.existsSync(path.join(clientRoot,f)),`${f} exists`);

// Each script must parse on its own, since the browser loads them separately.
for(const f of scripts)new vm.Script(fs.readFileSync(path.join(clientRoot,f),'utf8'),{filename:f});

const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const onDisk=walk(path.join(clientRoot,'js')).map(f=>path.relative(clientRoot,f).split(path.sep).join('/'));
assert.deepEqual([...onDisk].sort(),[...scripts].sort(),'every js file is loaded by the page');

for(const f of scripts.filter(f=>f.startsWith('js/games/'))){
  const id=path.basename(f,'.js'),src=fs.readFileSync(path.join(clientRoot,f),'utf8');
  const defs=[...src.matchAll(/^games\.([a-zA-Z]+) *= *function/gm)].map(m=>m[1]);
  assert.deepEqual(defs,[id],`${f} defines only games.${id}`);
}

const sw=fs.readFileSync(path.join(clientRoot,'service-worker.js'),'utf8');
const shell=[...sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
for(const f of [...styles,...scripts])assert.ok(shell.includes('/'+f),`service worker precaches /${f}`);
console.log(`client assets ok: ${scripts.length} scripts`);
