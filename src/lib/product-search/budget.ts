const amount = /([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)/.source;
const budgetPrefix =
  /(?:งบ(?:ประมาณ)?\s*(?:ไม่เกิน|สูงสุด)?|ราคา(?:ไม่เกิน|สูงสุด)|budget(?: of| up to)?)/
    .source;
const rangeStart = `(?:${amount}\\s*(?:-|–|ถึง|to)\\s*)?`;
const explicitBudget = new RegExp(
  `${budgetPrefix}\\s*[:฿]?\\s*${rangeStart}${amount}\\s*(พัน|หมื่น|k\\b)?(?![0-9.,])`,
  "i",
);
const currencyLimit = new RegExp(
  `(?:ไม่เกิน|สูงสุด|under|at most|up to)\\s*(?:฿\\s*${amount}|${amount}\\s*(?:บาท|THB|baht))`,
  "i",
);

export function budgetFromQuery(query: string): number | null {
  const normalized = query
    .normalize("NFKC")
    .replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50));
  const budget = explicitBudget.exec(normalized);
  if (budget) {
    const tail = normalized.slice(budget.index + budget[0].length).trimStart();
    if (/^(?:USD|EUR|dollars?|euros?|ดอลลาร์|ยูโร)/i.test(tail)) return null;
    const multiplier = budget[3] === "หมื่น" ? 10_000 : budget[3] ? 1000 : 1;
    return Number(budget[2].replaceAll(",", "")) * multiplier;
  }
  const limit = currencyLimit.exec(normalized);
  return limit ? Number((limit[1] ?? limit[2]).replaceAll(",", "")) : null;
}
