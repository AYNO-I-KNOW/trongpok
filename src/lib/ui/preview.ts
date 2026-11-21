import type { AgentEvent, ArenaResult, CategoryPack, Label, Product, Requirement } from "../types";
import { rank, specCheck } from "../scoring";

const shops = {
  id: "preview-shop", name: "ร้านค้าจำลอง", years: 2, badRatePct: 2,
  official: false, preferredPlus: false, verified: true, chatResponsePct: 95,
};
const blenderSeeds = [
  { title: "Daily Blend", price: 890, stars: 4.8, specs: { watt: 600, capacityL: 1.5, dryGrinder: false } },
  { title: "Everyday Pro", price: 2790, stars: 4.6, specs: { watt: 1200, capacityL: 1.8, dryGrinder: true } },
  { title: "Studio Blend", price: 5900, stars: 4.9, specs: { watt: 1500, capacityL: 2, dryGrinder: true } },
  { title: "Pocket Mix", price: 1290, stars: 4.7, specs: { watt: 1000, capacityL: 0.6, dryGrinder: false } },
];
const watchSeeds = [
  { title: "Daily Watch", price: 1590, stars: 4.8, specs: { thaiNotifications: true, gps: false, waterAtm: 3, bluetoothCall: true, batteryDays: 5, platforms: ["ios", "android"] } },
  { title: "Run Mate", price: 3990, stars: 4.6, specs: { thaiNotifications: true, gps: true, waterAtm: 5, bluetoothCall: true, batteryDays: 10, platforms: ["ios", "android"] } },
  { title: "Studio Watch", price: 12900, stars: 4.9, specs: { thaiNotifications: true, gps: true, waterAtm: 10, bluetoothCall: true, batteryDays: 14, platforms: ["ios", "android"] } },
  { title: "Active Mini", price: 2990, stars: 4.7, specs: { thaiNotifications: false, gps: true, waterAtm: 5, bluetoothCall: false, batteryDays: 8, platforms: ["android"] } },
];

export function previewProducts(pack: CategoryPack): Product[] {
  if (!["blender", "smartwatch"].includes(pack.id)) return [];
  const seeds = pack.id === "blender" ? blenderSeeds : watchSeeds;
  const subjects = pack.questions.flatMap((question) => question.options.flatMap((option) =>
    option.requirement?.spec ? [option.requirement] : []));
  return seeds.map((seed, index) => {
    const product: Product = {
      id: `preview-${pack.id}-${index + 1}`, category: pack.id, title: `${pack.name} ${seed.title}`,
      brand: "รุ่นสมมติ", keywords: pack.keywords, priceThb: seed.price, imageUrl: "", shopeeUrl: "",
      stars: seed.stars, ratingCount: [3120, 860, 1240, 520][index], specs: seed.specs,
      features: index === 2 ? ["จอแสดงผลพิเศษ", "ชุดอุปกรณ์เสริม"] : [], shop: { ...shops, id: `preview-shop-${index}` },
      claims: [], reviews: [],
    };
    product.reviews = subjects.flatMap((subject) => Array.from({ length: 3 }, (_, reviewIndex) => ({
      id: `${subject.id}-${reviewIndex}`, stars: specCheck(product, subject) === "pass" ? 4 : 2,
      text: specCheck(product, subject) === "pass"
        ? `ผู้ใช้จำลอง ${reviewIndex + 1}: ทดลองแล้วผ่านเงื่อนไข ${subject.text}`
        : `ผู้ใช้จำลอง ${reviewIndex + 1}: ทดลองแล้วไม่ผ่านเงื่อนไข ${subject.text}`,
      hasMedia: reviewIndex === 0, daysAgo: 20 + reviewIndex, isTemplate: false,
    })));
    return product;
  });
}

export function previewArena(pack: CategoryPack, requirements: Requirement[]): ArenaResult {
  const products = previewProducts(pack);
  const labels: Record<string, Label[]> = Object.fromEntries(products.map((product) => [product.id,
    requirements.flatMap((requirement) => product.reviews.filter((review) => review.id.startsWith(`${requirement.id}-`))
      .map((review): Label => ({ reviewId: review.id, subjectId: requirement.id, target: "product",
        stance: specCheck(product, requirement) === "pass" ? "confirm" : "contradict", quote: review.text,
        usage: "short", specific: true }))),
  ]));
  const ranked = rank(products, requirements, labels).slice(0, 4).map((row) => {
    const weakest = row.requirements.find((item) => ["fail", "contradicted", "unknown", "mixed"].includes(item.status));
    const requirement = requirements.find((item) => item.id === weakest?.requirementId);
    return { ...row, trust: null, objections: labels[row.productId].filter((label) => label.stance === "contradict").slice(0, 1),
      why: row.mustOk ? "ยังไม่พบเงื่อนไขจำเป็นที่ไม่ผ่านในข้อมูลตัวอย่าง" : "มีเงื่อนไขจำเป็นที่ไม่ผ่าน ควรพิจารณาตัวเลือกอื่น",
      ...(requirement ? { why: `${row.mustOk ? "ข้อควรพิจารณา" : "ยังไม่ผ่าน"}: ${requirement.text}` } : {}),
    };
  });
  const events: AgentEvent[] = [
    { agent: "verifier", type: "done", text: "รอบตัวอย่างนี้เริ่มจากความต้องการ จึงไม่มีสินค้าจากลิงก์ให้ตรวจ" },
    { agent: "fit", type: "start", text: "เทียบความต้องการกับสินค้า 4 รุ่นสมมติ" },
    { agent: "value", type: "start", text: "ตรวจงบประมาณและเงื่อนไขจำเป็น" },
    ...ranked.slice(0, 3).map((row): AgentEvent => ({ agent: "fit", type: "candidate", productId: row.productId, text: `พบตัวเลือกที่เหมาะ ${row.fitPct}% ตามข้อมูลจำลอง` })),
    { agent: "value", type: "candidate", productId: ranked.find((row) => row.mustOk)?.productId, text: "เปรียบเทียบราคาเฉพาะตัวเลือกที่ยังไม่พบเงื่อนไขจำเป็นไม่ผ่าน" },
    { agent: "fit", type: "done", text: "ส่งตัวเลือกให้ตรวจข้อเสียต่อ" },
    { agent: "value", type: "done", text: "เปรียบเทียบราคาเสร็จแล้ว" },
    { agent: "skeptic", type: "start", text: "มองหาหลักฐานอีกด้านใน 3 อันดับแรก" },
    ...ranked.slice(0, 3).flatMap((row) => row.objections.map((label): AgentEvent => ({ agent: "skeptic", type: "objection", productId: row.productId, quote: label.quote, text: "พบข้อควรระวังจากรีวิวจำลอง" }))),
    { agent: "skeptic", type: "done", text: "ตรวจครบแล้ว ข้อมูลที่ยังไม่รู้จะไม่ถูกแสดงว่าผ่าน" },
    { agent: "judge", type: "done", text: "สรุปผลตัวอย่างพร้อมแล้ว" },
  ];
  return { requirements, ranked, events, mode: "rules" };
}
