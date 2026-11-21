'use client';
import {useState,type ReactNode} from 'react';
import {reviewSummary,type ReviewGroup} from '@/ui/trong-pok/lib/mock-details';
import type {Evaluation,ResearchResult,Conditions} from '@/ui/trong-pok/lib/types';
import EvidenceDialog from './EvidenceDialog';
import {resultCopy} from '@/ui/trong-pok/lib/result-copy';
import {ComparisonDisclosure,ComparisonResults,ComparisonTable,type ComparisonColumn} from './ComparisonTable';
import {previewFitScore} from '@/ui/trong-pok/lib/fit-score';
import {orderForComparison} from '@/ui/trong-pok/lib/comparison-order';
export function MockVisual({index}:{index:number}){return <div className={'mock-blender tone-'+index} aria-label="ภาพไอคอนสินค้าสมมติ"><svg width="64" height="96" viewBox="0 0 64 96" fill="none" aria-hidden="true"><path d="M15 10h34l-5 43H20z" fill="#fff" stroke="currentColor" strokeWidth="2"/><path d="M49 19h10v22H46M21 24h19M22 34h16M23 44h13" stroke="currentColor" strokeWidth="2"/><path d="m22 53-9 30q-1 7 6 7h26q7 0 6-7l-9-30z" fill="currentColor"/><circle cx="32" cy="73" r="6" fill="#fff"/></svg></div>}
function capacity(item:Evaluation){if(item.sourceDetails)return item.sourceDetails.capacityText;return item.product.mock?item.product.option:item.product.id==='electrolux'?'4–5 ก้อนต่อรอบ':item.verdict==='fail'?'ไม่รองรับน้ำแข็ง':'ยังไม่ยืนยัน'}
function productPrice({ id, price, priceText }: Evaluation["product"]) {
 return price !== null ? "฿" + price.toLocaleString("th-TH") : id === "hoffen" ? "ไม่พบราคาไทย" : priceText;
}

export default function Results({result:sourceResult,onReset,onBack,onConditions}:{result:ResearchResult;onReset:()=>void;onBack:()=>void;onConditions:(conditions:Conditions)=>void}){
 const result=resultCopy(sourceResult);
 const [openSection, setOpenSection] = useState<string | null>(null);
 const [evidence,setEvidence]=useState<Evaluation|null>(null);const {plan,mock}=result;const items=orderForComparison(result.items);
 const originalId=result.originalProductId||plan.target;const hasReviewData=items.some(item=>item.mockDetails&&Object.values(item.mockDetails.reviews).some(reviews=>reviews.length>0));
 const scenario=plan.conditions.container==='grinder'?'grinder':plan.conditions.cubes===12?'twelve':'five';
 function row(label:string,render:(item:Evaluation)=>ReactNode,className=''){return <tbody key={label}><tr className="row-label"><td colSpan={items.length}>{label}</td></tr><tr className={className}>{items.map(item=><td key={item.product.id} data-product-id={item.product.id}>{render(item)}</td>)}</tr></tbody>}
 function group(key:string,title:string){return <tbody key={key} data-group={key} className="compare-group"><tr><td colSpan={items.length}>{title}</td></tr></tbody>}
 function detailSection(key:string,title:string,content:ReactNode) {
  return <ComparisonDisclosure id={`result-panel-${key}`} title={title} open={openSection===key} span={items.length}
    onToggle={()=>setOpenSection(openSection===key?null:key)}>{content}</ComparisonDisclosure>;
 }
 const columns:ComparisonColumn[]=items.map((item,index)=>{
  const score=previewFitScore(index);
  return {
   id:item.product.id,title:item.product.name,price:productPrice(item.product),image:item.product.image,
   placeholder:<MockVisual index={index}/>,rank:item.rank,context:originalId===item.product.id?'รุ่นที่คุณส่งมา':'',
   fit:{value:score.value,tone:index===0?'high':index===2?'low':'pending',label:item.product.name+' ค่าทดลอง UI '+score.value+' เปอร์เซ็นต์ ไม่คำนวณจากหลักฐานและไม่ใช้จัดอันดับ'},
   action:item.product.storeUrl&&!item.product.mock
    ?<a className="product-action" href={item.product.storeUrl} target="_blank" rel="noopener noreferrer" aria-label={'ซื้อเลย '+item.product.name+' ที่ '+item.product.store+' (เปิดเว็บไซต์ภายนอก)'}>ซื้อเลย</a>
    :!item.product.mock&&item.product.id==='hoffen'
      ?<a className="product-action secondary" href="https://hoffen.com.pl/produkty/blender-z-bidonem/" target="_blank" rel="noopener noreferrer" aria-label="ดูข้อมูลรุ่น HOFFEN FB-3025 ที่เว็บไซต์ผู้ผลิต">ดูข้อมูลรุ่น</a>
      :<span className="purchase-note">ไม่มีลิงก์ซื้อ</span>,
  };
 });
 return <ComparisonResults headline={result.headline} reason={result.reason} mock={mock} onBack={onBack} onReset={onReset}
  notice={mock&&<span className="demo-label">รุ่น หลักฐาน และรีวิวสมมติ</span>}>
 {!mock&&!result.broadIce&&!plan.designPreview&&<label className="scenario-control">เปลี่ยนเงื่อนไข<select aria-label="เปลี่ยนเงื่อนไข" value={scenario} onChange={e=>onConditions({...plan.conditions,cubes:e.target.value==='twelve'?12:5,pulse:10,container:e.target.value==='grinder'?'grinder':'bottle600'})}><option value="five">ขวด 600 มล., 5 ก้อน, Pulse 10</option><option value="twelve">ขวด 600 มล., 12 ก้อน, Pulse 10</option><option value="grinder">โถบด, 5 ก้อน, Pulse 10</option></select></label>}
 <ComparisonTable columns={columns}>
 {!result.broadIce && group('match','ตรงโจทย์ '+plan.conditions.cubes+' ก้อน')}
 {row('เหตุผล',item=>!plan.ice&&!result.broadIce?item.reason:item.verdict==='fail'?item.reason:item.product.id==='electrolux'&&item.verdict==='pass'?'ปั่น 4–5 ก้อนในขวด 600 มล.':item.product.id==='electrolux-large'?'รองรับ 8–10 ก้อนในโถหลัก':'ยังไม่ยืนยันวิธีใช้นี้','reason-row')}
 {detailSection('usage', 'วิธีใช้และข้อจำกัด', <>
 {row('วิธีใช้ที่รองรับ',item=>item.sourceDetails?item.sourceDetails.method:item.mockDetails?<>5 ก้อน + น้ำ {item.mockDetails.waterMl} มล.<br/>Pulse 10 ครั้ง</>:item.product.id==='electrolux'?'ขวด 600 มล., 4–5 ก้อน, Pulse 10 ครั้ง':item.product.id==='hoffen'?'คู่มือไม่รองรับการบดน้ำแข็ง':'ยังยืนยันวิธีใช้ไม่ได้')}
 {row('ปริมาณตามคู่มือ',item=><p className="product-option">{capacity(item).replace('ก้อนต่อรอบ','ก้อน/รอบ')}</p>,'capacity-row')}
 {row('เงื่อนไขที่ต้องทำตาม',item=>item.sourceDetails?item.sourceDetails.conditions:item.mockDetails?'เติมน้ำ ใช้โถที่ให้มา ไม่ปั่นแห้ง':item.product.id==='electrolux'?'ใช้ภาชนะตามตาราง โถบดไม่มีคำแนะนำบดน้ำแข็ง':item.limitation)}
 {row('ข้อจำกัด',item=>item.limitation,'tradeoff-row')}
 </>)}
 {detailSection('evidence', 'เหตุผลและหลักฐาน', <>
 {group('ranking','เหตุผลและข้อแลกเปลี่ยน')}
 {row('ทำไมได้อันดับนี้',item=>item.reason)}
 {row('เหมาะกับใคร',item=>item.sourceDetails?.fitFor||item.mockDetails?.fitFor||'พิจารณาเฉพาะการใช้งานที่หลักฐานตรงรุ่นรองรับ')}
 {row('ถ้าจ่ายเพิ่มได้อะไร',item=>item.sourceDetails?.valueAdded||item.mockDetails?.valueAdded||'ยังไม่มีข้อมูลเทียบความคุ้มค่าที่มากกว่าราคาที่บันทึก')}
 {group('evidence',mock?'หลักฐานจำลอง: คู่มือ รูป คลิป':'คู่มือ รูป และวิดีโอ')}
 {row('หลักฐานจากคู่มือ',item=>item.evidence.find(e=>e.category==='คู่มือ')?.summary||'ข้อมูลไม่พอ')}
 {row('คลิป: สิ่งที่เห็นและยังไม่ยืนยัน',item=>item.sourceDetails?item.sourceDetails.clip:item.mockDetails?item.mockDetails.clipNote:'ยังไม่มีคลิปที่ยืนยันรุ่นและวิธีใช้ครบ')}
 {row('สิ่งที่เห็นในรูป',item=>item.sourceDetails?(item.product.id==='electrolux-large'?'ภาพจากหน้าผู้ผลิตตรงรุ่น':item.sourceDetails.photo):item.product.mock?'ไอคอนประกอบ ไม่ใช่ภาพทดสอบ':item.product.id==='simplus'?'ภาพหน้าร้าน ตัวเลือกโถแก้ว ไม่ยืนยันผลปั่น':'ภาพตรงรุ่นที่บันทึกไว้ ไม่ใช่ผลทดสอบ')}
 <tbody className="evidence-actions"><tr>{items.map(item=><td key={item.product.id} data-product-id={item.product.id}><button className="evidence-link" type="button" onClick={()=>setEvidence(item)} aria-label={'ดูหลักฐาน '+item.product.name}>ดูหลักฐาน ↗</button></td>)}</tr></tbody>
 </>)}
 {detailSection('stores', 'ร้านค้า ประกัน และรีวิว', <>
 {group('stores','ร้าน ราคา และบริการหลังซื้อ')}
 {row('ร้านค้า',item=>item.product.storeUrl?<><span>{item.product.store}</span><br/><a className="store-text-link" href={item.product.storeUrl} target="_blank" rel="noopener noreferrer">ดูหน้าร้าน ↗</a></>:item.product.store)}
 {row('ที่มาของราคา',item=>item.sourceDetails?item.sourceDetails.priceSource:item.product.mock?'ราคาในชุดข้อมูลสมมติ':item.product.id==='electrolux'?'ราคาอ้างอิง 20 พ.ย. 2569 เช็กอีกครั้งที่ร้าน':item.product.id==='simplus'?'ช่วงราคาสองตัวเลือกที่บันทึกไว้':'ยังไม่ยืนยันราคา')}
 {row('การคืนสินค้า',item=>item.sourceDetails?item.sourceDetails.returns:item.mockDetails?item.mockDetails.returnDays+' วัน เมื่อไม่ตรงรายการ ตามเงื่อนไขร้านสมมติ':'ยังไม่มีเงื่อนไขที่ยืนยันไว้')}
 {row('ประกัน',item=>item.sourceDetails?item.sourceDetails.warranty:item.mockDetails?(item.mockDetails.warrantyMonths?'มอเตอร์ '+item.mockDetails.warrantyMonths+' เดือน, สมมติ':'ยังไม่ยืนยันระยะประกัน'):'ยังไม่มีเงื่อนไขที่ยืนยันไว้')}
 {group('reviews',mock?'รีวิวจำลอง (คะแนน / 5 และจำนวน)':'รีวิว')}
 {!hasReviewData?<tbody className="review-empty"><tr><td colSpan={items.length}>ยังไม่มีข้อมูลรีวิวแยกสินค้า บริการ และจัดส่ง</td></tr></tbody>:(['สินค้า','บริการ','จัดส่ง'] as ReviewGroup[]).map(category=>row(category,item=>{const metric=item.mockDetails?reviewSummary(item.mockDetails.reviews[category]):null;return metric?<><strong>{metric.mean.toFixed(1)} / 5</strong><span className="review-count">n = {metric.n}</span><p className="review-topic">{item.mockDetails?.reviewNotes[category]}</p></>:'ไม่มีข้อมูลแยก'}))}
 </>)}

 </ComparisonTable>
 <EvidenceDialog item={evidence} onClose={()=>setEvidence(null)}/>
 </ComparisonResults>;
}
