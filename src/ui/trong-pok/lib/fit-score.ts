export function previewFitScore(column:number):{value:number;reason:string}{
 const values=[80,50,20];
 if(!Number.isInteger(column)||column<0||column>=values.length)throw new RangeError('Unknown comparison column');
 return {value:values[column],reason:'ค่าตัวอย่าง UI ไม่คำนวณจากหลักฐานและไม่ใช้จัดอันดับ'};
}
