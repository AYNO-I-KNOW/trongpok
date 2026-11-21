'use client';
import {historyResult,type SearchHistoryEntry} from '@/ui/trong-pok/lib/history';
export default function HomeHistory({items,onOpen}:{items:SearchHistoryEntry[];onOpen:(entry:SearchHistoryEntry)=>void}){
 if(!items.length)return null;
 return <><h2>ที่ดูล่าสุด</h2><div className="history-list">{items.map(entry=>{const {product}=historyResult(entry).items[0];return <button type="button" className="history-card" key={entry.key} onClick={()=>onOpen(entry)} aria-label={'เปิดผลที่บันทึกไว้ '+product.name}>{product.image&&<img src={product.image} width="44" height="56" alt=""/>}<span><span className="history-model">{product.name}</span><span className="history-price">{product.price===null?'ไม่พบราคาไทย':'฿'+product.price.toLocaleString('th-TH')+' (อ้างอิง)'}</span></span></button>})}</div></>
}
