import type { Claim, Label, Product, Requirement } from "../types";

export type Subject = Claim | Requirement;

export function labelWithRules(product: Product, subjects: Subject[]): Label[] {
  const segmenter = new Intl.Segmenter("th", { granularity: "word" });
  return product.reviews.filter((review) => !review.isTemplate).flatMap((review) => subjects.map((subject): Label => {
    const words = [...segmenter.segment(subject.text)].filter((part) => part.isWordLike && part.segment.length > 2 && !["ปั่น", "ได้", "โดย", "ไม่", "ต้อง", "ใช้"].includes(part.segment)).map((part) => part.segment);
    const sentences = review.text.split(/[.!?\n]+/).filter(Boolean);
    const sentence = sentences.find((text) => words.some((word) => text.includes(word)));
    const logistics = /ส่ง|ขนส่ง|กล่อง|ไรเดอร์/.test(review.text);
    const quote = sentence ?? review.text;
    const complaintText = quote.replace(/ไม่ไหม้|ไม่ดับ|ไม่พัง|เสียงไม่ดัง|ไม่เสียงดัง/g, "");
    const contradict = /ไม่|ไหม้|ดับ|พัง|ไม่ละเอียด|จกตา|ปกเทพ/.test(complaintText) || (/เสียงดัง/.test(complaintText) && /เสียง|เงียบ/.test(subject.text));
    return {
      reviewId: review.id,
      subjectId: subject.id,
      stance: logistics || !sentence ? "none" : contradict ? "contradict" : "confirm",
      target: logistics ? "logistics" : "product",
      quote,
    };
  }));
}
