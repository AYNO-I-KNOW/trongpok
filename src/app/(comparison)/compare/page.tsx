import { findByLink, loadPacks, loadProducts } from "@/lib/catalog";
import { previewProducts } from "@/lib/ui/preview";
import { prefillSelection } from "@/lib/ui/needs";
import { splitNeedInput } from "@/lib/ui/input";
import { NeedFlow } from "@/components/ui/need-flow";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Compare({ searchParams }: { searchParams: Promise<{ q?: string; font?: string }> }) {
  const [params, packs, products] = await Promise.all([searchParams, loadPacks(), loadProducts()]);
  const initialText = (params.q ?? "").slice(0, 2000);
  let initialProduct: Product | undefined;
  let initialPackId = "";
  let initialError = "";
  try {
    const input = splitNeedInput(initialText);
    if (input.link) {
      const resolved = await findByLink(input.link);
      if (resolved.status !== "found") throw new Error("ลิงก์นี้ยังไม่อยู่ในชุดเดโม ลองเลือกหมวดหรืออธิบายความต้องการแทน");
      initialProduct = resolved.product;
      initialPackId = resolved.product.category;
    } else {
      initialPackId = packs.find((pack) => pack.keywords.some((keyword) => input.needText.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())))?.id
        ?? packs.find((pack) => Object.values(prefillSelection(pack, input.needText)).some((values) => values.length > 0))?.id ?? "";
    }
  } catch (error) {
    initialError = error instanceof Error ? error.message : "ตรวจคำค้นไม่ได้ กรุณาลองอีกครั้ง";
  }
  const previews = Object.fromEntries(packs.map((pack) => [pack.id, previewProducts(pack)]));
  return <NeedFlow packs={packs} products={products} previews={previews} initialText={initialText}
    initialProduct={initialProduct} initialPackId={initialPackId} initialError={initialError}
    font={params.font === "line" ? "line" : "ibm"} />;
}
