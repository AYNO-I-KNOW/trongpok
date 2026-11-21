import BlenderArena from "@/ui/trong-pok/components/BlenderArena";
import { byCategory, shopeeLink } from "@/lib/catalog";
import { Arena } from "@/components/ui/arena";
export default async function ArenaPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; font?: string; flow?: string }>;
}) {
  const params = await searchParams;
  if (params.flow === "compare") return <Arena />;
  const fontTheme = params.font === "line" ? "line" : "ibm";
  const products = (await byCategory("blender")).map((product) => ({
    id: product.id,
    title: product.title,
    priceThb: product.priceThb,
    imageUrl: product.imageUrl,
    shopeeUrl: product.shopeeUrl,
    outboundUrl: shopeeLink(product),
    stars: product.stars,
    ratingCount: product.ratingCount,
    shopName: product.shop.name,
  }));
  return (
    <BlenderArena
      products={products}
      rankingDemo={false}
      fontTheme={fontTheme}
    />
  );
}
