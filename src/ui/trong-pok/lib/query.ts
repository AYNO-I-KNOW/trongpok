import type {Conditions,Plan,ProductId} from './types';
export function resolveProductURL(raw:string):ProductId|null{
 try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)return null;
 const host=u.hostname.toLowerCase(),path=decodeURIComponent(u.pathname).replace(/\/+$/,'');
 if(['shopee.co.th','www.shopee.co.th'].includes(host)){
 const ids=path.match(/-i\.(\d+)\.(\d+)$/)||path.match(/^\/product\/(\d+)\/(\d+)$/);
 if(!ids||ids[1]!=='498791076'||ids[2]!=='12781309334')return null;
 for(const [k,v] of u.searchParams){const key=k.toLowerCase().replace(/_/g,'');if((key==='shopid'&&v!==ids[1])||(key==='itemid'&&v!==ids[2]))return null}return 'simplus'}
 if(['www.electrolux.co.th','electrolux.co.th'].includes(host)){if(path==='/appliances/blenders-juicers/e3cb1-630s')return 'electrolux';if(path==='/appliances/blenders-juicers/e5tb1-710k')return 'electrolux-large'}
 if(['hoffen.com.pl','www.hoffen.com.pl'].includes(host)&&path==='/produkty/blender-z-bidonem')return 'hoffen';
 if(host==='arena.pl'&&path==='/oferta/blender-z-przenosnym-bidonem-hoffen-fb-3025-56569426')return 'hoffen';return null
 }catch{return null}
}
export function parseConditions(text:string):Conditions{
 const cubes=text.match(/(\d+)\s*ก้อน/),pulse=text.match(/pulse\s*(\d+)|พัลส์\s*(\d+)/i),budget=text.match(/(?:งบ|ไม่เกิน)\s*([\d,]+)/);
 return {cubes:cubes?Number(cubes[1]):null,container:/โถบด|grinder/i.test(text)?'grinder':/600\s*(?:มล|ml)|ขวด\s*600/i.test(text)?'bottle600':'unknown',pulse:pulse?Number(pulse[1]||pulse[2]):null,budget:budget?Number(budget[1].replaceAll(',','')):null};
}
export function planQuery(raw:string):Plan{
 const urls=raw.match(/https?:\/\/[^\s]+/gi)||[],text=urls.reduce((s,url)=>s.replace(url,''),raw).trim();
 const resolved=urls.map(resolveProductURL);let target:ProductId|null=null;
 if(urls.length&&resolved.every(id=>id!==null&&id===resolved[0]))target=resolved[0];
 if(!urls.length){if(/\bE3CB1-630S\b/i.test(text))target='electrolux';else if(/\bE5TB1-710K\b/i.test(text))target='electrolux-large';else if(/\bDDJR003\b/i.test(text))target='simplus';else if(/\bFB-3025\b/i.test(text))target='hoffen'}
 const ice=/น้ำแข็ง|ice\s*(?:crush|cube)/i.test(text),generic=/เครื่องปั่น|ปั่นน้ำแข็ง|บดน้ำแข็ง/.test(text)&&!/(?:หูฟัง|รองเท้า|ตู้เย็น)/.test(text);
 const supported=urls.length?target!==null:target!==null||generic;
 const conditions=parseConditions(text),broadIce=ice&&/สมูทตี้|เลือกรุ่นไหนดี|ไม่กำหนดจำนวน/.test(text)&&conditions.cubes===null;return {raw,target,supported,ice,conditions,broadIce,needsContext:supported&&!broadIce&&(!ice||conditions.cubes===null||conditions.container==='unknown'||conditions.pulse===null)};
}
export function completePlan(plan:Plan,answer:string):Plan|null{
 if(/สมูทตี้|เลือกรุ่นไหนดี|ไม่กำหนดจำนวน/.test(answer)&&/น้ำแข็ง/.test(answer)&&!parseConditions(answer).cubes)return {...plan,ice:true,broadIce:true,needsContext:false};
 const fields=parseConditions(answer),combined={...plan.conditions};
 for(const key of ['cubes','pulse','budget'] as const)if(fields[key]!==null)combined[key]=fields[key];
 if(fields.container!=='unknown')combined.container=fields.container;
 if(!/น้ำแข็ง|ice/i.test(answer)&&!plan.ice)return null;
 if(combined.cubes===null||combined.container==='unknown'||combined.pulse===null)return null;
 return {...plan,ice:true,conditions:combined,needsContext:false};
}
