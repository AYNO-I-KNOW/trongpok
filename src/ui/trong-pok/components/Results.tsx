'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {reviewSummary,type ReviewGroup} from '@/ui/trong-pok/lib/mock-details';
import type {Evaluation,ResearchResult,Conditions} from '@/ui/trong-pok/lib/types';
import EvidenceDialog from './EvidenceDialog';
import {resultCopy} from '@/ui/trong-pok/lib/result-copy';
import FitPill from './FitPill';
import {previewFitScore} from '@/ui/trong-pok/lib/fit-score';
import {orderForComparison} from '@/ui/trong-pok/lib/comparison-order';
function MockVisual({index}:{index:number}){return <div className={'mock-blender tone-'+index} aria-label="ภาพไอคอนสินค้าสมมติ"><svg width="64" height="96" viewBox="0 0 64 96" fill="none" aria-hidden="true"><path d="M15 10h34l-5 43H20z" fill="#fff" stroke="currentColor" strokeWidth="2"/><path d="M49 19h10v22H46M21 24h19M22 34h16M23 44h13" stroke="currentColor" strokeWidth="2"/><path d="m22 53-9 30q-1 7 6 7h26q7 0 6-7l-9-30z" fill="currentColor"/><circle cx="32" cy="73" r="6" fill="#fff"/></svg></div>}
function capacity(item:Evaluation){if(item.sourceDetails)return item.sourceDetails.capacityText;return item.product.mock?item.product.option:item.product.id==='electrolux'?'4–5 ก้อนต่อรอบ':item.verdict==='fail'?'ไม่รองรับน้ำแข็ง':'ยังไม่ยืนยัน'}
function productPrice({ id, price, priceText }: Evaluation["product"]) {
 return price !== null ? "฿" + price.toLocaleString("th-TH") : id === "hoffen" ? "ไม่พบราคาไทย" : priceText;
}

function sourcedReasons(item: Evaluation, fallback: string) {
 const reasons = item.evidence.filter(entry => entry.category === 'ข้อมูล');
 return reasons.length ? <>{reasons.map((entry, index) => <p key={index}>{entry.summary} {entry.url && <a className="store-text-link" href={entry.url} target="_blank" rel="noopener noreferrer" aria-label={'ดูแหล่งข้อมูล '+item.product.name+': '+entry.summary+' (เปิดเว็บไซต์ภายนอก)'}>แหล่งข้อมูล ↗</a>}</p>)}</> : fallback;
}

export default function Results({result:sourceResult,onReset,onBack,onConditions}:{result:ResearchResult;onReset:()=>void;onBack:()=>void;onConditions:(conditions:Conditions)=>void}){
 const result=sourceResult.searchKind?sourceResult:resultCopy(sourceResult);
 const live=Boolean(result.searchKind);
 const purchaseRow = useRef<HTMLTableSectionElement>(null);
 const [showPinnedProducts, setShowPinnedProducts] = useState(false);

 useEffect(() => {
  const row = purchaseRow.current;
  if (!row) return;
  const observer = new IntersectionObserver(([entry]) => {
   setShowPinnedProducts(entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0));
  }, { rootMargin: "-64px 0px 0px" });
  observer.observe(row);
  return () => observer.disconnect();
 }, []);

 const [openSection, setOpenSection] = useState<string | null>(null);
 const [evidence,setEvidence]=useState<Evaluation|null>(null);const {plan,mock}=result;const items=orderForComparison(result.items);
 const originalId=result.originalProductId||plan.target;const hasReviewData=items.some(item=>item.mockDetails&&Object.values(item.mockDetails.reviews).some(reviews=>reviews.length>0));
 const scenario=plan.conditions.container==='grinder'?'grinder':plan.conditions.cubes===12?'twelve':'five';
 function row(label:string,render:(item:Evaluation)=>ReactNode,className=''){return <tbody key={label}><tr className="row-label"><td colSpan={items.length}>{label}</td></tr><tr className={className}>{items.map(item=><td key={item.product.id} data-product-id={item.product.id}>{render(item)}</td>)}</tr></tbody>}
 function group(key:string,title:string){return <tbody key={key} data-group={key} className="compare-group"><tr><td colSpan={items.length}>{title}</td></tr></tbody>}
 function detailSection(key: string, title: string, content: ReactNode) {
  const expanded = openSection === key;
  return (
   <tbody className="result-section-toggle">
    <tr><td colSpan={items.length}>
     <button type="button" aria-expanded={expanded} aria-controls={`result-panel-${key}`} onClick={() => setOpenSection(expanded ? null : key)}>
      {title}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
       <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
     </button>
    </td></tr>
    <tr><td colSpan={items.length}>
     <div id={`result-panel-${key}`} className="result-detail-panel" data-expanded={expanded} inert={!expanded}>
      <div className="result-detail-clip">
       <table className="comparison" aria-label={title}>{content}</table>
      </div>
     </div>
    </td></tr>
   </tbody>
  );
 }
 return <section className={'results results-compare'+(mock?' mock-result':'')}><nav className="result-topbar" aria-label="การนำทางผลลัพธ์"><button className="back" type="button" onClick={onBack} aria-label="กลับหน้าแรก">←</button><button className="result-reset" type="button" onClick={onReset} aria-label="เริ่มใหม่"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button></nav><header className="result-heading"><h1>{result.headline}</h1><p>{result.reason}</p>{mock && <span className="demo-label">รุ่น หลักฐาน และรีวิวสมมติ</span>}</header>{!live&&!mock&&!result.broadIce&&!plan.designPreview&&<label className="scenario-control">เปลี่ยนเงื่อนไข<select aria-label="เปลี่ยนเงื่อนไข" value={scenario} onChange={e=>onConditions({...plan.conditions,cubes:e.target.value==='twelve'?12:5,pulse:10,container:e.target.value==='grinder'?'grinder':'bottle600'})}><option value="five">ขวด 600 มล., 5 ก้อน, Pulse 10</option><option value="twelve">ขวด 600 มล., 12 ก้อน, Pulse 10</option><option value="grinder">โถบด, 5 ก้อน, Pulse 10</option></select></label>}{showPinnedProducts && (
  <div className="pinned-products" aria-hidden="true">
   {items.map(({ product }) => (
    <div className="pinned-product" key={product.id}>
     <span className="pinned-product-name">{product.name}</span>
     <span className="pinned-product-price">{productPrice(product)}</span>
    </div>
   ))}
  </div>
 )}{items.length===0?<p className="purchase-note">ลองปรับคำค้นหรือเริ่มใหม่เพื่อค้นหาอีกครั้ง</p>:<table className="comparison" aria-label="เปรียบเทียบรุ่นตามโจทย์"><thead><tr>{items.map((item,index)=><th scope="col" key={item.product.id} data-product-id={item.product.id} data-recommendation-rank={item.rank||''}><div className="rank-slot"><img className="rank-mascot" src={'/assets/trong-pok-agent-rank-'+(index+1)+'.svg'} alt={'คอลัมน์ '+(index+1)} width="92" height="80"/></div><div className="product-image">{item.product.image?<img src={item.product.image} alt={item.product.name} width="104" height="120"/>:live?<span className="purchase-note">ยังไม่มีภาพตรงรุ่น</span>:<MockVisual index={index}/>}</div><h2>{item.product.name.includes(' ')?<><span className="product-brand">{item.product.name.split(' ')[0]}</span>{' '}<span className={live?undefined:"product-sku"}>{item.product.name.split(' ').slice(1).join(' ')}</span></>:item.product.name}</h2><div className="header-price">{live&&item.evidence.find(e=>e.category==='ร้าน')?.url?<a href={item.evidence.find(e=>e.category==='ร้าน')?.url} target="_blank" rel="noopener noreferrer">{productPrice(item.product)}</a>:productPrice(item.product)}</div><span className="model-context">{originalId===item.product.id?'รุ่นที่คุณส่งมา':''}</span></th>)}</tr></thead>
 {!live&&<tbody className="fit-label"><tr className="fit-score-row">{items.map((item,index)=>{const score=previewFitScore(index);return <td key={item.product.id} data-product-id={item.product.id}><FitPill value={score.value} tone={index===0?'high':index===2?'low':'pending'} label={item.product.name+' ค่าทดลอง UI '+score.value+' เปอร์เซ็นต์ ไม่คำนวณจากหลักฐานและไม่ใช้จัดอันดับ'}/></td>})}</tr></tbody>}
 <tbody className="purchase-section" ref={purchaseRow}><tr className="purchase-row">{items.map(item=><td key={item.product.id} data-product-id={item.product.id}>{item.product.storeUrl&&!item.product.mock?<a className="product-action" href={item.product.storeUrl} target="_blank" rel="noopener noreferrer" aria-label={(live?(result.searchKind==='demo'?'ดูข้อมูลเดโม ':'ดูสินค้า '):'ซื้อเลย ')+item.product.name+' ที่ '+item.product.store+' (เปิดเว็บไซต์ภายนอก)'}>{live?(result.searchKind==='demo'?'ดูข้อมูลเดโม':'ดูสินค้า'):'ซื้อเลย'}</a>:!item.product.mock&&item.product.id==='hoffen'?<><a className="product-action secondary" href="https://hoffen.com.pl/produkty/blender-z-bidonem/" target="_blank" rel="noopener noreferrer" aria-label="ดูข้อมูลรุ่น HOFFEN FB-3025 ที่เว็บไซต์ผู้ผลิต">ดูข้อมูลรุ่น</a></>:<span className="purchase-note">ไม่มีลิงก์ซื้อ</span>}</td>)}</tr></tbody>

 {!live&&!result.broadIce && group('match','ตรงโจทย์ '+plan.conditions.cubes+' ก้อน')}
 {row('เหตุผล',item=>live?sourcedReasons(item,item.reason):!plan.ice&&!result.broadIce?item.reason:item.verdict==='fail'?item.reason:item.product.id==='electrolux'&&item.verdict==='pass'?'ปั่น 4–5 ก้อนในขวด 600 มล.':item.product.id==='electrolux-large'?'รองรับ 8–10 ก้อนในโถหลัก':'ยังไม่ยืนยันวิธีใช้นี้','reason-row')}
 {detailSection('usage', 'วิธีใช้และข้อจำกัด', <>
 {row('วิธีใช้ที่รองรับ',item=>item.sourceDetails?item.sourceDetails.method:item.mockDetails?<>5 ก้อน + น้ำ {item.mockDetails.waterMl} มล.<br/>Pulse 10 ครั้ง</>:item.product.id==='electrolux'?'ขวด 600 มล., 4–5 ก้อน, Pulse 10 ครั้ง':item.product.id==='hoffen'?'คู่มือไม่รองรับการบดน้ำแข็ง':'ยังยืนยันวิธีใช้ไม่ได้')}
 {row(live?'ข้อมูลจำเพาะ':'ปริมาณตามคู่มือ',item=>live?sourcedReasons(item,capacity(item)):<p className="product-option">{capacity(item).replace('ก้อนต่อรอบ','ก้อน/รอบ')}</p>,'capacity-row')}
 {row('เงื่อนไขที่ต้องทำตาม',item=>item.sourceDetails?item.sourceDetails.conditions:item.mockDetails?'เติมน้ำ ใช้โถที่ให้มา ไม่ปั่นแห้ง':item.product.id==='electrolux'?'ใช้ภาชนะตามตาราง โถบดไม่มีคำแนะนำบดน้ำแข็ง':item.limitation)}
 {row('ข้อจำกัด',item=>item.limitation,'tradeoff-row')}
 </>)}
 {detailSection('evidence', 'เหตุผลและหลักฐาน', <>
 {group('ranking','เหตุผลและข้อแลกเปลี่ยน')}
 {row(live?'เหตุผลจากแหล่งข้อมูล':'ทำไมได้อันดับนี้',item=>live?sourcedReasons(item,item.reason):item.reason)}
 {row('เหมาะกับใคร',item=>item.sourceDetails?.fitFor||item.mockDetails?.fitFor||'พิจารณาเฉพาะการใช้งานที่หลักฐานตรงรุ่นรองรับ')}
 {row('ถ้าจ่ายเพิ่มได้อะไร',item=>item.sourceDetails?.valueAdded||item.mockDetails?.valueAdded||'ยังไม่มีข้อมูลเทียบความคุ้มค่าที่มากกว่าราคาที่บันทึก')}
 {group('evidence',mock?'หลักฐานจำลอง: คู่มือ รูป คลิป':'คู่มือ รูป และวิดีโอ')}
 {row(live?'ข้อมูลและแหล่งอ้างอิง':'หลักฐานจากคู่มือ',item=>live?<>{item.evidence.filter(e=>e.category==='ข้อมูล').map((e,index)=><p key={index}>{e.summary} {e.url&&<a className="store-text-link" href={e.url} target="_blank" rel="noopener noreferrer">แหล่งข้อมูล ↗</a>}</p>)}</>:item.evidence.find(e=>e.category==='คู่มือ')?.summary||'ข้อมูลไม่พอ')}
 {row('คลิป: สิ่งที่เห็นและยังไม่ยืนยัน',item=>item.sourceDetails?item.sourceDetails.clip:item.mockDetails?item.mockDetails.clipNote:'ยังไม่มีคลิปที่ยืนยันรุ่นและวิธีใช้ครบ')}
 {row('สิ่งที่เห็นในรูป',item=>item.sourceDetails?(item.product.id==='electrolux-large'?'ภาพจากหน้าผู้ผลิตตรงรุ่น':item.sourceDetails.photo):item.product.mock?'ไอคอนประกอบ ไม่ใช่ภาพทดสอบ':item.product.id==='simplus'?'ภาพหน้าร้าน ตัวเลือกโถแก้ว ไม่ยืนยันผลปั่น':'ภาพตรงรุ่นที่บันทึกไว้ ไม่ใช่ผลทดสอบ')}
 <tbody className="evidence-actions"><tr>{items.map(item=><td key={item.product.id} data-product-id={item.product.id}><button className="evidence-link" type="button" onClick={()=>setEvidence(item)} aria-label={'ดูหลักฐาน '+item.product.name}>ดูหลักฐาน ↗</button></td>)}</tr></tbody>
 </>)}
 {detailSection('stores', 'ร้านค้า ประกัน และรีวิว', <>
 {group('stores','ร้าน ราคา และบริการหลังซื้อ')}
 {row('ร้านค้า',item=>item.product.storeUrl?<><span>{item.product.store}</span><br/><a className="store-text-link" href={item.product.storeUrl} target="_blank" rel="noopener noreferrer">ดูหน้าร้าน ↗</a></>:item.product.store)}
 {row('ที่มาของราคา',item=>live?<>{item.sourceDetails?.priceSource} {item.evidence.find(e=>e.category==='ร้าน')?.url&&<a className="store-text-link" href={item.evidence.find(e=>e.category==='ร้าน')?.url} target="_blank" rel="noopener noreferrer">ดูที่มาของราคา ↗</a>}</>:item.sourceDetails?item.sourceDetails.priceSource:item.product.mock?'ราคาในชุดข้อมูลสมมติ':item.product.id==='electrolux'?'ราคาอ้างอิง 20 พ.ย. 2569 เช็กอีกครั้งที่ร้าน':item.product.id==='simplus'?'ช่วงราคาสองตัวเลือกที่บันทึกไว้':'ยังไม่ยืนยันราคา')}
 {row('การคืนสินค้า',item=>item.sourceDetails?item.sourceDetails.returns:item.mockDetails?item.mockDetails.returnDays+' วัน เมื่อไม่ตรงรายการ ตามเงื่อนไขร้านสมมติ':'ยังไม่มีเงื่อนไขที่ยืนยันไว้')}
 {row('ประกัน',item=>item.sourceDetails?item.sourceDetails.warranty:item.mockDetails?(item.mockDetails.warrantyMonths?'มอเตอร์ '+item.mockDetails.warrantyMonths+' เดือน, สมมติ':'ยังไม่ยืนยันระยะประกัน'):'ยังไม่มีเงื่อนไขที่ยืนยันไว้')}
 {group('reviews',mock?'รีวิวจำลอง (คะแนน / 5 และจำนวน)':'รีวิว')}
 {!hasReviewData?<tbody className="review-empty"><tr><td colSpan={items.length}>{live?'ข้อมูลไม่พอ — ยังไม่มีข้อมูลรีวิวแยกสินค้า บริการ และจัดส่ง':'ยังไม่มีข้อมูลรีวิวแยกสินค้า บริการ และจัดส่ง'}</td></tr></tbody>:(['สินค้า','บริการ','จัดส่ง'] as ReviewGroup[]).map(category=>row(category,item=>{const metric=item.mockDetails?reviewSummary(item.mockDetails.reviews[category]):null;return metric?<><strong>{metric.mean.toFixed(1)} / 5</strong><span className="review-count">n = {metric.n}</span><p className="review-topic">{item.mockDetails?.reviewNotes[category]}</p></>:'ไม่มีข้อมูลแยก'}))}
 </>)}

</table>}<EvidenceDialog item={evidence} onClose={()=>setEvidence(null)}/></section>
}
