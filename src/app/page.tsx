import TrongPok from "@/ui/trong-pok/components/TrongPok";
import { byCategory, shopeeLink } from "@/lib/catalog";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; font?: string }>;
}) {
  const params = await searchParams;
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
    <TrongPok
      products={products}
      rankingDemo={params.demo === "ranking"}
      fontTheme={params.font === "line" ? "line" : "ibm"}
    />
  );
}
