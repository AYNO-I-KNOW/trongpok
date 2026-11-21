import { getEvalReportResponse } from "../../lib/eval/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return getEvalReportResponse();
}
