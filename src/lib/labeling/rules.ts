import type { Claim, Label, Product, Requirement } from "../types";

export type Subject = Claim | Requirement;

const thaiDigits: Record<string, number> = {
  ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4,
  ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9,
};
const unitDays: Record<string, number> = { สัปดาห์: 7, อาทิตย์: 7, เดือน: 30, ปี: 365, วัน: 1 };

function durationAmount(value: string) {
  if (/^\d/.test(value)) return Number(value);
  const [tens, ones] = value.split("สิบ");
  if (ones !== undefined) return (tens ? thaiDigits[tens] ?? 0 : 1) * 10 + (thaiDigits[ones] ?? 0);
  return thaiDigits[value] ?? 0;
}

export function reviewUsage(text: string): Label["usage"] {
  if (/เพิ่งได้รับ|ยังไม่ได้ลอง|แกะกล่อง/.test(text)) return "unboxing";
  const normalized = text.replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 3664));
  const durations = [...normalized.matchAll(/(\d+(?:\.\d+)?|(?:ยี่|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)?สิบ(?:เอ็ด|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)?|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)\s*(สัปดาห์|อาทิตย์|เดือน|ปี|วัน)/g)];
  return durations.some((match) => {
    const prefix = normalized.slice(0, match.index);
    const recentContext = prefix.split(/[,.!?\n]/).at(-1) ?? "";
    const lastUnrelated = [...recentContext.matchAll(/รับประกัน|ประกัน|จัดส่ง|ขนส่ง|ส่งมา|รอของ|แบตใช้ได้|แบตอยู่ได้/g)].at(-1)?.index ?? -1;
    const lastUse = [...recentContext.matchAll(/ใช้มา|ลองมา|ติดไป|หายไป|ใช้งานมา/g)].at(-1)?.index ?? -1;
    return (lastUnrelated === -1 || lastUse > lastUnrelated) && durationAmount(match[1]) * unitDays[match[2]] >= 14;
  }) ? "long" : "short";
}

export function reviewSpecific(text: string) {
  return text.replace(/ใช้ได้ผล|ส่งไว|แนะนำ|ดี|มาก|ค่ะ|ครับ/g, "").length >= 25;
}

export function iceReviewRelevant(text: string) {
  const explicitIce = /น้ำแข็ง/.test(text);
  const dailyShopUse = /ร้าน|ขาย/.test(text) && /วันละ[^.!?\n]{0,35}แก้ว/.test(text);
  const actualUse = /(?:ใช้|ทำร้าน|เปิดร้าน|ขาย|ปั่น)[^.!?\n]{0,20}(?:มา|ครบ|ต่อเนื่อง)/.test(text);
  const operationalOutcome = /เครื่องตัด|มอเตอร์(?:ไม่)?(?:ไหม้|ดับ|ตัด)|เดินเรียบ/.test(text);
  return explicitIce || (dailyShopUse && actualUse && operationalOutcome);
}

export function isBlenderIceRequirement(category: string, subject: Subject) {
  return category === "blender" && "kind" in subject && /น้ำแข็ง/.test(subject.text);
}

function iceStance(text: string, usage: Label["usage"]): Label["stance"] {
  if (usage === "unboxing" || !iceReviewRelevant(text)) return "none";
  const complaint = text.replace(/(?:มอเตอร์)?ไม่(?:เคย)?(?:มี)?กลิ่นไหม้|มอเตอร์ไม่ไหม้|ไม่ไหม้|ไม่เคยเครื่องตัด|มอเตอร์ไม่ตัด|ไม่เจอเกล็ดใหญ่|ไม่เคยลองขายทั้งวัน/g, "");
  if (/ไหม้|ดับ|เครื่องตัด|ใบมีดติด|ไม่ละเอียด|เหลือเศษ|ปั่นหลายรอบ|สั่นทั้งโต๊ะ/.test(complaint)) return "contradict";
  return /เนียน|ละเอียด|หมุนปกติ|ไม่ไหม้|ไม่เคยเครื่องตัด|มอเตอร์ไม่ตัด|เดินเรียบ|ไม่มีกลิ่นไหม้/.test(text) ? "confirm" : "none";
}

function quietStance(text: string, usage: Label["usage"]): Label["stance"] {
  if (usage === "unboxing") return "none";
  const quiet = /เสียงไม่ดัง(?:จน[^.!?\n]{0,15}ตื่น)?|เสียง.{0,8}เบา|ไม่รบกวน|ไม่ได้ยินเสียง|เสียง.{0,8}เงียบ/g;
  const complaints = text.replace(quiet, "");
  if (/เสียง.{0,20}(?:ดัง|ลอดไป|รบกวน|แหลม)|(?:เสียง|ปั่น).{0,20}จน.{0,12}ตื่น/.test(complaints)) return "contradict";
  return quiet.test(text) ? "confirm" : "none";
}

export function labelWithRules(product: Product, subjects: Subject[]): Label[] {
  const segmenter = new Intl.Segmenter("th", { granularity: "word" });
  return product.reviews.filter((review) => !review.isTemplate).flatMap((review) => {
    const usage = reviewUsage(review.text);
    const specific = reviewSpecific(review.text);
    return subjects.map((subject): Label => {
      const words = [...segmenter.segment(subject.text)].filter((part) => part.isWordLike && part.segment.length > 2 && !["ปั่น", "ได้", "โดย", "ไม่", "ต้อง", "ใช้"].includes(part.segment)).map((part) => part.segment);
      const sentences = review.text.split(/[.!?\n]+/).filter(Boolean);
      const sentence = sentences.find((text) => words.some((word) => text.includes(word)));
      const logistics = /ส่ง|ขนส่ง|กล่อง|ไรเดอร์/.test(review.text.replaceAll("แกะกล่อง", ""));
      const quote = sentence ?? review.text;
      const complaintText = quote.replace(/ไม่ไหม้|ไม่ดับ|ไม่พัง|ไม่ละลาย|ไม่เยิ้ม|ไม่เหม็น|ไม่กลับมา|เสียงไม่ดัง|ไม่เสียงดัง/g, "");
      const contradict = /ไม่|ไหม้|ดับ|พัง|ไม่ละเอียด|ละลาย|เยิ้ม|เหม็น|กลับมา|จกตา|ปกเทพ/.test(complaintText) || (/เสียงดัง/.test(complaintText) && /เสียง|เงียบ/.test(subject.text));
      const isIceRequirement = isBlenderIceRequirement(product.category, subject);
      const isQuietRequirement = product.category === "blender" && "kind" in subject && subject.id === "quiet";
      const stance = isIceRequirement ? iceStance(review.text, usage)
        : isQuietRequirement ? quietStance(review.text, usage)
        : !sentence ? "none" : contradict ? "contradict" : "confirm";
      return {
        reviewId: review.id,
        subjectId: subject.id,
        stance: logistics ? "none" : stance,
        target: logistics ? "logistics" : "product",
        quote: isIceRequirement || isQuietRequirement ? review.text : quote,
        usage,
        specific,
      };
    });
  });
}
