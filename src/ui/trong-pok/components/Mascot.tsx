'use client';
import {useEffect,useRef} from 'react';
export default function Mascot({phase}:{phase:string}){
 const floating=useRef<HTMLDivElement>(null);
 useEffect(()=>{for(const src of ['/assets/home.png','/assets/search.png','/assets/clarify.png']){const img=new Image();img.src=src;void img.decode().catch(()=>{})}},[]);
 useEffect(()=>{if(phase!=='home'||!floating.current)return;const layer=floating.current,media=window.matchMedia('(prefers-reduced-motion: reduce)');let hop:Animation|null=null,settle:Animation|null=null,starts=0,disposed=false;
  const focused=()=>document.activeElement?.matches('textarea,input');
  function stop(smooth:boolean){const transform=getComputedStyle(layer).transform;hop?.cancel();hop=null;settle?.cancel();settle=null;if(smooth&&transform!=='none'&&!media.matches)settle=layer.animate([{transform},{transform:'translateY(0) scale(1)'}],{duration:180,easing:'ease-out'})}
  function update(){if(disposed)return;if(document.hidden||media.matches||focused()){stop(!document.hidden&&!media.matches);return}if(hop||starts>=3)return;settle?.cancel();starts++;hop=layer.animate([{transform:'translateY(0) scale(1)',offset:0},{transform:'translateY(2px) scale(1.025,.975)',offset:.04},{transform:'translateY(-5px) scale(.98,1.02)',offset:.1},{transform:'translateY(0) scale(1.02,.98)',offset:.16},{transform:'translateY(0) scale(1)',offset:.2},{transform:'translateY(0) scale(1)',offset:1}],{duration:5600,iterations:3,easing:'ease-in-out'});hop.onfinish=()=>{hop=null;starts=3}}
  const focusOut=()=>requestAnimationFrame(update);update();document.addEventListener('focusin',update);document.addEventListener('focusout',focusOut);document.addEventListener('visibilitychange',update);media.addEventListener('change',update);return()=>{disposed=true;hop?.cancel();settle?.cancel();document.removeEventListener('focusin',update);document.removeEventListener('focusout',focusOut);document.removeEventListener('visibilitychange',update);media.removeEventListener('change',update)};
 },[phase]);
 const src=phase==='home'?'/assets/home.png':phase==='search'?'/assets/search.png':'/assets/clarify.png';
 return <div className="mascot-position" aria-hidden="true"><div ref={floating} className="mascot-float"><img src={src} alt="" width="160" height="160" decoding="sync"/></div></div>
}
