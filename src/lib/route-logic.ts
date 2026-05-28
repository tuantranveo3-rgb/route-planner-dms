import type { RouteCluster } from "@/types/cluster";
import type { EnrichedOutlet, Frequency, Outlet, OutletScore } from "@/types/outlet";
import type { CarryoverVisit, PlannerSettings, RouteVisit, WeekKey } from "@/types/route";

export const DEFAULT_SETTINGS: PlannerSettings = {
  weights: {
    sales: 35,
    orders: 20,
    potential: 20,
    distance: 15,
    risk: 10,
  },
  defaultDailyCapacity: 18,
  minVisitsPerSaleDay: 6,
  maxVisitsPerSaleDay: 15,
  workingDaysPerMonth: 24,
};

const weeks: WeekKey[] = ["W1", "W2", "W3", "W4"];
const frequencyRank: Record<Frequency, number> = {
  F4: 4,
  F2: 3,
  F1: 2,
  "F0.5": 1,
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round1 = (value: number) => Math.round(value * 10) / 10;

export function calculateSalesScore(doanhSo3Thang: number): number {
  return clamp((doanhSo3Thang / 300_000_000) * 100);
}

export function calculateOrderScore(soDon3Thang: number): number {
  return clamp((soDon3Thang / 36) * 100);
}

export function calculatePotentialScore(tiemNang: number): number {
  return clamp((tiemNang / 5) * 100);
}

export function calculateDistanceScore(khoangCachTamCumKm: number): number {
  if (khoangCachTamCumKm <= 2) return 100;
  if (khoangCachTamCumKm <= 5) return 80;
  if (khoangCachTamCumKm <= 10) return 60;
  if (khoangCachTamCumKm <= 20) return 40;
  return 20;
}

export function calculateRiskScore(ruiRoMatKhach: number): number {
  return clamp((ruiRoMatKhach / 5) * 100);
}

export function assignFrequency(totalScore: number): Frequency {
  if (totalScore >= 80) return "F4";
  if (totalScore >= 60) return "F2";
  if (totalScore >= 40) return "F1";
  return "F0.5";
}

export function calculateMonthlyVisits(frequency: Frequency): number {
  if (frequency === "F4") return 4;
  if (frequency === "F2") return 2;
  if (frequency === "F1") return 1;
  return 0.5;
}

export function calculateOutletScore(outlet: Outlet, settings: PlannerSettings = DEFAULT_SETTINGS): OutletScore {
  const salesScore = calculateSalesScore(outlet.doanhSo3Thang);
  const orderScore = calculateOrderScore(outlet.soDon3Thang);
  const potentialScore = calculatePotentialScore(outlet.tiemNang);
  const distanceScore = calculateDistanceScore(outlet.khoangCachTamCumKm);
  const riskScore = calculateRiskScore(outlet.ruiRoMatKhach);
  const totalWeight = Object.values(settings.weights).reduce((sum, value) => sum + value, 0) || 100;
  const totalScore = round1(
    (salesScore * settings.weights.sales +
      orderScore * settings.weights.orders +
      potentialScore * settings.weights.potential +
      distanceScore * settings.weights.distance +
      riskScore * settings.weights.risk) /
      totalWeight,
  );
  const frequency = assignFrequency(totalScore);
  const monthlyVisits = calculateMonthlyVisits(frequency);
  const reason = buildFrequencyReason(outlet, {
    salesScore,
    orderScore,
    potentialScore,
    distanceScore,
    riskScore,
    totalScore,
    frequency,
    monthlyVisits,
    reason: "",
  });

  return {
    salesScore: round1(salesScore),
    orderScore: round1(orderScore),
    potentialScore: round1(potentialScore),
    distanceScore,
    riskScore: round1(riskScore),
    totalScore,
    frequency,
    monthlyVisits,
    reason,
  };
}

export function enrichOutlets(outlets: Outlet[], settings: PlannerSettings = DEFAULT_SETTINGS): EnrichedOutlet[] {
  return outlets.map((outlet) => ({ ...outlet, ...calculateOutletScore(outlet, settings) }));
}

function buildFrequencyReason(outlet: Outlet, score: OutletScore): string {
  const drivers = [
    score.salesScore >= 80 ? "doanh số mạnh" : "",
    score.orderScore >= 75 ? "đơn hàng đều" : "",
    score.potentialScore >= 80 ? "tiềm năng cao" : "",
    score.riskScore >= 80 ? "rủi ro mất khách cao" : "",
    score.distanceScore <= 40 ? "xa tâm cụm" : "",
  ].filter(Boolean);
  const driverText = drivers.length ? drivers.join(", ") : "điểm tổng ở mức duy trì";
  return `${score.frequency}: ${driverText}; cụm ${outlet.cumNho}, ${score.monthlyVisits} lượt/tháng.`;
}

export function optimizeDailyRoute(outlets: EnrichedOutlet[], cluster: RouteCluster): EnrichedOutlet[] {
  return [...outlets].sort((a, b) => {
    const frequencyDiff = frequencyRank[b.frequency] - frequencyRank[a.frequency];
    if (frequencyDiff !== 0) return frequencyDiff;
    const angleA = Math.atan2(a.toaDoY - cluster.toaDoTamY, a.toaDoX - cluster.toaDoTamX);
    const angleB = Math.atan2(b.toaDoY - cluster.toaDoTamY, b.toaDoX - cluster.toaDoTamX);
    if (angleA !== angleB) return angleA - angleB;
    return a.khoangCachTamCumKm - b.khoangCachTamCumKm;
  });
}

export function generateMonthlyRoutePlan(
  month: number,
  year: number,
  outlets: Outlet[],
  clusters: RouteCluster[],
  settings: PlannerSettings = DEFAULT_SETTINGS,
  carryovers: CarryoverVisit[] = [],
): RouteVisit[] {
  const enriched = enrichOutlets(outlets, settings);
  const clusterById = new Map(clusters.map((cluster) => [cluster.maCum, cluster]));
  const visits: RouteVisit[] = [];
  const capacityCounter = new Map<string, number>();
  const f2CounterByCluster = new Map<string, number>();
  const f1CounterByCluster = new Map<string, number>();

  const sorted = [...enriched].sort((a, b) => frequencyRank[b.frequency] - frequencyRank[a.frequency] || b.totalScore - a.totalScore);
  const outletById = new Map(enriched.map((outlet) => [outlet.outletId, outlet]));

  for (const carryover of carryovers) {
    const outlet = outletById.get(carryover.outletId);
    if (!outlet || outlet.frequency === "F0.5") continue;
    const cluster = clusterById.get(outlet.cumNho);
    if (!cluster) continue;
    const targetWeeks: WeekKey[] = outlet.frequency === "F4" || outlet.frequency === "F2" ? ["W1", "W2"] : ["W2", "W3"];
    const week = targetWeeks.find((candidate) => {
      const key = `${candidate}-${cluster.maCum}`;
      const used = capacityCounter.get(key) ?? 0;
      return used < (cluster.capacityNgay || settings.defaultDailyCapacity);
    }) ?? targetWeeks[0];
    const key = `${week}-${cluster.maCum}`;
    const capacity = cluster.capacityNgay || settings.defaultDailyCapacity;
    const used = capacityCounter.get(key) ?? 0;
    const warning = used >= capacity ? "Quá tải bù tuyến, cần thêm ngày đi hoặc tách cụm" : undefined;

    if (used < capacity) {
      capacityCounter.set(key, used + 1);
    }

    visits.push({
      id: `${year}-${month}-${week}-${outlet.outletId}-BU-${carryover.sourceVisitId}`,
      month,
      year,
      week,
      dayName: cluster.ngayDiCoDinh,
      clusterId: cluster.maCum,
      clusterName: cluster.tenCum,
      routeOrder: 0,
      outlet,
      frequency: outlet.frequency,
      status: "Chưa đi",
      warning,
      priorityReason: `Bù tuyến từ ${carryover.sourceWeek} tháng ${carryover.sourceMonth}/${carryover.sourceYear}: ${carryover.reason}`,
      isCarryover: true,
      carryoverReason: carryover.reason,
      sourceVisitId: carryover.sourceVisitId,
    });
  }

  for (const outlet of sorted) {
    const cluster = clusterById.get(outlet.cumNho);
    if (!cluster) continue;
    const targetWeeks = getWeeksForOutlet(outlet, f2CounterByCluster, f1CounterByCluster);

    for (const week of targetWeeks) {
      const key = `${week}-${cluster.maCum}`;
      const capacity = cluster.capacityNgay || settings.defaultDailyCapacity;
      const used = capacityCounter.get(key) ?? 0;
      const isRemote = outlet.frequency === "F0.5" && used >= capacity;
      const warning = used >= capacity ? "Quá tải, cần tách cụm hoặc hạ tần suất" : undefined;

      if (!isRemote && used < capacity) {
        capacityCounter.set(key, used + 1);
      }

      visits.push({
        id: `${year}-${month}-${week}-${outlet.outletId}`,
        month,
        year,
        week,
        dayName: cluster.ngayDiCoDinh,
        clusterId: cluster.maCum,
        clusterName: cluster.tenCum,
        routeOrder: 0,
        outlet,
        frequency: outlet.frequency,
        status: isRemote ? "CS từ xa" : "Chưa đi",
        warning,
        priorityReason: outlet.reason,
      });
    }
  }

  return assignDailyOrders(visits, clusters);
}

function getWeeksForOutlet(
  outlet: EnrichedOutlet,
  f2CounterByCluster: Map<string, number>,
  f1CounterByCluster: Map<string, number>,
): WeekKey[] {
  if (outlet.frequency === "F4") return weeks;
  if (outlet.frequency === "F2") {
    const current = f2CounterByCluster.get(outlet.cumNho) ?? 0;
    f2CounterByCluster.set(outlet.cumNho, current + 1);
    return current % 2 === 0 ? ["W1", "W3"] : ["W2", "W4"];
  }
  if (outlet.frequency === "F1") {
    const current = f1CounterByCluster.get(outlet.cumNho) ?? 0;
    f1CounterByCluster.set(outlet.cumNho, current + 1);
    return [weeks[current % weeks.length]];
  }
  return ["W4"];
}

function assignDailyOrders(visits: RouteVisit[], clusters: RouteCluster[]): RouteVisit[] {
  const clusterById = new Map(clusters.map((cluster) => [cluster.maCum, cluster]));
  const grouped = new Map<string, RouteVisit[]>();

  for (const visit of visits) {
    const key = `${visit.week}-${visit.clusterId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), visit]);
  }

  const ordered: RouteVisit[] = [];
  for (const [, group] of grouped) {
    const cluster = clusterById.get(group[0].clusterId);
    if (!cluster) {
      ordered.push(...group);
      continue;
    }
    const outletOrder = new Map(optimizeDailyRoute(group.map((visit) => visit.outlet), cluster).map((outlet, index) => [outlet.outletId, index + 1]));
    ordered.push(...group.map((visit) => ({ ...visit, routeOrder: outletOrder.get(visit.outlet.outletId) ?? 999 })));
  }

  return ordered.sort((a, b) => weeks.indexOf(a.week) - weeks.indexOf(b.week) || a.dayName.localeCompare(b.dayName) || a.routeOrder - b.routeOrder);
}

export function getOverloadedClusters(plan: RouteVisit[], clusters: RouteCluster[]) {
  const capacityByCluster = new Map(clusters.map((cluster) => [cluster.maCum, cluster.capacityNgay]));
  const counts = new Map<string, { week: WeekKey; clusterId: string; clusterName: string; visits: number; capacity: number }>();

  for (const visit of plan.filter((item) => item.status !== "CS từ xa")) {
    const key = `${visit.week}-${visit.clusterId}`;
    const existing = counts.get(key) ?? {
      week: visit.week,
      clusterId: visit.clusterId,
      clusterName: visit.clusterName,
      visits: 0,
      capacity: capacityByCluster.get(visit.clusterId) ?? DEFAULT_SETTINGS.defaultDailyCapacity,
    };
    existing.visits += 1;
    counts.set(key, existing);
  }

  return [...counts.values()].filter((item) => item.visits > item.capacity);
}

export { weeks, frequencyRank };
