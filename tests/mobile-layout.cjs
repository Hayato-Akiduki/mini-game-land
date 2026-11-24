const fs=require('node:fs'),assert=require('node:assert/strict');
const html=require('./client-html.cjs')();
assert.match(html,/viewport-fit=cover/);
assert.match(html,/@media \(pointer:coarse\) \{[^}]*min-height:44px/);
assert.match(html,/@media \(max-height:520px\) and \(orientation:landscape\)/);
assert.match(html,/class="pin-controls"/);
assert.match(html,/#game-screen\[data-game="pinball"\] #pin-canvas \{ width:min\(100%,calc\(\(100dvh - 275px\)\*\.65625\)\)/);
assert.match(html,/\.fighter-controls \{ grid-template-columns:1fr 1fr; gap:6px/);
assert.match(html,/\.sol-card \{[^}]*touch-action:manipulation/);
// Phone usability: notices stay off the controls, option rows wrap, main actions stay reachable,
// D-pad buttons repeat while held, and the pinball board takes touches directly.
assert.match(html,/body\.playing-game #lvup-toast \{ top:/);
assert.match(html,/#game-screen \.flex-center \{ flex-wrap:wrap; \}/);
assert.match(html,/\.sticky-action, \.sticky-actions \{ position:sticky;/);
assert.match(html,/id="slot-spin-btn" class="btn btn-warn sticky-action"/);
assert.match(html,/id="rl-spin-btn" class="btn btn-warn sticky-action"/);
assert.match(html,/class="pachi-actions sticky-actions"/);
assert.match(html,/class="tet-btns"[\s\S]*?data-repeat onclick="tetMove\(-1\)"/);
assert.match(html,/data-repeat="170" data-move="0,-1"/);
assert.match(html,/document\.addEventListener\('pointerdown',e=>\{\s*const button=e\.target instanceof Element&&e\.target\.closest\('\[data-repeat\]'\)/);
assert.match(html,/canvas\.onpointerdown=e=>\{[\s\S]*?if\(ball\.ready\)\{launch\(\);return;\}/);
console.log('PASS: mobile safe areas, touch targets, portrait and landscape game controls, sticky actions, hold-to-repeat pads, touch pinball');
