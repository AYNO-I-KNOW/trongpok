'use client';
import {useEffect,useState} from 'react';
const examples=['เครื่องปั่นที่บดน้ำแข็งได้','เครื่องดูดฝุ่นเบาถือมือเดียว','หูฟังไว้คุยงานในที่เสียงดัง','เครื่องชงกาแฟสำหรับมือใหม่'];
function graphemes(text:string){return typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(text)].map(v=>v.segment):Array.from(text)}
export function useIdlePlaceholder(active:boolean){const [hint,setHint]=useState(examples[0]);useEffect(()=>{if(!active)return;const media=window.matchMedia('(prefers-reduced-motion: reduce)');let timer:ReturnType<typeof setTimeout>|undefined,index=0,count=graphemes(examples[0]).length,deleting=true;
 const tick=()=>{const chars=graphemes(examples[index]);if(deleting){count--;setHint(chars.slice(0,Math.max(0,count)).join(''));if(count<=0){deleting=false;index=(index+1)%examples.length;timer=setTimeout(tick,250)}else timer=setTimeout(tick,22)}else{count++;const next=graphemes(examples[index]);setHint(next.slice(0,count).join(''));if(count>=next.length){deleting=true;timer=setTimeout(tick,1800)}else timer=setTimeout(tick,38)}};
 const update=()=>{clearTimeout(timer);index=0;count=graphemes(examples[0]).length;deleting=true;setHint(examples[0]);if(!document.hidden&&!media.matches)timer=setTimeout(tick,1800)};update();document.addEventListener('visibilitychange',update);media.addEventListener('change',update);return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',update);media.removeEventListener('change',update)};
 },[active]);return active?hint:'พิมพ์หรือวางลิงก์'}
