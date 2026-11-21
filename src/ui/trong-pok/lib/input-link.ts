export type InputLink={url:string;host:string;path:string};
export function parseInputLink(value:string):InputLink|null{
 if(!/^https?:\/\/\S+$/i.test(value))return null;
 try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password)return null;
 return {url:value,host:url.host,path:url.pathname==='/'&&!url.search&&!url.hash?'':url.pathname+url.search+url.hash};
 }catch{return null}
}
export function detectInputLinks(value:string){return (value.match(/https?:\/\/[^\s]+/gi)||[]).map(parseInputLink).filter((link):link is InputLink=>link!==null)}
