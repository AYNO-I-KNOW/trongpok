'use client';
import {useLayoutEffect,useState} from 'react';
export default function FitPill({value,label,tone}:{value:number;label:string;tone:string}){
 const [shown,setShown]=useState(0),[complete,setComplete]=useState(false);
 useLayoutEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');let frame=0,started:number|null=null,finished=false;
  const finish=()=>{cancelAnimationFrame(frame);finished=true;setShown(value);setComplete(true)};
  const tick=(now:number)=>{if(started===null)started=now;const t=Math.min(1,(now-started)/600);setShown(Math.round(value*(1-(1-t)**3)));if(t<1)frame=requestAnimationFrame(tick);else finish()};
  if(media.matches)finish();else frame=requestAnimationFrame(tick);
  const change=()=>{if(media.matches&&!finished)finish()};media.addEventListener('change',change);return()=>{cancelAnimationFrame(frame);media.removeEventListener('change',change)};
 },[value]);
 return <span className={'fit-pill '+tone} role="img" aria-label={label} data-score-complete={complete}><span className="score-track" aria-hidden="true"><span style={{width: `${shown}%`}} /></span><span className="score-number" aria-hidden="true">{shown}%</span></span>
}
