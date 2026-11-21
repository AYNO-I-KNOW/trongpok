export function splitNeedInput(raw: string) {
  const links = raw.match(/https?:\/\/[^\s<>]+/gi) ?? [];
  if (links.length > 1) throw new Error("วางลิงก์สินค้าครั้งละหนึ่งรายการ");
  const link = links[0];
  return { link, needText: (link ? raw.replace(link, "") : raw).trim() };
}
