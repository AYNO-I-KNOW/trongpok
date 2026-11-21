import { Results } from "@/components/ui/results";

export default async function ProductPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const [{ id }, { run = "" }] = await Promise.all([params, searchParams]);
  return <Results key={`${id}-${run}`} productId={id} runId={run} />;
}
