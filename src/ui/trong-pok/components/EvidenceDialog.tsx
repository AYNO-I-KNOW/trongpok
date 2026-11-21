'use client';
import type {Evaluation} from '@/ui/trong-pok/lib/types';
import ReviewSummary from './ReviewSummary';
import EvidenceSheet from './EvidenceSheet';

export default function EvidenceDialog({item,onClose}:{item:Evaluation|null;onClose:()=>void}){
 return <EvidenceSheet open={Boolean(item)} title={item?.product.name??''}
  eyebrow={item?.product.mock?'หลักฐานและรีวิวสมมติ':'แหล่งอ้างอิงที่บันทึกไว้'} onClose={onClose}>
  {item&&<section className="evidence-decision"><h3>{item.rank?'เหตุผลอันดับ '+item.rank:'ผลตามโจทย์'}</h3><p>{item.reason}</p><p>{item.limitation}</p>{item.mockDetails&&<p>เหมาะกับ: {item.mockDetails.fitFor}</p>}</section>}{item?.evidence.map(e=><section key={e.category+e.url+e.summary}><h3>{e.category==='สื่อ'?'รูปและวิดีโอ':e.category==='ร้าน'?'ร้าน การคืน และประกัน':e.category}</h3><p>{e.summary}</p>{e.category==='คู่มือ'&&item.product.mock&&<p className="evidence-gap">เป็นข้อกำหนดที่สร้างเพื่อทดลองดีไซน์ ไม่ใช่เอกสารของผู้ผลิตจริง</p>}{e.category==='สื่อ'&&item.product.id==='electrolux-large'&&<p className="evidence-gap">ภาพที่ผู้ผลิตใช้ในหน้า E5TB1-710K มีชื่อไฟล์ E5TB1-711K ตรวจแหล่งอ้างอิงจากหน้ารุ่นไทย ไม่ใช้ชื่อไฟล์ยืนยันเป็นรุ่นอื่น</p>}{e.category==='สื่อ'&&<p className="evidence-gap">{item.product.mock?'มีเพียงไอคอนประกอบในเดโม ไม่มีภาพทดสอบหรือวิดีโอจริงให้ยืนยัน':'ยังไม่มีไฟล์วิดีโอที่ตรวจรหัสรุ่นและผลการใช้งานได้ครบ ภาพสินค้าอย่างเดียวใช้ยืนยันการปั่นไม่ได้'}</p>}{e.category==='รีวิว'&&<ReviewSummary details={item.mockDetails}/>} {e.category==='ร้าน'&&(item.sourceDetails?<><p>{item.sourceDetails.returns}</p><p>{item.sourceDetails.warranty}</p></>:item.mockDetails?<><p>{item.mockDetails.returns}</p><p>{item.mockDetails.warranty}</p></>:<p className="evidence-gap">การคืนสินค้าและประกัน: ยังไม่มีข้อมูลที่ยืนยันไว้</p>)}{e.url&&<a href={e.url} target="_blank" rel="noopener noreferrer">{e.label} ↗</a>}</section>)}
 </EvidenceSheet>;
}
