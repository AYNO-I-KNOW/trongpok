import {mockDetails} from './mock-details';
import {products,mockProducts} from './products';
import type {Conditions,Evaluation,Plan,Product,ResearchResult} from './types';
export function evaluate(product:Product,conditions:Conditions):Evaluation{
 const c=conditions;
 const evidence:Evaluation['evidence']=[
 {category:'คู่มือ',summary:product.id==='simplus'?'หน้าเอกสารตรงรุ่น แต่ตรวจซ้ำครั้งนี้ยังอ่านข้อความข้อจำกัดไม่ได้':product.id==='hoffen'?'หน้า 20 ระบุว่าไม่ได้ออกแบบสำหรับบดน้ำแข็ง':'หน้า 13: ขวด 600 มล. น้ำแข็ง 4–5 ก้อน Pulse 10 ครั้ง',url:product.manualUrl,label:'เปิดคู่มือผู้ผลิต'},
 {category:'สื่อ',summary:product.id==='simplus'?'ภาพที่บันทึกจากหน้าร้าน: ตัวเลือกโถแก้ว ไม่ได้ใช้รูปยืนยันผลบดน้ำแข็ง':'ภาพตรงรุ่นที่บันทึกไว้ ไม่ใช่ผลทดสอบหรือคลิปสาธิต'},
 {category:'รีวิว',summary:'ข้อมูลไม่พอ: ไม่มีชุดรีวิวพร้อมจำนวน แยกสินค้า / บริการร้าน / จัดส่งและแพ็ก'},
 {category:'ร้าน',summary:product.id==='electrolux'?'ลิงก์หน้าผู้ผลิตตรงรุ่น ยังไม่ได้บันทึกค่าส่งหรือเงื่อนไขคืนสินค้า':product.id==='simplus'?'ชื่อผู้ขายที่บันทึก: Simplus Electric ยังไม่ยืนยันสถานะร้านทางการและการคืนสินค้า':'ยังไม่มีร้านในไทยที่ยืนยันไว้',url:product.storeUrl,label:'ดูแหล่งที่มาร้าน'}];
 if(product.id==='electrolux-large')return {product,verdict:'unknown',reason:'คู่มือระบุโถหลัก 8–10 ก้อน แต่ต้องตรวจเงื่อนไขที่ถาม',limitation:'ยังใช้ตอบเงื่อนไขจำนวนก้อนหรือโถบดเฉพาะไม่ได้',evidence:[{category:'คู่มือ',summary:'คู่มือหน้า 14: โถหลัก 8–10 ก้อน · โปรแกรมบดน้ำแข็ง หรือ Pulse 10 ครั้ง',url:product.manualUrl,label:'เปิดคู่มือผู้ผลิต'},{category:'สื่อ',summary:'ภาพที่ผู้ผลิตใช้ในหน้า SKU ไทย EAN 7332543823918',url:product.storeUrl,label:'ดูหน้ารุ่น'},{category:'รีวิว',summary:'ไม่มีข้อมูลแยกสินค้า บริการ และจัดส่งที่ยืนยันไว้'},{category:'ร้าน',summary:'Electrolux Thailand · ราคาอ้างอิง ไม่ใช่ราคาสด',url:product.storeUrl,label:'ดูร้าน'}]};
 if(product.id==='hoffen')return {product,verdict:'fail',reason:'คู่มือระบุว่าไม่ได้ออกแบบให้บดน้ำแข็ง',limitation:'ไม่ใช้ปั่นน้ำแข็งตามโจทย์นี้',evidence};
 if(product.id==='simplus')return {product,verdict:'unknown',reason:'ยังอ่านข้อจำกัดจากคู่มือที่ตรวจซ้ำได้ไม่ครบ',limitation:'ยังยืนยันการใช้งานกับน้ำแข็งไม่ได้',evidence};
 if(c.container!=='bottle600')return {product,verdict:'unknown',reason:'ไม่มีคำแนะนำบดน้ำแข็งสำหรับโถบดในหลักฐานนี้',limitation:'ยังยืนยันไม่ได้ ไม่ได้แปลว่าคู่มือห้าม',evidence};
 if(c.cubes===null||c.pulse===null)return {product,verdict:'unknown',reason:'ข้อมูลจำนวนก้อนหรือวิธีกดยังไม่ครบ',limitation:'ต้องตรวจเงื่อนไขก่อนเลือก',evidence};
 if(c.cubes>5)return {product,verdict:'fail',reason:'เกินปริมาณที่คู่มือระบุ',limitation:'คู่มือระบุ 4–5 ก้อนต่อรอบ ไม่ได้ยืนยัน 12 ก้อนรอบเดียว',evidence};
 if(c.cubes<4||c.pulse!==10)return {product,verdict:'unknown',reason:'เงื่อนไขต่างจากตารางที่ยืนยันไว้',limitation:'หลักฐานที่มีระบุ 4–5 ก้อน และ Pulse 10 ครั้ง',evidence};
 return {product,verdict:'pass',reason:'ตรงเงื่อนไขในคู่มือผู้ผลิต',limitation:'ขวด 600 มล. · 4–5 ก้อน · Pulse 10 ครั้ง',evidence};
}
export interface ResearchService{
 inspectOriginal(plan:Plan):Promise<Evaluation[]>;
 findWithinBudget(plan:Plan):Promise<Evaluation[]>;
 findBestFit(plan:Plan):Promise<Evaluation[]>;
}
export const fixtureService:ResearchService={
 async inspectOriginal(plan){return plan.target?[evaluate(products[plan.target],plan.conditions)]:[]},
 async findWithinBudget(plan){return Object.values(products).filter(p=>p.price!==null&&(plan.conditions.budget===null||p.price<=plan.conditions.budget)).map(p=>evaluate(p,plan.conditions))},
 async findBestFit(plan){return Object.values(products).map(p=>evaluate(p,plan.conditions))}
};
export function challengeAndRank(items:Evaluation[],budget:number|null):Evaluation[]{
 const unique=[...new Map(items.map(item=>[item.product.id,item])).values()];
 const passes=unique.filter(item=>item.verdict==='pass'&&(budget===null||item.product.price!==null&&item.product.price<=budget)).sort((a,b)=>(a.product.price??Infinity)-(b.product.price??Infinity));
 return unique.map(item=>({...item,rank:passes.findIndex(p=>p.product.id===item.product.id)>=0?passes.findIndex(p=>p.product.id===item.product.id)+1:undefined}));
}
export async function research(plan:Plan,signal?:AbortSignal,service:ResearchService=fixtureService):Promise<ResearchResult>{
 if(plan.broadIce)return manufacturerExample(plan);
 if(!plan.supported||plan.needsContext)throw new Error('Unsupported or incomplete plan');
 const work=await Promise.all([service.inspectOriginal(plan),service.findWithinBudget(plan),service.findBestFit(plan)]);
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 const items=challengeAndRank(work.flat(),plan.conditions.budget).slice(0,3),winner=items.find(item=>item.rank===1);
 return {plan,items,originalProductId:plan.target||undefined,winner,mock:false,headline:winner?'แนะนำ '+winner.product.name:'ยังไม่มีรุ่นที่ผ่านโจทย์นี้',reason:winner?winner.limitation:'ดูข้อจำกัดแยกรุ่นก่อนตัดสินใจ'};
}
export function rankingExample():ResearchResult{
 const plan:Plan={raw:'ปั่นสมูทตี้ใส่น้ำแข็ง 5 ก้อนต่อรอบ งบ 2,500 บาท',target:null,supported:true,ice:true,conditions:{cubes:5,container:'bottle600',pulse:10,budget:2500},needsContext:false};
 const items=challengeAndRank(mockProducts.map((product,index):Evaluation=>({product,verdict:'pass',mockDetails:mockDetails[product.id],reason:['ผ่านโจทย์และราคาต่ำสุดในชุดนี้','เพิ่มความจุต่อรอบ แลกกับราคาที่สูงขึ้น','จุได้มากสุด แต่เกินความจำเป็นของโจทย์ 5 ก้อน'][index],limitation:['สูงสุด 6 ก้อน · พัก 1 นาที','สูงสุด 8 ก้อน · โถเฉพาะรุ่น','สูงสุด 12 ก้อน · เครื่องใหญ่กว่า'][index],evidence:[{category:'คู่มือ',summary:`เอกสารสมมติ M${index+1}: รองรับน้ำแข็งไม่เกิน ${product.capacity} ก้อนต่อรอบ เฉพาะโถที่กำหนด`},{category:'สื่อ',summary:mockDetails[product.id].clipNote+' · เป็นคำบรรยายเพื่อทดลองดีไซน์ ไม่มีไฟล์คลิปจริง'},{category:'รีวิว',summary:'คะแนนจากชุดรีวิวจำลอง แยกสินค้า บริการ และจัดส่ง ไม่ใช่รีวิว Shopee และไม่ใช้จัดอันดับ'},{category:'ร้าน',summary:product.store+' · เงื่อนไขร้านและประกันเป็นข้อมูลสมมติ ไม่มีลิงก์ซื้อหรือธุรกรรมจริง'}]})),plan.conditions.budget);
 return {plan,items,winner:items.find(item=>item.rank===1),mock:true,headline:'แนะนำ Buddy Mini M1',reason:'ผ่านโจทย์ 5 ก้อน · ราคาต่ำสุดใน 3 ตัวเลือก'};
}
export function manufacturerExample(input?:Plan):ResearchResult{
 const plan:Plan=input||{raw:'อยากปั่นน้ำแข็งสำหรับสมูทตี้ เลือกรุ่นไหนดี',target:'hoffen',supported:true,ice:true,conditions:{cubes:null,container:'unknown',pulse:null,budget:null},needsContext:false,broadIce:true};
 const originalProduct=products[plan.target||'hoffen'];const original=evaluate(originalProduct,plan.conditions),small=evaluate(products.electrolux,{cubes:5,container:'bottle600',pulse:10,budget:null}),large=evaluate(products['electrolux-large'],plan.conditions);
 if(original.product.id==='hoffen')original.sourceDetails={fitFor:'ใช้ทำเครื่องดื่มที่ไม่ต้องบดน้ำแข็ง ไม่ตรงโจทย์นี้',valueAdded:'ยังไม่ยืนยันราคาในไทย จึงเทียบส่วนต่างไม่ได้',capacityText:'ไม่รองรับน้ำแข็ง',method:'ไม่ควรใช้กับน้ำแข็งตามคู่มือ',conditions:'ขวด 600 มล. ไม่ใช่หลักฐานว่าบดน้ำแข็งได้',photo:'ภาพตรงรุ่นที่บันทึกจากต้นแบบ ไม่ใช่ภาพทดสอบ',clip:'ยังไม่พบคลิปยืนยันวิธีใช้ตรงรุ่น',returns:'ยังไม่ยืนยันการคืนสินค้าในไทย',warranty:'ยังไม่ยืนยันประกันในไทย',priceSource:'ยังไม่ยืนยันราคาในไทย'};
 small.reason='มีคู่มือระบุวิธีใช้ชัด และราคาอ้างอิงต่ำกว่าทางเลือกอีกตัว';small.sourceDetails={fitFor:'สมูทตี้แก้วเดียวและขวดพกพา',valueAdded:'ราคาอ้างอิงต่ำกว่ารุ่นโถใหญ่ ฿800',capacityText:'4–5 ก้อนต่อรอบ',method:'ขวด 600 มล. · Pulse 10 ครั้ง',conditions:'ใช้ภาชนะตามตาราง ไม่ใช้โถบดเครื่องเทศอ้างอิงแทน',photo:'ภาพจากหน้าผู้ผลิต ตรงรุ่น E3CB1-630S',clip:'ยังไม่พบคลิปที่ยืนยันจำนวนก้อนและรหัสรุ่นครบ',returns:'ยังไม่มีเงื่อนไขคืนสินค้าที่บันทึกไว้',warranty:'ประกันสินค้าทั่วไป 2 ปี ตามหน้าไทย',priceSource:'เว็บไซต์ Electrolux ไทย · 20 พ.ย. 2569 ไม่ใช่ราคาสด'};
 large.verdict='pass';large.reason='ผู้ผลิตระบุโปรแกรมบดน้ำแข็ง เหมาะเมื่ออยากได้โถใหญ่';large.limitation='โถหลัก 8–10 ก้อน · โปรแกรมบดน้ำแข็ง หรือ Pulse 10 ครั้ง';large.sourceDetails={fitFor:'ทำหลายแก้วและมีพื้นที่วางโถใหญ่',valueAdded:'เพิ่ม ฿800 จาก E3 ได้โถแก้ว 1.75 ลิตรและโปรแกรมบดน้ำแข็ง',capacityText:'8–10 ก้อนต่อรอบ',method:'โถหลัก · โปรแกรมบดน้ำแข็ง หรือ Pulse 10 ครั้ง',conditions:'ปริมาณ 1.75 ลิตรเป็นสูตรสมูทตี้ ไม่ใช่ปริมาณน้ำแข็ง ไม่ใช้โถบดแทนโถหลัก',photo:'ภาพจากหน้าผู้ผลิตของ E5TB1-710K · ชื่อไฟล์ 711K',clip:'ยังไม่พบคลิปที่ยืนยันจำนวนก้อนต่อรอบ',returns:'ยังไม่มีเงื่อนไขคืนสินค้าที่บันทึกไว้',warranty:'ประกันสินค้าทั่วไป 2 ปี ตามหน้าไทย',priceSource:'เว็บไซต์ Electrolux ไทย · 20 พ.ย. 2569 ไม่ใช่ราคาสด'};
 const items=challengeAndRank([original,small,large],plan.conditions.budget),winner=items.find(item=>item.rank===1);
 return {plan,items,originalProductId:originalProduct.id,winner,mock:false,broadIce:true,headline:winner?'แนะนำ '+winner.product.name:'ยังไม่มีตัวเลือกในงบ',reason:original.verdict==='fail'?'รุ่นต้นทางไม่รองรับน้ำแข็ง · เทียบ 2 ทางเลือก':'เทียบวิธีใช้และราคาอ้างอิงจากผู้ผลิต'};
}
export function researchDesignPreview(plan:Plan):ResearchResult{
 const reference=manufacturerExample();const items=challengeAndRank(reference.items.map(base=>{
  let evaluation=evaluate(base.product,plan.conditions);
  if(base.product.id==='electrolux-large'&&plan.conditions.container==='mainJar'&&plan.conditions.cubes!==null){const n=plan.conditions.cubes;evaluation={...evaluation,verdict:n>10?'fail':n>0?'pass':'unknown',reason:n>10?'เกินปริมาณที่คู่มือระบุ':'คู่มือรองรับน้ำแข็งในโถหลัก',limitation:'โถหลักไม่เกิน 8–10 ก้อน โปรแกรมบดน้ำแข็ง หรือ Pulse 10 ครั้ง'}};
  if(!plan.ice)evaluation={...evaluation,verdict:'unknown',reason:'หลักฐานชุดนี้ยืนยันเฉพาะการใช้งานกับน้ำแข็ง',limitation:'ยังไม่มีหลักฐานที่ตอบการใช้งานนี้โดยตรง'};
  return {...evaluation,sourceDetails:base.sourceDetails};
 }),plan.conditions.budget);const winner=items.find(i=>i.rank===1);
 return {plan,items,originalProductId:plan.target||undefined,winner,mock:false,broadIce:false,headline:winner?'แนะนำ '+winner.product.name:'ยังไม่มีรุ่นที่ผ่านโจทย์นี้',reason:winner?winner.limitation:'ดูข้อจำกัดและหลักฐานของแต่ละรุ่น'};
}
