import { getEvalReportResponse } from "../../../lib/eval/report";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return getEvalReportResponse(request.headers.get("accept")?.includes("application/json") ?? false);
}
