export function createFlight(){return {x:240,y:480,hp:3,score:0,kills:0,wave:1,time:0,spawn:0,shot:0,invulnerable:0,rapid:0,enemies:[],bullets:[],pickups:[],particles:[],over:false,won:false};}
const hit=(a,b,r)=>Math.hypot(a.x-b.x,a.y-b.y)<r;
export function tick(s,dt,input={},random=Math.random){
  if(s.over)return;
  dt=Math.min(.04,Math.max(0,dt));s.time+=dt;s.spawn-=dt;s.shot-=dt;s.invulnerable=Math.max(0,s.invulnerable-dt);s.rapid=Math.max(0,s.rapid-dt);
  s.x=Math.max(20,Math.min(460,s.x+(input.axis||0)*300*dt));
  if(Number.isFinite(input.target))s.x=Math.max(20,Math.min(460,input.target));
  if(input.fire&&s.shot<=0&&s.bullets.length<32){s.bullets.push({x:s.x,y:s.y-18});if(s.wave>=4)s.bullets.push({x:s.x+12,y:s.y-10});s.shot=s.rapid>0?.09:.22;}
  if(s.spawn<=0&&s.enemies.length<18){s.enemies.push({x:25+random()*430,y:-25,speed:70+s.wave*14,type:random()});s.spawn=Math.max(.22,.9-s.wave*.065);}
  for(const b of s.bullets)b.y-=500*dt;
  for(const e of s.enemies)e.y+=e.speed*dt;
  function burst(x,y,color){for(let i=0;i<10;i++)s.particles.push({x,y,vx:(random()-.5)*180,vy:(random()-.5)*180,life:.5,color});}
  for(const e of s.enemies){
    const b=s.bullets.find(b=>!b.dead&&hit(e,b,22));
    if(b){b.dead=true;e.dead=true;s.score+=100*s.wave;s.kills++;burst(e.x,e.y,'#d7ee88');if(s.kills%8===0)s.pickups.push({x:e.x,y:e.y,type:s.kills%16===0?'health':'rapid'});continue;}
    if(hit(e,s,30)||e.y>560){e.dead=true;if(!s.invulnerable){s.hp--;s.invulnerable=1.2;burst(s.x,s.y,'#ff8e88');if(s.hp<=0){s.over=true;break;}}}
  }
  for(const p of s.pickups){p.y+=100*dt;if(hit(p,s,28)){p.dead=true;if(p.type==='health')s.hp=Math.min(3,s.hp+1);else s.rapid=6;}}
  s.enemies=s.enemies.filter(e=>!e.dead);s.bullets=s.bullets.filter(b=>!b.dead&&b.y>-20);s.pickups=s.pickups.filter(p=>!p.dead&&p.y<560);
  for(const p of s.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}s.particles=s.particles.filter(p=>p.life>0).slice(-160);
  s.wave=1+Math.floor(s.kills/12);
  if(!s.over&&s.kills>=96){s.won=true;s.over=true;s.score+=5000;}
}
export function startShooter(root,read,save){
  let s=createFlight(),running=false,paused=false,last=0,best=Number(read('shooterBest',0))||0,sound=false,ac;
  const keys=new Set();let touchTarget=null,touchFire=false;
  root.innerHTML='<div class="shooter-wrap"><div class="scorebar"><span id="flightScore"></span><span id="flightHealth"></span><span id="flightBest"></span></div><p class="status" id="flightStatus" role="status">Clear eight waves to secure the sector.</p><canvas width="480" height="540" tabindex="0" aria-label="Galactic Shooter playfield. Arrow keys move; Space fires."></canvas><div class="row" style="margin-top:1rem"><button class="primary" id="launch">Launch</button><button id="pause" disabled>Pause</button><button id="sound">Sound: off</button></div><div class="touch"><button id="left" aria-label="Move left">◀</button><button id="fire">FIRE</button><button id="right" aria-label="Move right">▶</button></div></div>';
  const $=selector=>root.querySelector(selector),canvas=$('canvas'),ctx=canvas.getContext('2d');
  function beep(freq){if(!sound)return;try{ac??=new AudioContext();ac.resume();const o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.value=freq;g.gain.setValueAtTime(.035,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.1);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+.1)}catch{sound=false;$('#sound').textContent='Sound unavailable'}}
  function hud(){ $('#flightScore').textContent=`${s.score.toLocaleString()} · Wave ${Math.min(8,s.wave)}/8`;$('#flightHealth').textContent=`Shields ${'●'.repeat(Math.max(0,s.hp))}${'○'.repeat(3-Math.max(0,s.hp))}`;$('#flightBest').textContent=`Best ${best.toLocaleString()}`;$('#pause').textContent=paused?'Resume':'Pause';$('#pause').disabled=!running; }
  function pause(){if(!running)return;paused=!paused;keys.clear();touchTarget=null;touchFire=false;$('#flightStatus').textContent=paused?'Paused. Your sector can wait.':'Hold the line. Clear eight waves.';hud()}
  $('#launch').onclick=()=>{s=createFlight();keys.clear();touchTarget=null;touchFire=false;running=true;paused=false;$('#launch').textContent='Restart';$('#flightStatus').textContent='Hold the line. Clear eight waves.';canvas.focus();hud()};
  $('#pause').onclick=pause;$('#sound').onclick=()=>{sound=!sound;$('#sound').textContent=`Sound: ${sound?'on':'off'}`;beep(400)};
  window.addEventListener('keydown',e=>{if(e.target.matches('input,select,button,a'))return;if(['ArrowLeft','ArrowRight',' ','p','P','Escape','a','A','d','D'].includes(e.key)){e.preventDefault();if(!e.repeat&&['p','P','Escape'].includes(e.key))pause();else keys.add(e.key.toLowerCase())}});
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>{if(running&&!paused)pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused)pause()});
  for(const [id,key] of [['left','ArrowLeft'],['right','ArrowRight'],['fire',' ']]){const b=$('#'+id);b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(key.toLowerCase())};for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(key.toLowerCase()));}
  const target=e=>{const r=canvas.getBoundingClientRect();touchTarget=(e.clientX-r.left)/r.width*480};
  canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);touchFire=true;target(e)};canvas.onpointermove=e=>{if(touchFire)target(e)};for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{touchFire=false;touchTarget=null});
  function draw(){
    ctx.fillStyle='#080f1b';ctx.fillRect(0,0,480,540);
    for(let i=0;i<65;i++){const x=(i*137.9)%480,y=(i*83.1+s.time*(12+i%4*8))%540;ctx.fillStyle=i%3?'#8297b0':'#d7ee88';ctx.fillRect(x,y,i%3?1:2,i%3?1:2)}
    ctx.strokeStyle='#15243a';for(let y=0;y<540;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(480,y);ctx.stroke()}
    for(const e of s.enemies){ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle=e.type>.5?'#e68168':'#a995dc';ctx.beginPath();ctx.moveTo(0,19);ctx.lineTo(-18,-12);ctx.lineTo(0,-3);ctx.lineTo(18,-12);ctx.closePath();ctx.fill();ctx.fillStyle='#1d2636';ctx.fillRect(-3,-10,6,12);ctx.restore()}
    ctx.fillStyle='#d7ee88';for(const b of s.bullets)ctx.fillRect(b.x-2,b.y,4,15);
    for(const p of s.pickups){ctx.fillStyle=p.type==='health'?'#8ae4b0':'#ffe090';ctx.fillRect(p.x-12,p.y-12,24,24);ctx.fillStyle='#101315';ctx.font='bold 17px system-ui';ctx.textAlign='center';ctx.fillText(p.type==='health'?'+':'R',p.x,p.y+6)}
    if(!s.invulnerable||Math.floor(s.time*15)%2){ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle='#c1d8ed';ctx.beginPath();ctx.moveTo(0,-22);ctx.lineTo(-18,17);ctx.lineTo(0,9);ctx.lineTo(18,17);ctx.closePath();ctx.fill();ctx.fillStyle='#d7ee88';ctx.fillRect(-4,-8,8,14);if(running&&!paused){ctx.fillStyle='#ffa565';ctx.fillRect(-4,16,8,8+Math.sin(s.time*40)*5)}ctx.restore()}
    for(const p of s.particles){ctx.globalAlpha=p.life*2;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,4,4)}ctx.globalAlpha=1;
    if(!running||paused){ctx.fillStyle='#080f1bbd';ctx.fillRect(0,180,480,160);ctx.fillStyle='#f3f3e9';ctx.font='bold 26px system-ui';ctx.textAlign='center';ctx.fillText(paused?'PAUSED':s.over?(s.won?'SECTOR SECURED':'SHIP LOST'):'GALACTIC SHOOTER',240,244);ctx.font='16px system-ui';ctx.fillText(paused?'Resume when you’re ready':s.over?'Launch again for another run':'Launch to begin · eight waves',240,280)}
  }
  function frame(now){const dt=last?(now-last)/1000:0;last=now;if(running&&!paused){const oldKills=s.kills;tick(s,dt,{axis:Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a')),fire:keys.has(' ')||touchFire,target:touchTarget});if(s.kills>oldKills)beep(180+s.wave*35);if(s.over){running=false;best=Math.max(best,s.score);save('shooterBest',best);$('#flightStatus').textContent=s.won?'Sector secured. Eight waves cleared!':`Ship lost. Final score ${s.score.toLocaleString()}. Launch to try again.`;}hud()}draw();requestAnimationFrame(frame)}hud();requestAnimationFrame(frame);
}
