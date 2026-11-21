'use client';
import {useRef,useState} from 'react';
import type {Container,Plan} from '@/ui/trong-pok/lib/types';
import QuestionStep from './QuestionStep';
const cards=[
 {title:'อยากใช้ปั่นอะไร?',description:'เลือกการใช้งานที่ใกล้กับคุณ',label:'สิ่งที่ต้องการปั่น',placeholder:'เช่น สมูทตี้ใส่น้ำแข็ง',choices:[['smoothie','สมูทตี้ใส่น้ำแข็ง'],['ice','บดน้ำแข็ง']]},
 {title:'ใช้น้ำแข็งกี่ก้อน?',description:'จำนวนที่ต้องการปั่นในหนึ่งรอบ',label:'จำนวนก้อนที่ใช้',placeholder:'เช่น 8 ก้อน',choices:[['5','4–5 ก้อน'],['8','8 ก้อน'],['12','12 ก้อน']]},
 {title:'ใช้ภาชนะไหน?',description:'เลือกภาชนะที่ต้องการใช้กับเครื่อง',label:'ภาชนะที่ใช้',placeholder:'เช่น ขวดปั่น 600 มล.',choices:[['bottle600','ขวดปั่น 600 มล.'],['mainJar','โถปั่นหลัก'],['grinder','โถบด']]}
];
export default function QuestionCard({plan,onConfirm,onBack}:{plan:Plan;onConfirm:(plan:Plan)=>void;onBack:()=>void}){
 const [direction,setDirection]=useState<'next'|'back'>('next');const [step,setStep]=useState(0),[answers,setAnswers]=useState(['','','']),[custom,setCustom]=useState(['','','']);const locked=useRef(false);const card=cards[step],choice=answers[step],valid=choice&&(choice!=='custom'||custom[step].trim());
 function select(value:string){setAnswers(a=>a.map((old,i)=>i===step?value:old))}
 function next(){if(!valid||locked.current)return;if(step<cards.length-1){setDirection('next');setStep(step+1);return}locked.current=true;const usage=answers[0]==='custom'?custom[0]:answers[0]==='smoothie'?'สมูทตี้ใส่น้ำแข็ง':'บดน้ำแข็ง';const count=answers[1]==='custom'?custom[1].match(/\d+/)?.[0]:answers[1];const containerText=answers[2]==='custom'?custom[2]:answers[2];const container:Container=/bottle600|600\s*(?:ml|มล)|ขวด.*600/i.test(containerText)?'bottle600':/mainJar|โถปั่นหลัก|โถหลัก|โถแก้ว/i.test(containerText)?'mainJar':/grinder|โถบด/i.test(containerText)?'grinder':'unknown';onConfirm({...plan,ice:/น้ำแข็ง|สมูทตี้/i.test(usage),conditions:{...plan.conditions,cubes:count&&Number(count)>0?Number(count):null,container,pulse:10},broadIce:false,needsContext:false,designPreview:true})}
 return <QuestionStep step={step} total={cards.length} direction={direction} title={card.title} description={card.description}
  action={step===cards.length-1?'เริ่มค้นหาต่อ':'ถัดไป'} disabled={!valid} onNext={next}
  onBack={()=>{if(step){setDirection('back');setStep(step-1)}else onBack()}}>
  <fieldset><legend className="sr-only">{card.title}</legend>{[...card.choices,['custom','กรอกเอง']].map(([value,label])=><label key={value} className={'choice '+(choice===value?'selected':'')}><input type="radio" name={'answer-'+step} value={value} checked={choice===value} onChange={()=>select(value)}/><span className="check" aria-hidden="true">{choice===value?'✓':''}</span><span>{label}</span></label>)}</fieldset>{choice==='custom'&&<label className="custom-label">{card.label}<textarea autoFocus rows={1} value={custom[step]} onChange={e=>setCustom(a=>a.map((old,i)=>i===step?e.target.value:old))} placeholder={card.placeholder}/></label>}
 </QuestionStep>;
}
