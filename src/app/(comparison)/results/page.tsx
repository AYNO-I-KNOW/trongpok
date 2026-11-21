import { Results } from "@/components/ui/results";

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run = "" } = await searchParams;
  return <Results key={run} runId={run} />;
}
