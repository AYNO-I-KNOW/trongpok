import BlenderArena from "@/ui/trong-pok/components/BlenderArena";
import { byCategory, loadPacks } from "@/lib/catalog";
export default async function ArenaPage({
  searchParams,
}: {
  searchParams: Promise<{ font?: string }>;
}) {
  const [params, packs, catalog] = await Promise.all([
    searchParams,
    loadPacks(),
    byCategory("blender"),
  ]);
  const pack = packs.find(({ id }) => id === "blender");
  if (!pack) throw new Error("Missing blender category pack");
  const fontTheme = params.font === "line" ? "line" : "ibm";
  const products = catalog.map((product) => ({
    id: product.id,
    title: product.title,
    priceThb: product.priceThb,
    imageUrl: product.imageUrl,
    stars: product.stars,
    ratingCount: product.ratingCount,
    shopName: product.shop.name,
    reviews: product.reviews,
    claims: product.claims,
  }));
  return (
    <BlenderArena
      products={products}
      pack={pack}
      fontTheme={fontTheme}
    />
  );
}
