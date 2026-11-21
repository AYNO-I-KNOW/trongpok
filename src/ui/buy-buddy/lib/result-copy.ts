export function resultCopy<T>(value:T,key=''):T{
 if(typeof value==='string')return (key==='raw'||/url$/i.test(key)?value:value.replace(/\s*·\s*/g,', ')) as T;
 if(Array.isArray(value))return value.map(entry=>resultCopy(entry)) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,entry])=>[name,resultCopy(entry,name)])) as T;
 return value;
}
