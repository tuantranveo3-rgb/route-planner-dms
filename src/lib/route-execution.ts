import type { Outlet } from "@/types/outlet";
import type { CarryoverVisit, PlannerSettings, RouteExecutionRecord, RouteVisit, VisitStatus } from "@/types/route";
import { DEFAULT_SETTINGS, enrichOutlets } from "@/lib/route-logic";

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
    visitType: patch.visitType ?? current?.visitType ?? "Theo lịch",
    source: patch.source ?? current?.source,
    isExtraVisit: patch.isExtraVisit ?? current?.isExtraVisit ?? false,
    note: patch.note ?? current?.note,
    carryToNextMonth: patch.carryToNextMonth ?? current?.carryToNextMonth ?? false,
    updatedAt: new Date().toISOString(),
  };

  return [...records.filter((record) => record.visitId !== visit.id), next];
}

export function summarizeExecution(plan: RouteVisit[], records: RouteExecutionRecord[]) {
  const requiredVisits = plan.filter((visit) => !visit.status.startsWith("CS"));
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
    if (!shouldCarry || visit.status.startsWith("CS")) continue;
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

function monthIndex(month: number, year: number) {
  return year * 12 + month;
}

function sortNewestFirst(records: RouteExecutionRecord[]) {
  return [...records].sort((a, b) => monthIndex(b.month, b.year) - monthIndex(a.month, a.year));
}

export function buildLowFrequencyHistoryCarryovers(
  outlets: Outlet[],
  records: RouteExecutionRecord[],
  targetMonth: number,
  targetYear: number,
  settings: PlannerSettings = DEFAULT_SETTINGS,
): CarryoverVisit[] {
  const targetIndex = monthIndex(targetMonth, targetYear);
  const enriched = enrichOutlets(outlets, settings).filter((outlet) => outlet.frequency === "F0.5" || outlet.frequency === "F0.3");
  const carryovers: CarryoverVisit[] = [];

  for (const outlet of enriched) {
    const outletRecords = records.filter((record) => record.outletId === outlet.outletId && monthIndex(record.month, record.year) < targetIndex);
    if (!outletRecords.length) continue;

    const intervalMonths = outlet.frequency === "F0.5" ? 2 : 3;
    const newestRecords = sortNewestFirst(outletRecords);
    const lastCompleted = newestRecords.find((record) => isCompletedVisit(record.actualStatus));
    const recentMiss = newestRecords.find((record) => {
      const age = targetIndex - monthIndex(record.month, record.year);
      return age <= intervalMonths && (isMissedVisit(record.actualStatus) || record.carryToNextMonth);
    });
    const monthsSinceCompleted = lastCompleted ? targetIndex - monthIndex(lastCompleted.month, lastCompleted.year) : intervalMonths + 1;
    const overdue = monthsSinceCompleted >= intervalMonths;

    if (!recentMiss && !overdue) continue;

    const source = recentMiss ?? lastCompleted ?? newestRecords[0];
    const reason = recentMiss
      ? `${outlet.frequency} bị miss/cần bù trong ${intervalMonths} tháng gần nhất: ${recentMiss.note || recentMiss.actualStatus}`
      : `${outlet.frequency} đã ${monthsSinceCompleted} tháng chưa ghi nhận ghé, ưu tiên kéo vào tuyến tháng này`;

    carryovers.push({
      outletId: outlet.outletId,
      sourceVisitId: source.visitId,
      sourceMonth: source.month,
      sourceYear: source.year,
      sourceWeek: source.week,
      reason,
    });
  }

  return carryovers;
}

export function recordsForPeriod(records: RouteExecutionRecord[], month: number, year: number): RouteExecutionRecord[] {
  return records.filter((record) => record.month === month && record.year === year);
}

export const executionStatuses: VisitStatus[] = ["Chưa đi", "Đã đi", "Có đơn", "Không có đơn", "Không gặp khách", "Dời lịch", "CS từ xa"];
