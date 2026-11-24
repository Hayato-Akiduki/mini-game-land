// ================================================================
// GAME 9: TETRIS
// ================================================================
const TETRIS_COLS=10, TETRIS_ROWS=20, CELL=28;
const PIECES=[
  {shape:[[1,1,1,1]],color:'#4fd2ff'},
  {shape:[[1,0],[1,0],[1,1]],color:'#ff9f43'},
  {shape:[[0,1],[0,1],[1,1]],color:'#4d7cff'},
  {shape:[[1,1],[1,1]],color:'#ffd43b'},
  {shape:[[0,1,1],[1,1,0]],color:'#51cf66'},
  {shape:[[1,1,0],[0,1,1]],color:'#ff5c6c'},
  {shape:[[0,1,0],[1,1,1]],color:'#b57bff'},
];
let tetrisInterval=null;
let tetrisKeyHandler=null;
// Mixes a #rrggbb colour toward white (amt>0) or black (amt<0).
function tetrisShade(hex,amt){
  const n=parseInt(hex.slice(1),16),t=amt<0?0:255,a=Math.abs(amt);
  return `rgb(${[n>>16,(n>>8)&255,n&255].map(v=>Math.round(v+(t-v)*a)).join(',')})`;
}
// Rounded, glossy block shared by the board and the hold/next previews.
function tetrisBlock(c,x,y,size,color,alpha=1){
  const p=Math.max(1,size*.05),s=size-p*2,r=Math.max(2,size*.2);x+=p;y+=p;
  c.save();c.globalAlpha=alpha;
  const g=c.createLinearGradient(x,y,x,y+s);g.addColorStop(0,tetrisShade(color,.28));g.addColorStop(.55,color);g.addColorStop(1,tetrisShade(color,-.28));
  c.fillStyle=g;c.beginPath();c.roundRect(x,y,s,s,r);c.fill();
  // soft inner rim, then a gloss band on the upper half
  c.strokeStyle=tetrisShade(color,-.38);c.lineWidth=Math.max(1,size*.05);c.stroke();
  c.fillStyle='rgba(255,255,255,.32)';c.beginPath();c.roundRect(x+s*.14,y+s*.1,s*.72,s*.26,r*.6);c.fill();
  c.fillStyle='rgba(255,255,255,.55)';c.beginPath();c.arc(x+s*.24,y+s*.23,Math.max(1,s*.06),0,Math.PI*2);c.fill();
  c.restore();
}
// Sharp canvases on high-density screens: the backing store follows devicePixelRatio and
// drawing code keeps using CSS pixels.
function tetrisCanvas(cv,w,h){const d=Math.min(2,window.devicePixelRatio||1);cv.width=Math.round(w*d);cv.height=Math.round(h*d);const c=cv.getContext('2d');c.setTransform(d,0,0,d,0,0);return c;}
const TETRIS_CLEAR_NAMES=['','SINGLE','DOUBLE','TRIPLE','TETRIS!'];
const TETRIS_LEVEL_HUES=[255,200,165,130,48,22,340,290];

games.tetris = function(el) {
  const W=TETRIS_COLS*CELL,H=TETRIS_ROWS*CELL,PW=96,HOLD_H=64,NEXT_H=168;
  el.innerHTML=`
    <div class="game-header"><h2>🧱 テトリス</h2></div>
    <div id="tetris-wrap">
      <div class="tetris-board-frame"><canvas id="tetris-canvas" aria-label="テトリスの盤面"></canvas></div>
      <div id="tetris-side">
        <div class="tetris-panel tp-preview" id="tet-hold-panel"><div class="tp-label">HOLD</div><canvas id="hold-canvas" aria-hidden="true"></canvas></div>
        <div class="tetris-panel tp-preview"><div class="tp-label">NEXT</div><canvas id="next-canvas" aria-hidden="true"></canvas></div>
        <div class="tetris-panel tp-stats">
          <div class="tp-label">SCORE</div><div class="tp-val" id="tet-score">0</div>
          <div class="tp-row"><div><div class="tp-label">LEVEL</div><div class="tp-sub" id="tet-lvl">1</div></div><div><div class="tp-label">LINES</div><div class="tp-sub" id="tet-lines">0</div></div></div>
          <div class="tp-bar" aria-hidden="true"><span id="tet-lvbar"></span></div>
        </div>
        <div class="tet-hint kbd-hint">← → 移動 / ↑ 回転<br>↓ 落下 / Space 即落下<br>C / Shift ホールド</div>
      </div>
    </div>
    <div class="tet-btns" aria-label="テトリスの操作">
      <button class="btn" data-repeat onclick="tetMove(-1)" aria-label="左へ移動">←</button>
      <button class="btn" data-repeat onclick="tetDown()" aria-label="1マス落とす">↓</button>
      <button class="btn" data-repeat onclick="tetMove(1)" aria-label="右へ移動">→</button>
      <button class="btn" onclick="tetRotate()" aria-label="回転">↻</button>
      <button class="btn btn-warn" onclick="tetHardDrop()" aria-label="ハードドロップ">⏬</button>
      <button class="btn btn-purple" onclick="tetHold()" aria-label="ホールド">📦</button>
    </div>
    <p class="tet-touch-hint">盤面タップで回転／左右スワイプで移動／下スワイプで落下</p>`;
  const wrap=document.getElementById('tetris-wrap');
  const canvas=document.getElementById('tetris-canvas');
  const ctx=tetrisCanvas(canvas,W,H);
  const nctx=tetrisCanvas(document.getElementById('next-canvas'),PW,NEXT_H);
  const hctx=tetrisCanvas(document.getElementById('hold-canvas'),PW,HOLD_H);
  let board=Array.from({length:TETRIS_ROWS},()=>Array(TETRIS_COLS).fill(0));
  let cur, curX, curY, score=0, lines=0, lvl=1, gameOver=false, paused=false, holdPiece=null, canHold=true, overAt=0;
  function randPiece(){const idx=Math.floor(Math.random()*PIECES.length);return {idx,shape:JSON.parse(JSON.stringify(PIECES[idx].shape)),color:PIECES[idx].color};}
  const queue=[randPiece(),randPiece(),randPiece()];
  function spawn(fromHold=null){
    if(fromHold)cur=fromHold;else{cur=queue.shift();queue.push(randPiece());canHold=true;}
    curX=Math.floor(TETRIS_COLS/2)-Math.floor(cur.shape[0].length/2);curY=0;drawNext();drawHold();
    if(!valid(cur.shape,curX,curY)){gameOver=true;endGame();}
  }
  function valid(shape,ox,oy){for(let r=0;r<shape.length;r++)for(let c=0;c<shape[r].length;c++){if(shape[r][c]){const nr=oy+r,nc=ox+c;if(nr<0||nr>=TETRIS_ROWS||nc<0||nc>=TETRIS_COLS||board[nr][nc])return false;}}return true;}
  function rotate(s){return s[0].map((_,i)=>s.map(r=>r[i]).reverse());}
  function cellsOf(shape,ox,oy){const out=[];shape.forEach((row,r)=>row.forEach((v,c)=>{if(v)out.push([ox+c,oy+r]);}));return out;}
  function place(){
    const cells=cellsOf(cur.shape,curX,curY);
    cells.forEach(([x,y])=>{board[y][x]=cur.color;});
    addFx({type:'lock',cells,dur:220});
    clearLines();spawn();
  }
  function updateHud(){
    const s=document.getElementById('tet-score');
    if(s&&s.textContent!==String(score)){s.textContent=score;s.classList.remove('bump');void s.offsetWidth;s.classList.add('bump');}
    document.getElementById('tet-lines').textContent=lines;document.getElementById('tet-lvl').textContent=lvl;
    document.getElementById('tet-lvbar').style.width=(lines%10)*10+'%';
    wrap.style.setProperty('--tet-glow',`hsl(${TETRIS_LEVEL_HUES[(lvl-1)%TETRIS_LEVEL_HUES.length]} 95% 66%)`);
    wrap.classList.toggle('danger',board.slice(0,4).some(row=>row.some(Boolean)));
  }
  function clearLines(){
    const full=[];for(let r=0;r<TETRIS_ROWS;r++)if(board[r].every(c=>c))full.push(r);
    if(full.length){
      // Effects use the rows' positions and colours before they collapse.
      const sparks=[];
      full.forEach(r=>board[r].forEach((color,c)=>{for(let k=0;k<2;k++)sparks.push({x:c*CELL+CELL/2,y:r*CELL+CELL/2,vx:(Math.random()-.5)*260,vy:-60-Math.random()*220,size:3+Math.random()*4,color});}));
      for(const r of full){board.splice(r,1);board.unshift(Array(TETRIS_COLS).fill(0));}
      const cleared=full.length,gained=[0,100,300,500,800][cleared]*lvl,prevLvl=lvl;
      playSfx(cleared>=2?'combo':'merge');lines+=cleared;score+=gained;lvl=Math.floor(lines/10)+1;
      addFx({type:'flash',rows:full,dur:320});addFx({type:'sparks',sparks,dur:700});
      addFx({type:'text',text:TETRIS_CLEAR_NAMES[cleared],sub:'+'+gained.toLocaleString(),y:full[0]*CELL,big:cleared===4,dur:900});
      if(lvl>prevLvl){addFx({type:'text',text:'LEVEL UP!',sub:'Lv.'+lvl,y:H*.36,big:true,dur:1200});clearInterval(tetrisInterval);tetrisInterval=setInterval(tick,Math.max(80,500-lvl*40));}
    }
    updateHud();
  }
  function tick(){if(gameOver||paused)return;if(valid(cur.shape,curX,curY+1))curY++;else place();draw();}

  // ---- Effects: a short animation loop that runs only while an effect is on screen ----
  let fx=[],fxRAF=0;
  function addFx(f){f.t0=performance.now();fx.push(f);if(!fxRAF)fxRAF=requestAnimationFrame(fxLoop);}
  function fxLoop(now){fx=fx.filter(f=>now-f.t0<f.dur);draw(now);fxRAF=fx.length&&canvas.isConnected?requestAnimationFrame(fxLoop):0;}
  function thud(){canvas.classList.remove('thud');void canvas.offsetWidth;canvas.classList.add('thud');}

  function draw(now=performance.now()){
    // well: deep gradient, faint column stripes and dots at the cell corners
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#1a1640');bg.addColorStop(1,'#0a0918');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(255,255,255,.018)';for(let c=0;c<TETRIS_COLS;c+=2)ctx.fillRect(c*CELL,0,CELL,H);
    ctx.fillStyle='rgba(160,170,255,.16)';for(let r=1;r<TETRIS_ROWS;r++)for(let c=1;c<TETRIS_COLS;c++)ctx.fillRect(c*CELL-1,r*CELL-1,2,2);
    if(wrap.classList.contains('danger')){const d=ctx.createLinearGradient(0,0,0,CELL*4);d.addColorStop(0,'rgba(255,60,90,.28)');d.addColorStop(1,'rgba(255,60,90,0)');ctx.fillStyle=d;ctx.fillRect(0,0,W,CELL*4);}
    // settled blocks; at game over they turn grey row by row from the bottom
    const greyFrom=overAt?TETRIS_ROWS-Math.min(1,(now-overAt)/700)*TETRIS_ROWS:TETRIS_ROWS;
    board.forEach((row,r)=>row.forEach((color,c)=>{if(color)tetrisBlock(ctx,c*CELL,r*CELL,CELL,r>=greyFrom?'#5d6275':color);}));
    if(!gameOver&&cur){
      // ghost: tinted landing spot with a solid outline
      let gy=curY;while(valid(cur.shape,curX,gy+1))gy++;
      if(gy>curY){ctx.save();for(const [x,y] of cellsOf(cur.shape,curX,gy)){ctx.fillStyle=cur.color;ctx.globalAlpha=.16;ctx.beginPath();ctx.roundRect(x*CELL+2,y*CELL+2,CELL-4,CELL-4,5);ctx.fill();ctx.globalAlpha=.7;ctx.strokeStyle=cur.color;ctx.lineWidth=2;ctx.stroke();}ctx.restore();}
      ctx.save();ctx.shadowColor=cur.color;ctx.shadowBlur=12;
      for(const [x,y] of cellsOf(cur.shape,curX,curY))tetrisBlock(ctx,x*CELL,y*CELL,CELL,cur.color);
      ctx.restore();
    }
    for(const f of fx){
      const p=Math.min(1,(now-f.t0)/f.dur);
      if(f.type==='lock'){ctx.fillStyle=`rgba(255,255,255,${.45*(1-p)})`;for(const [x,y] of f.cells){ctx.beginPath();ctx.roundRect(x*CELL+1,y*CELL+1,CELL-2,CELL-2,6);ctx.fill();}}
      else if(f.type==='trail'){for(const [x,y0,y1] of f.cols){const g=ctx.createLinearGradient(0,y0*CELL,0,y1*CELL);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(1,`rgba(255,255,255,${.38*(1-p)})`);ctx.fillStyle=g;ctx.fillRect(x*CELL+3,y0*CELL,CELL-6,(y1-y0)*CELL);}}
      else if(f.type==='flash'){for(const r of f.rows){ctx.fillStyle=`rgba(255,255,255,${.85*(1-p)})`;const grow=p*6;ctx.fillRect(0,r*CELL-grow,W,CELL+grow*2);}}
      else if(f.type==='sparks'){const t=(now-f.t0)/1000;for(const s of f.sparks){ctx.globalAlpha=1-p;ctx.fillStyle=s.color;ctx.fillRect(s.x+s.vx*t-s.size/2,s.y+s.vy*t+380*t*t-s.size/2,s.size,s.size);}ctx.globalAlpha=1;}
      else if(f.type==='text'){
        const rise=p*26,a=p<.15?p/.15:p>.7?(1-p)/.3:1,scale=p<.15?.7+p*2:1,y=Math.max(70,Math.min(H-60,f.y))-rise;
        ctx.save();ctx.globalAlpha=a;ctx.translate(W/2,y);ctx.scale(scale,scale);ctx.textAlign='center';ctx.lineJoin='round';
        ctx.font=`900 ${f.big?34:26}px system-ui,sans-serif`;ctx.lineWidth=6;ctx.strokeStyle='rgba(10,8,30,.85)';ctx.strokeText(f.text,0,0);
        const tg=ctx.createLinearGradient(0,-26,0,4);tg.addColorStop(0,'#fff7c2');tg.addColorStop(1,f.big?'#ff9f43':'#ffd43b');ctx.fillStyle=tg;ctx.fillText(f.text,0,0);
        if(f.sub){ctx.font='800 16px system-ui,sans-serif';ctx.lineWidth=4;ctx.strokeText(f.sub,0,24);ctx.fillStyle='#fff';ctx.fillText(f.sub,0,24);}
        ctx.restore();
      }
    }
    if(overAt&&now-overAt>=700){
      ctx.fillStyle='rgba(8,6,24,.72)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.fillStyle='#ffd43b';ctx.font='900 30px system-ui,sans-serif';ctx.fillText('GAME OVER',W/2,H/2-28);
      ctx.fillStyle='#fff';ctx.font='700 16px system-ui,sans-serif';ctx.fillText(`スコア ${score.toLocaleString()}`,W/2,H/2+6);
      ctx.fillStyle='rgba(255,255,255,.7)';ctx.font='600 14px system-ui,sans-serif';ctx.fillText(`${lines}ライン ・ Lv.${lvl}`,W/2,H/2+30);
    }
  }
  // Previews: the hold slot dims while hold is used up; the next queue shows three pieces.
  function drawPiece(c,piece,cx,cy,cs,alpha){
    const s=piece.shape;
    s.forEach((row,r)=>row.forEach((v,col)=>{if(v)tetrisBlock(c,cx-s[0].length*cs/2+col*cs,cy-s.length*cs/2+r*cs,cs,piece.color,alpha);}));
  }
  function drawNext(){
    nctx.clearRect(0,0,PW,NEXT_H);
    queue.forEach((piece,i)=>drawPiece(nctx,piece,PW/2,i===0?32:i===1?94:142,i===0?17:13,i===0?1:.75));
  }
  function drawHold(){
    hctx.clearRect(0,0,PW,HOLD_H);
    if(holdPiece)drawPiece(hctx,holdPiece,PW/2,HOLD_H/2,16,canHold?1:.35);
    document.getElementById('tet-hold-panel')?.classList.toggle('used',!canHold);
  }
  el._quit=()=>{if(gameOver)return;gameOver=true;if(score>0)endGame();else{clearInterval(tetrisInterval);recordQuit('tetris',0);}};
  function endGame(){
    clearInterval(tetrisInterval);
    if(resultSession?.gameId==='tetris')resultSession.presentDelay=1500;
    if(score>0)recordWin('tetris',score);else recordLoss(0,'tetris');
    overAt=performance.now();wrap.classList.remove('danger');addFx({type:'over',dur:760});
    gameDelay(()=>{const r=document.createElement('div');r.className='result-box';r.style.marginTop='12px';r.innerHTML=`<div class="result-score">${score}</div><p>${lines}ライン消去！ Lv.${lvl}</p><div class="xp-gain">+${score} XP</div><button class="btn mt" onclick="startGame('tetris')">もう一度</button>`;el.appendChild(r);},300);
  }
  window.tetMove=dx=>{if(!gameOver&&valid(cur.shape,curX+dx,curY)){curX+=dx;draw();}};
  window.tetRotate=()=>{if(!gameOver){const r=rotate(cur.shape);if(valid(r,curX,curY))cur.shape=r;else if(valid(r,curX+1,curY)){cur.shape=r;curX++;}else if(valid(r,curX-1,curY)){cur.shape=r;curX--;}draw();}};
  window.tetDown=()=>{if(!gameOver){if(valid(cur.shape,curX,curY+1))curY++;else place();draw();}};
  window.tetHardDrop=()=>{
    if(gameOver)return;
    const startY=curY;while(valid(cur.shape,curX,curY+1)){curY++;score+=1;}
    if(curY>startY){
      // one streak per column, from where the piece started to the top of where it lands
      const cols=new Map();for(const [x,y] of cellsOf(cur.shape,curX,curY))cols.set(x,Math.min(cols.get(x)??y,y));
      addFx({type:'trail',cols:[...cols].map(([x,y])=>[x,Math.max(0,y-(curY-startY)),y]),dur:260});thud();
    }
    place();draw();
  };
  window.tetHold=()=>{
    if(gameOver||!canHold)return;
    canHold=false;
    const baseIdx=cur.idx!==undefined?cur.idx:PIECES.findIndex(p=>p.color===cur.color);
    const fresh={idx:baseIdx,shape:JSON.parse(JSON.stringify(PIECES[Math.max(0,baseIdx)].shape)),color:cur.color};
    const prev=holdPiece;holdPiece=fresh;
    playSfx('click');
    if(prev)spawn(prev);else spawn();
    drawHold();draw();
  };
  let tsx=0,tsy=0;
  canvas.addEventListener('touchstart',e=>{if(!e.touches[0])return;tsx=e.touches[0].clientX;tsy=e.touches[0].clientY;},{passive:true});
  canvas.addEventListener('touchend',e=>{
    if(!e.changedTouches[0]||gameOver)return;
    const dx=e.changedTouches[0].clientX-tsx,dy=e.changedTouches[0].clientY-tsy;
    if(Math.max(Math.abs(dx),Math.abs(dy))<16){window.tetRotate();return;}
    if(Math.abs(dx)>Math.abs(dy))window.tetMove(dx>0?1:-1);
    else if(dy>40)window.tetHardDrop();
    else if(dy>0)window.tetDown();
  },{passive:true});
  document.removeEventListener('keydown',tetrisKeyHandler);
  tetrisKeyHandler=e=>{
    if(gameOver)return;
    if(e.key==='ArrowLeft'){e.preventDefault();window.tetMove(-1);}
    else if(e.key==='ArrowRight'){e.preventDefault();window.tetMove(1);}
    else if(e.key==='ArrowDown'){e.preventDefault();window.tetDown();}
    else if(e.key==='ArrowUp'){e.preventDefault();window.tetRotate();}
    else if(e.key===' '){e.preventDefault();window.tetHardDrop();}
    else if(e.key==='c'||e.key==='C'||e.key==='Shift'){e.preventDefault();window.tetHold();}
  };
  document.addEventListener('keydown',tetrisKeyHandler);
  spawn(); updateHud(); draw();
  tetrisInterval=setInterval(tick,500);
  el._cleanup=()=>{cancelAnimationFrame(fxRAF);fxRAF=0;fx=[];};
  if(typeof setGamePause==='function')setGamePause(el,{pause(){if(gameOver||paused)return false;paused=true;return true;},resume(){paused=false;}});
};
