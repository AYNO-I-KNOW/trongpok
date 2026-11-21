import TrongPok from "@/ui/trong-pok/components/TrongPok";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ font?: string }>;
}) {
  const { font } = await searchParams;
  return <TrongPok fontTheme={font === "line" ? "line" : "ibm"} />;
}
