import type { CarryoverVisit, RouteExecutionRecord, RouteVisit, VisitStatus } from "@/types/route";

export const EXECUTION_STORAGE_KEY = "route-planner-dms-execution-records-v2";

const completedStatuses: VisitStatus[] = ["Đã đi", "Có đơn", "Không có đơn", "CS từ xa"];
const missedStatuses: VisitStatus[] = ["Chưa đi", "Không gặp khách", "Dời lịch"];

export function isCompletedVisit(status: VisitStatus): boolean {
  return completedStatuses.includes(status);
}

export function isMissedVisit(status: VisitStatus): boolean {
  return missedStatuses.includes(status);
}

export function getEffectiveStatus(visit: RouteVisit, records: RouteExecutionRecord[]): VisitStatus {
  return records.find((record) => record.visitId === visit.id)?.actualStatus ?? visit.status;
}

export function upsertExecutionRecord(
  records: RouteExecutionRecord[],
  visit: RouteVisit,
  patch: Partial<Omit<RouteExecutionRecord, "visitId" | "outletId" | "month" | "year" | "week" | "clusterId" | "salePhuTrach" | "updatedAt">>,
): RouteExecutionRecord[] {
  const current = records.find((record) => record.visitId === visit.id);
  const next: RouteExecutionRecord = {
    visitId: visit.id,
    outletId: visit.outlet.outletId,
    month: visit.month,
    year: visit.year,
    week: visit.week,
    clusterId: visit.clusterId,
    salePhuTrach: visit.outlet.salePhuTrach,
    actualStatus: patch.actualStatus ?? current?.actualStatus ?? visit.status,
    actualVisitDate: patch.actualVisitDate ?? current?.actualVisitDate,
    actualRevenue: patch.actualRevenue ?? current?.actualRevenue,
    note: patch.note ?? current?.note,
    carryToNextMonth: patch.carryToNextMonth ?? current?.carryToNextMonth ?? false,
    updatedAt: new Date().toISOString(),
  };

  return [...records.filter((record) => record.visitId !== visit.id), next];
}

export function summarizeExecution(plan: RouteVisit[], records: RouteExecutionRecord[]) {
  const requiredVisits = plan.filter((visit) => visit.status !== "CS từ xa");
  const completed = requiredVisits.filter((visit) => isCompletedVisit(getEffectiveStatus(visit, records)));
  const missed = requiredVisits.filter((visit) => isMissedVisit(getEffectiveStatus(visit, records)));
  const remote = plan.filter((visit) => getEffectiveStatus(visit, records) === "CS từ xa");
  const completionRate = requiredVisits.length ? Math.round((completed.length / requiredVisits.length) * 100) : 0;

  const bySale = new Map<string, { sale: string; required: number; completed: number; missed: number }>();
  for (const visit of requiredVisits) {
    const sale = visit.outlet.salePhuTrach;
    const current = bySale.get(sale) ?? { sale, required: 0, completed: 0, missed: 0 };
    current.required += 1;
    if (isCompletedVisit(getEffectiveStatus(visit, records))) current.completed += 1;
    if (isMissedVisit(getEffectiveStatus(visit, records))) current.missed += 1;
    bySale.set(sale, current);
  }

  return {
    required: requiredVisits.length,
    completed: completed.length,
    missed: missed.length,
    remote: remote.length,
    completionRate,
    bySale: [...bySale.values()].sort((a, b) => b.missed - a.missed || a.sale.localeCompare(b.sale)),
  };
}

export function buildCarryoversForNextMonth(plan: RouteVisit[], records: RouteExecutionRecord[]): CarryoverVisit[] {
  const existing = new Set<string>();
  const carryovers: CarryoverVisit[] = [];

  for (const visit of plan) {
    const record = records.find((item) => item.visitId === visit.id);
    if (!record) continue;
    const effectiveStatus = record?.actualStatus ?? visit.status;
    const isLowFrequencyMiss = (visit.frequency === "F0.5" || visit.frequency === "F0.3") && isMissedVisit(effectiveStatus);
    const shouldCarry = record?.carryToNextMonth || (visit.frequency !== "F0.5" && visit.frequency !== "F0.3" && isMissedVisit(effectiveStatus)) || isLowFrequencyMiss;
    if (!shouldCarry || visit.status === "CS từ xa") continue;
    const dedupeKey = `${visit.outlet.outletId}-${visit.id}`;
    if (existing.has(dedupeKey)) continue;
    existing.add(dedupeKey);
    carryovers.push({
      outletId: visit.outlet.outletId,
      sourceVisitId: visit.id,
      sourceMonth: visit.month,
      sourceYear: visit.year,
      sourceWeek: visit.week,
      reason: record?.note || `Chưa hoàn tất trạng thái ${effectiveStatus}`,
    });
  }

  return carryovers;
}

export function recordsForPeriod(records: RouteExecutionRecord[], month: number, year: number): RouteExecutionRecord[] {
  return records.filter((record) => record.month === month && record.year === year);
}

export const executionStatuses: VisitStatus[] = ["Chưa đi", "Đã đi", "Có đơn", "Không có đơn", "Không gặp khách", "Dời lịch", "CS từ xa"];
