'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {Conditions,Plan,ResearchResult} from '@/ui/trong-pok/lib/types';
import {manufacturerExample,research,researchDesignPreview} from '@/ui/trong-pok/lib/research';
import Mascot from './Mascot';
import HomeForm from './HomeForm';
import QuestionCard from './QuestionCard';
import Results from './Results';
import HomeHistory from './HomeHistory';
import {readHistory,rememberHistory,historyResult,type HistoryEntry} from '@/ui/trong-pok/lib/history';
export default function TrongPok({rankingDemo,fontTheme='ibm'}:{rankingDemo:boolean;fontTheme?:'ibm'|'line'}){
 const router=useRouter();
 const [phase,setPhase]=useState(rankingDemo?'result':'home'),[query,setQuery]=useState(''),[plan,setPlan]=useState<Plan|null>(null),[result,setResult]=useState<ResearchResult|null>(()=>rankingDemo?manufacturerExample():null),[error,setError]=useState('');
 const [history,setHistory]=useState<HistoryEntry[]>([]);
 useEffect(()=>{const refresh=()=>setHistory(readHistory());const frame=requestAnimationFrame(refresh);window.addEventListener('storage',refresh);return()=>{cancelAnimationFrame(frame);window.removeEventListener('storage',refresh)}},[]);
 const controller=useRef<AbortController|null>(null),busy=useRef(false),preflightTimer=useRef<ReturnType<typeof setTimeout>|null>(null),resultTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{controller.current?.abort();if(preflightTimer.current!==null)clearTimeout(preflightTimer.current)},[]);
 function cancelPreflight(){if(preflightTimer.current!==null){clearTimeout(preflightTimer.current);preflightTimer.current=null}}
 function reset(){cancelPreflight();controller.current?.abort();controller.current=null;busy.current=false;setQuery('');setPlan(null);setResult(null);setError('');setPhase('home');const url=new URL(window.location.href);url.searchParams.delete('demo');window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);requestAnimationFrame(()=>document.getElementById('query')?.focus())}
 function openHistory(entry:HistoryEntry){cancelPreflight();controller.current?.abort();busy.current=false;const saved=historyResult(entry);setQuery('');setPlan(saved.plan);setResult(saved);setError('');setPhase('result')}
 function back(){cancelPreflight();controller.current?.abort();busy.current=false;setPhase('home');const url=new URL(window.location.href);url.searchParams.delete('demo');window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);requestAnimationFrame(()=>document.getElementById('query')?.focus())}
 async function run(next:Plan){if(busy.current)return;busy.current=true;controller.current?.abort();const current=new AbortController();controller.current=current;setPlan(next);setPhase('search');setError('');
 try{
 await new Promise<void>((resolve,reject)=>{const abort=()=>{if(resultTimer.current!==null){clearTimeout(resultTimer.current);resultTimer.current=null}reject(new DOMException('Cancelled','AbortError'))};current.signal.addEventListener('abort',abort,{once:true});resultTimer.current=setTimeout(()=>{resultTimer.current=null;current.signal.removeEventListener('abort',abort);resolve()},3000)});
 const data=next.designPreview?researchDesignPreview(next):await research(next,current.signal);if(!current.signal.aborted){setResult(data);if(next.designPreview)setHistory(rememberHistory(data));setPhase('result')}
 }catch(e){if(!current.signal.aborted){setError(e instanceof Error?e.message:'ตรวจข้อมูลไม่สำเร็จ');setPhase('unsupported')}}finally{if(controller.current===current)busy.current=false}}
 function submit(raw:string){if(busy.current||!raw.trim())return;cancelPreflight();controller.current?.abort();router.push('/compare?q='+encodeURIComponent(raw.trim())+(fontTheme==='line'?'&font=line':''))}
 function changeConditions(conditions:Conditions){if(!result)return;void run({...result.plan,conditions,needsContext:false})}
 return <main className={'phone '+phase} data-font={fontTheme}><Mascot phase={phase}/>{phase!=='home'&&<p className="prototype-label" role="status">ตัวอย่างดีไซน์ · เริ่มค้นหาใหม่เพื่อวิเคราะห์จากชุดรีวิว</p>}{phase==='home'&&<HomeForm key={query} initial={query} onSubmit={submit} history={history.length?<HomeHistory items={history} onOpen={openHistory}/>:null}/>} {phase==='clarify'&&plan&&<QuestionCard plan={plan} onConfirm={next=>void run(next)} onBack={back}/>} {phase==='search'&&<section className="search-copy" role="status"><h1>กำลังวิเคราะห์สินค้าของคุณ..</h1><p>กรุณารอสักครู่</p></section>} {phase==='result'&&result&&<Results result={result} onReset={reset} onBack={back} onConditions={changeConditions}/>} {phase==='unsupported'&&<section className="unsupported"><h1>ยังตรวจเรื่องนี้ไม่ได้</h1><p>{error}</p><p>ชุดข้อมูลนี้รองรับเครื่องปั่น Electrolux E3CB1-630S, HOFFEN FB-3025 และ Simplus DDJR003 สำหรับโจทย์น้ำแข็ง</p><button className="primary" onClick={back}>แก้โจทย์</button></section>}</main>
}
