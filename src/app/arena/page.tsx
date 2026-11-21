import { Arena } from "@/components/ui/arena";
import BlenderArena from "@/ui/trong-pok/components/BlenderArena";
import { byCategory, loadPacks } from "@/lib/catalog";
export default async function ArenaPage({
  searchParams,
}: {
  searchParams: Promise<{ font?: string; flow?: string }>;
}) {
  const params = await searchParams;
  if (params.flow === "compare") return <Arena />;
  const [packs, catalog] = await Promise.all([loadPacks(), byCategory("blender")]);
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
