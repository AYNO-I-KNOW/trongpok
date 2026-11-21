'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {useIdlePlaceholder} from '@/ui/trong-pok/lib/use-idle-placeholder';
import {parseInputLink} from '@/ui/trong-pok/lib/input-link';
function highlightLinks(value:string){
 const parts:React.ReactNode[]=[];let end=0;
 for(const match of value.matchAll(/https?:\/\/[^\s]+/gi)){
  const start=match.index!;if(start>end)parts.push(value.slice(end,start));
  parts.push(parseInputLink(match[0])?<span className="inline-input-url" key={start}>{match[0]}</span>:match[0]);end=start+match[0].length;
 }
 if(end<value.length)parts.push(value.slice(end));return parts;
}
export default function HomeForm({initial,onSubmit,history,introAction,onChange,busy=false}:{initial:string;onSubmit:(query:string)=>void;history?:React.ReactNode;introAction?:React.ReactNode;onChange?:(value:string)=>void;busy?:boolean}){
 const [value,setValue]=useState(initial),[error,setError]=useState(''),[ime,setIme]=useState(false),[height,setHeight]=useState(40),[focused,setFocused]=useState(false),[compact,setCompact]=useState(false);const composing=useRef(false),input=useRef<HTMLTextAreaElement>(null),mirror=useRef<HTMLSpanElement>(null);
 const placeholder=useIdlePlaceholder(!focused&&!value);
 function syncScroll(){if(mirror.current&&input.current)mirror.current.style.transform=`translateY(${-input.current.scrollTop}px)`}
 useLayoutEffect(()=>{
  function resize(){const field=input.current;if(!field)return;field.style.height='0px';const desired=value?field.scrollHeight:40;field.style.height='100%';const available=window.visualViewport?.height||window.innerHeight;setCompact(available<560);const cap=Math.min(144,Math.max(40,Math.floor((available*.4-14)/26)*26+14));setHeight(Math.max(40,Math.min(desired,cap)));syncScroll()}
  resize();const frame=requestAnimationFrame(syncScroll);window.visualViewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);return()=>{cancelAnimationFrame(frame);window.visualViewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize)};
 },[value,ime]);
 return <section className="home"><div className="home-copy"><h1>เริ่มค้นหาของที่คุณต้องการ</h1><p>วันนี้มีอะไรที่คุณสนใจซื้ออีกบ้าง?</p>{introAction}</div>{history&&!compact&&<section className="home-history" style={{bottom:`calc(max(46px, env(safe-area-inset-bottom)) + ${height+20}px)`}} aria-label="ผลที่ดูล่าสุด">{history}</section>}<form className="home-form" onSubmit={event=>{event.preventDefault();if(composing.current||busy)return;if(!value.trim()){setError('ระบุคำถามหรือวางลิงก์ก่อน');return}onSubmit(value.trim())}}><label className="sr-only" htmlFor="query">คำถามหรือลิงก์สินค้า</label><div style={{height}} className={'home-input-slot'+(value&&!ime?' show-url-mirror':'')}>{value&&!ime&&<div className="input-text-mirror" aria-hidden="true"><span ref={mirror} className="input-mirror-content">{highlightLinks(value)}</span></div>}<textarea ref={input} id="query" rows={1} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} value={value} onChange={e=>{setValue(e.target.value);onChange?.(e.target.value);setError('')}} onScroll={syncScroll} onSelect={syncScroll} onCompositionStart={()=>{composing.current=true;setIme(true)}} onCompositionEnd={()=>{composing.current=false;setIme(false)}} onKeyDown={e=>{if(e.key==='Enter'){if(e.nativeEvent.isComposing||composing.current){e.preventDefault();return}if(!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit()}}}} placeholder={placeholder} autoComplete="off" spellCheck={false}/></div><button className="home-submit" aria-label="เริ่มค้นหา" type="submit" disabled={busy||!value.trim()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button>{error&&<p className="form-error" role="alert">{error}</p>}</form></section>
}
