import { ProductDetail } from "@/components/ui/product-detail";

export default async function ProductPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const [{ id }, { run = "" }] = await Promise.all([params, searchParams]);
  return <ProductDetail key={`${id}-${run}`} id={id} runId={run} />;
}
