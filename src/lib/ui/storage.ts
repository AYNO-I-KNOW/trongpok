import { PendingRunSchema, RunRecordSchema, type PendingRun, type RunRecord } from "./contracts";

const prefix = "trongpok:ui:v1:";

export function savePending(run: PendingRun) {
  sessionStorage.setItem(`${prefix}pending`, JSON.stringify(run));
}

export function readPending(): PendingRun | null {
  try {
    const parsed = PendingRunSchema.safeParse(JSON.parse(sessionStorage.getItem(`${prefix}pending`) ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function saveRun(run: RunRecord) {
  const parsed = RunRecordSchema.parse(run);
  sessionStorage.setItem(`${prefix}run:${parsed.id}`, JSON.stringify(parsed));
}

export function readRun(id: string): RunRecord | null {
  try {
    const parsed = RunRecordSchema.safeParse(JSON.parse(sessionStorage.getItem(`${prefix}run:${id}`) ?? "null"));
    if (!parsed.success || Date.now() - parsed.data.createdAt > 86_400_000) return null;
    return parsed.data;
  } catch { return null; }
}
