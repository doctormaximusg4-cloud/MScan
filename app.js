(() => {
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('overlay'),ctx=canvas.getContext('2d');
let baseline=null,smoothB=null,scanning=false,frozen=false,sensitivity=10,smoothing=.65,points=[];

function resize(){
 const d=devicePixelRatio||1;
 canvas.width=innerWidth*d; canvas.height=innerHeight*d;
 canvas.style.width=innerWidth+'px'; canvas.style.height=innerHeight+'px';
 ctx.setTransform(d,0,0,d,0,0); redraw();
}
addEventListener('resize',resize);

function magneticColor(delta,alpha){
 const t=Math.max(-1,Math.min(1,delta/Math.max(1,sensitivity)));
 let h=t<0?225+(t+1)*(180-225):120*(1-t);
 return `hsla(${h},100%,50%,${alpha})`;
}
function drawBlob(p){
 const s=Math.min(1.8,Math.abs(p.delta)/Math.max(1,sensitivity));
 const r=52+s*55;
 const g=ctx.createRadialGradient(p.x,p.y,2,p.x,p.y,r);
 g.addColorStop(0,magneticColor(p.delta,.72));
 g.addColorStop(.45,magneticColor(p.delta,.35));
 g.addColorStop(1,magneticColor(p.delta,0));
 ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fill();
}
function redraw(){ctx.clearRect(0,0,innerWidth,innerHeight); points.forEach(drawBlob);}

function onMag(r){
 const x=+r.x||0,y=+r.y||0,z=+r.z||0;
 const total=Number.isFinite(+r.magnitude)?+r.magnitude:Math.sqrt(x*x+y*y+z*z);
 smoothB=smoothB===null?total:smoothing*smoothB+(1-smoothing)*total;
 const d=baseline===null?0:smoothB-baseline;
 $('x').textContent=x.toFixed(1); $('y').textContent=y.toFixed(1); $('z').textContent=z.toFixed(1);
 $('total').textContent=smoothB.toFixed(1); $('delta').textContent=(d>=0?'+':'')+d.toFixed(1);
 $('delta').style.color=magneticColor(d,1); $('state').textContent='MAG OK';
 if(scanning&&!frozen&&baseline!==null){
   points.push({x:innerWidth/2,y:innerHeight/2,delta:d});
   if(points.length>220) points.shift();
   redraw();
 }
}

function startMag(){
 if(!window.MScanMagnetometer){$('state').textContent='NO SENSOR';$('message').textContent='Magnetometer plugin not loaded.';return;}
 MScanMagnetometer.start(onMag,e=>{$('state').textContent='MAG ERROR';$('message').textContent='Magnetometer: '+e;},{frequency:50});
}
function startCam(){
 if(!window.MScanCamera){$('message').textContent='Native camera plugin not loaded.';return;}
 MScanCamera.start(
   ()=>{$('message').textContent='Native camera + magnetometer ready. Press CALIBRATE.';},
   e=>{$('message').textContent='Camera: '+e;}
 );
}

$('calibrate').addEventListener('click',()=>{
 if(smoothB===null){$('message').textContent='Waiting for magnetometer readings…';return;}
 baseline=smoothB; points=[]; redraw(); $('message').textContent='Baseline set: '+baseline.toFixed(1)+' μT';
});
$('scan').addEventListener('click',()=>{
 if(baseline===null){$('message').textContent='Calibrate first.';return;}
 scanning=!scanning; frozen=false;
 $('scan').textContent=scanning?'STOP SCAN':'START SCAN';
 $('freeze').textContent='FREEZE';
 $('message').textContent=scanning?'Scanning… move the phone slowly over the target.':'Scan stopped.';
});
$('freeze').addEventListener('click',()=>{
 frozen=!frozen; $('freeze').textContent=frozen?'RESUME':'FREEZE';
});
$('clear').addEventListener('click',()=>{points=[];redraw();});
$('sens').addEventListener('input',e=>{sensitivity=+e.target.value;$('sensVal').textContent=sensitivity+' μT';redraw();});
$('smooth').addEventListener('input',e=>{smoothing=+e.target.value/100;$('smoothVal').textContent=e.target.value+'%';});

document.addEventListener('deviceready',()=>{
 document.documentElement.style.background='transparent';
 document.body.style.background='transparent';
 resize(); startCam(); startMag();
},{once:true});
})();
