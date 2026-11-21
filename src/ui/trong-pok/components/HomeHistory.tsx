'use client';
import {historyResult,type HistoryEntry} from '@/ui/trong-pok/lib/history';
export default function HomeHistory({items,onOpen}:{items:HistoryEntry[];onOpen:(entry:HistoryEntry)=>void}){
 if(!items.length)return null;
 return <><h2>ที่ดูล่าสุด</h2><div className="history-list">{items.map(entry=>{const result=historyResult(entry),item=result.winner||result.items.find(i=>i.product.id===(entry.version===1?entry.target:null))||result.items[0];return <button type="button" className="history-card" key={entry.key} onClick={()=>onOpen(entry)} aria-label={'เปิดผลที่บันทึกไว้ '+item.product.name}>{item.product.image&&<img src={item.product.image} width="44" height="56" alt=""/>}<span><span className="history-model">{item.product.name}</span><span className="history-price">{item.product.price===null?'ไม่พบราคาไทย':'฿'+item.product.price.toLocaleString('th-TH')+' (อ้างอิง)'}</span>{entry.version===1&&!result.winner&&<span className="history-price">ยังไม่มีรุ่นแนะนำ</span>}</span></button>})}</div></>
}
