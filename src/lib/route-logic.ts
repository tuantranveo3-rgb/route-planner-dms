import type { RouteCluster } from "@/types/cluster";
import type { EnrichedOutlet, Frequency, Outlet, OutletScore } from "@/types/outlet";
import type { CarryoverVisit, PlannerSettings, RouteVisit, SaleStartPoint, SaleUnavailableDay, WeekKey } from "@/types/route";
import type { SalesTerritory } from "@/types/territory";
import { formatNumber } from "@/lib/format";

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
const dayIndexByName: Record<string, number> = {
  "Thứ 2": 1,
  "Thứ 3": 2,
  "Thứ 4": 3,
  "Thứ 5": 4,
  "Thứ 6": 5,
  "Thứ 7": 6,
};
const dayNameByIndex = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const frequencyRank: Record<Frequency, number> = {
  F8: 6,
  F4: 4,
  F2: 3,
  F1: 2,
  "F0.5": 1,
  "F0.3": 0,
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round1 = (value: number) => Math.round(value * 10) / 10;
const workingDayNames = dayNameByIndex.slice(1);

function spreadClusterDayName(preferredDayName: string, sequence: number): string {
  const startIndex = workingDayNames.indexOf(preferredDayName);
  if (startIndex < 0) return preferredDayName;
  return workingDayNames[(startIndex + sequence) % workingDayNames.length];
}

function distanceBetween(a: { toaDoX: number; toaDoY: number }, b: { toaDoX: number; toaDoY: number }) {
  return Math.hypot(a.toaDoX - b.toaDoX, a.toaDoY - b.toaDoY);
}

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
  return 0;
}

export function calculateRiskScore(ruiRoMatKhach: number): number {
  return clamp((ruiRoMatKhach / 5) * 100);
}

export function assignFrequency(totalScore: number): Frequency {
  if (totalScore >= 92) return "F8";
  if (totalScore >= 80) return "F4";
  if (totalScore >= 60) return "F2";
  if (totalScore >= 40) return "F1";
  if (totalScore >= 25) return "F0.5";
  return "F0.3";
}

export function calculateMonthlyVisits(frequency: Frequency): number {
  if (frequency === "F8") return 8;
  if (frequency === "F4") return 4;
  if (frequency === "F2") return 2;
  if (frequency === "F1") return 1;
  if (frequency === "F0.5") return 0.5;
  return 0.3;
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
  const suggestedFrequency = assignFrequency(totalScore);
  const frequency = outlet.ghiNhanF ?? suggestedFrequency;
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
  if (outlet.ghiNhanF) {
    return `${score.frequency}: dùng F ghi nhận từ file import; điểm tổng ${formatNumber(score.totalScore)} chỉ để tham khảo.`;
  }

  const drivers = [
    score.salesScore >= 80 ? "doanh số mạnh" : "",
    score.orderScore >= 75 ? "đơn hàng đều" : "",
    score.potentialScore >= 80 ? "tiềm năng cao" : "",
    score.riskScore >= 80 ? "rủi ro mất khách cao" : "",
    score.distanceScore <= 40 ? "xa tâm cụm" : "",
  ].filter(Boolean);
  const driverText = drivers.length ? drivers.join(", ") : "điểm tổng ở mức duy trì";
  return `${score.frequency}: ${driverText}; cụm ${outlet.cumNho}, ${formatNumber(score.monthlyVisits)} lượt/tháng.`;
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
  saleStartPoints: SaleStartPoint[] = [],
  salesTerritories: SalesTerritory[] = [],
  unavailableDays: SaleUnavailableDay[] = [],
): RouteVisit[] {
  const enriched = enrichOutlets(outlets, settings);
  const clusterById = new Map(clusters.map((cluster) => [cluster.maCum, cluster]));
  const visits: RouteVisit[] = [];
  const capacityCounter = new Map<string, number>();
  const saleDayCounter = new Map<string, number>();
  const outletWeekCounter = new Map<string, number>();
  const f2CounterByCluster = new Map<string, number>();
  const f1CounterByCluster = new Map<string, number>();

  const sorted = [...enriched].sort((a, b) => frequencyRank[b.frequency] - frequencyRank[a.frequency] || b.totalScore - a.totalScore);
  const outletById = new Map(enriched.map((outlet) => [outlet.outletId, outlet]));
  const lowFrequencyCarryoverOutlets = new Set<string>();
  const territoryBySale = new Map(salesTerritories.map((territory) => [territory.salePhuTrach, territory]));
  const configuredClusterIdsBySale = new Map(
    salesTerritories.map((territory) => {
      const dayPlanClusterIds = (territory.lichTheoNgay ?? []).flatMap((dayPlan) => dayPlan.clusterIds);
      return [territory.salePhuTrach, new Set(dayPlanClusterIds.length ? dayPlanClusterIds : territory.cumNhoPhuTrach)] as const;
    }),
  );
  const scheduledDayBySaleCluster = new Map<string, string>();

  for (const territory of salesTerritories) {
    for (const dayPlan of territory.lichTheoNgay ?? []) {
      dayPlan.clusterIds.forEach((clusterId, index) => {
        const key = `${territory.salePhuTrach}-${clusterId}`;
        if (!scheduledDayBySaleCluster.has(key)) {
          scheduledDayBySaleCluster.set(key, spreadClusterDayName(dayPlan.dayName, index));
        }
      });
    }
  }

  const clusterIdsBySale = new Map<string, string[]>();
  for (const outlet of enriched) {
    if (!clusterById.has(outlet.cumNho)) continue;
    const current = clusterIdsBySale.get(outlet.salePhuTrach) ?? [];
    if (!current.includes(outlet.cumNho)) {
      current.push(outlet.cumNho);
      clusterIdsBySale.set(outlet.salePhuTrach, current);
    }
  }

  for (const [saleName, clusterIds] of clusterIdsBySale) {
    const territory = territoryBySale.get(saleName);
    const preferredDays = territory?.ngayDiUuTien?.length ? territory.ngayDiUuTien : workingDayNames;
    clusterIds.sort().forEach((clusterId, index) => {
      const key = `${saleName}-${clusterId}`;
      if (!scheduledDayBySaleCluster.has(key)) {
        const preferredDay = preferredDays[index % preferredDays.length] ?? workingDayNames[index % workingDayNames.length];
        scheduledDayBySaleCluster.set(key, spreadClusterDayName(preferredDay, Math.floor(index / preferredDays.length)));
      }
    });
  }
  const unavailableBySaleDate = new Map(unavailableDays.map((item) => [`${item.salePhuTrach}-${item.date}`, item]));

  function isOutletAllowedByTerritory(outlet: EnrichedOutlet) {
    const configuredClusterIds = configuredClusterIdsBySale.get(outlet.salePhuTrach);
    if (!configuredClusterIds || configuredClusterIds.size === 0) return true;
    return configuredClusterIds.has(outlet.cumNho);
  }

  function getUnavailableReason(saleName: string, plannedDate: string) {
    const unavailable = unavailableBySaleDate.get(`${saleName}-${plannedDate}`);
    if (!unavailable) return "";
    return `${unavailable.reason}${unavailable.note ? `: ${unavailable.note}` : ""}`;
  }

  function isSaleUnavailable(saleName: string, plannedDate: string) {
    return unavailableBySaleDate.has(`${saleName}-${plannedDate}`);
  }

  function getSaleMax(saleName: string) {
    return territoryBySale.get(saleName)?.maxVisitsPerDay ?? settings.maxVisitsPerSaleDay;
  }

  function candidateDays(preferredDayName: string) {
    const preferredIndex = dayIndexByName[preferredDayName] ?? 1;
    return [...workingDayNames].sort((a, b) => {
      const distanceA = Math.abs((dayIndexByName[a] ?? 1) - preferredIndex);
      const distanceB = Math.abs((dayIndexByName[b] ?? 1) - preferredIndex);
      return distanceA - distanceB || (dayIndexByName[a] ?? 1) - (dayIndexByName[b] ?? 1);
    });
  }

  function findSlot(week: WeekKey, cluster: RouteCluster, saleName: string, preferredDayName: string) {
    const capacity = cluster.capacityNgay || settings.defaultDailyCapacity;
    const saleMax = getSaleMax(saleName);

    for (const dayName of candidateDays(preferredDayName)) {
      const clusterKey = `${week}-${cluster.maCum}-${dayName}`;
      const plannedDate = getPlannedDate(year, month, week, dayName);
      if (isSaleUnavailable(saleName, plannedDate)) continue;
      const saleDayKey = `${plannedDate}-${saleName}`;
      const clusterUsed = capacityCounter.get(clusterKey) ?? 0;
      const saleUsed = saleDayCounter.get(saleDayKey) ?? 0;
      if (clusterUsed < capacity && saleUsed < saleMax) {
        return {
          dayName,
          plannedDate,
          clusterKey,
          saleDayKey,
          warning: dayName === preferredDayName ? undefined : `Tự dời từ ${preferredDayName} sang ${dayName} để không vượt max ${saleMax} điểm/ngày.`,
          isFull: false,
        };
      }
    }

    const dayName = preferredDayName;
    const plannedDate = getPlannedDate(year, month, week, dayName);
    const clusterKey = `${week}-${cluster.maCum}-${dayName}`;
    const saleDayKey = `${plannedDate}-${saleName}`;
    const clusterUsed = capacityCounter.get(clusterKey) ?? 0;
    const saleUsed = saleDayCounter.get(saleDayKey) ?? 0;
    const reasons = [
      isSaleUnavailable(saleName, plannedDate) ? `${saleName} không đi tuyến ngày ${plannedDate} (${getUnavailableReason(saleName, plannedDate)})` : "",
      clusterUsed >= capacity ? `cụm ${cluster.maCum} đã đủ capacity ${capacity}` : "",
      saleUsed >= saleMax ? `${saleName} đã đủ max ${saleMax} điểm/ngày` : "",
    ].filter(Boolean);

    return {
      dayName,
      plannedDate,
      clusterKey,
      saleDayKey,
      warning: reasons.length ? `Quá tải, cần thêm ngày đi hoặc tách cụm: ${reasons.join(", ")}.` : undefined,
      isFull: reasons.length > 0,
    };
  }

  function reserveSlot(clusterKey: string, saleDayKey: string) {
    capacityCounter.set(clusterKey, (capacityCounter.get(clusterKey) ?? 0) + 1);
    saleDayCounter.set(saleDayKey, (saleDayCounter.get(saleDayKey) ?? 0) + 1);
  }

  function getSaleMin(saleName: string) {
    return territoryBySale.get(saleName)?.minVisitsPerDay ?? settings.minVisitsPerSaleDay;
  }

  function appendWarning(visit: RouteVisit, warning: string) {
    visit.warning = visit.warning ? `${visit.warning} ${warning}` : warning;
  }

  function balanceSaleDailyMinimums() {
    for (let pass = 0; pass < 6; pass += 1) {
      const bySaleWeek = new Map<string, RouteVisit[]>();
      for (const visit of visits) {
        if (visit.status === "CS từ xa") continue;
        const key = `${visit.year}-${visit.month}-${visit.week}-${visit.outlet.salePhuTrach}-${visit.clusterId}`;
        bySaleWeek.set(key, [...(bySaleWeek.get(key) ?? []), visit]);
      }

      let moved = false;
      for (const weekVisits of bySaleWeek.values()) {
        const saleName = weekVisits[0]?.outlet.salePhuTrach;
        if (!saleName) continue;
        const min = getSaleMin(saleName);
        const max = getSaleMax(saleName);
        const dayGroups = new Map<string, RouteVisit[]>();

        for (const visit of weekVisits) {
          const key = `${visit.plannedDate}|${visit.dayName}`;
          dayGroups.set(key, [...(dayGroups.get(key) ?? []), visit]);
        }

        const groups = [...dayGroups.entries()].map(([key, items]) => {
          const [plannedDate, dayName] = key.split("|");
          return { plannedDate, dayName, items };
        });
        const smallGroups = groups.filter((group) => group.items.length > 0 && group.items.length < min).sort((a, b) => a.items.length - b.items.length);

        for (const source of smallGroups) {
          if (!source.items.every((item) => item.plannedDate === source.plannedDate && item.dayName === source.dayName)) continue;
          const target = groups
            .filter((group) => group !== source && group.items.length + source.items.length <= max && !isSaleUnavailable(saleName, group.plannedDate))
            .sort((a, b) => {
              const aReady = a.items.length >= min ? 0 : 1;
              const bReady = b.items.length >= min ? 0 : 1;
              const aDistance = Math.abs((dayIndexByName[a.dayName] ?? 1) - (dayIndexByName[source.dayName] ?? 1));
              const bDistance = Math.abs((dayIndexByName[b.dayName] ?? 1) - (dayIndexByName[source.dayName] ?? 1));
              return aReady - bReady || aDistance - bDistance || b.items.length - a.items.length;
            })[0];

          if (!target) {
            for (const visit of source.items) {
              appendWarning(visit, `Không đủ điểm để gom tuyến dưới min ${min} điểm/ngày.`);
            }
            continue;
          }

          for (const visit of source.items) {
            visit.dayName = target.dayName;
            visit.plannedDate = target.plannedDate;
            appendWarning(visit, `Tự gom từ ${source.dayName} sang ${target.dayName} vì ngày cũ dưới min ${min} điểm/ngày.`);
            target.items.push(visit);
          }
          source.items.length = 0;
          moved = true;
        }
      }

      if (!moved) break;
    }
  }

  for (const carryover of carryovers) {
    const outlet = outletById.get(carryover.outletId);
    if (!outlet) continue;
    const cluster = clusterById.get(outlet.cumNho);
    if (!cluster) continue;
    if (!isOutletAllowedByTerritory(outlet)) continue;
    if (outlet.frequency === "F0.5" || outlet.frequency === "F0.3") {
      lowFrequencyCarryoverOutlets.add(outlet.outletId);
    }
    const scheduledDayName = scheduledDayBySaleCluster.get(`${outlet.salePhuTrach}-${outlet.cumNho}`) ?? cluster.ngayDiCoDinh;
    const targetWeeks: WeekKey[] = outlet.frequency === "F4" || outlet.frequency === "F2" ? ["W1", "W2"] : ["W2", "W3"];
    const week = targetWeeks.find((candidate) => !findSlot(candidate, cluster, outlet.salePhuTrach, scheduledDayName).isFull) ?? targetWeeks[0];
    const slot = findSlot(week, cluster, outlet.salePhuTrach, scheduledDayName);
    reserveSlot(slot.clusterKey, slot.saleDayKey);

    visits.push({
      id: `${year}-${month}-${week}-${outlet.outletId}-BU-${carryover.sourceVisitId}`,
      month,
      year,
      week,
      dayName: slot.dayName,
      plannedDate: slot.plannedDate,
      clusterId: cluster.maCum,
      clusterName: cluster.tenCum,
      routeOrder: 0,
      outlet,
      frequency: outlet.frequency,
      status: "Chưa đi",
      warning: slot.warning,
      priorityReason: `Bù tuyến từ ${carryover.sourceWeek} tháng ${carryover.sourceMonth}/${carryover.sourceYear}: ${carryover.reason}`,
      isCarryover: true,
      carryoverReason: carryover.reason,
      sourceVisitId: carryover.sourceVisitId,
    });
  }

  for (const outlet of sorted) {
    if ((outlet.frequency === "F0.5" || outlet.frequency === "F0.3") && lowFrequencyCarryoverOutlets.has(outlet.outletId)) {
      continue;
    }
    const cluster = clusterById.get(outlet.cumNho);
    if (!cluster) continue;
    if (!isOutletAllowedByTerritory(outlet)) continue;
    const scheduledDayName = scheduledDayBySaleCluster.get(`${outlet.salePhuTrach}-${outlet.cumNho}`) ?? cluster.ngayDiCoDinh;
    const targetWeeks = getWeeksForOutlet(outlet, f2CounterByCluster, f1CounterByCluster);

    for (const week of targetWeeks) {
      const outletWeekKey = `${week}-${outlet.outletId}`;
      const outletWeekSequence = (outletWeekCounter.get(outletWeekKey) ?? 0) + 1;
      outletWeekCounter.set(outletWeekKey, outletWeekSequence);
      const plannedDayName = getPlannedDayName(scheduledDayName, outletWeekSequence);
      const slot = findSlot(week, cluster, outlet.salePhuTrach, plannedDayName);
      const isFlexibleLowFrequency = outlet.frequency === "F0.5" || outlet.frequency === "F0.3";
      const isRemote = isFlexibleLowFrequency && slot.isFull;

      if (!isRemote) {
        reserveSlot(slot.clusterKey, slot.saleDayKey);
      }

      visits.push({
        id: outletWeekSequence === 1 ? `${year}-${month}-${week}-${outlet.outletId}` : `${year}-${month}-${week}-${outlet.outletId}-V${outletWeekSequence}`,
        month,
        year,
        week,
        dayName: slot.dayName,
        plannedDate: slot.plannedDate,
        clusterId: cluster.maCum,
        clusterName: cluster.tenCum,
        routeOrder: 0,
        outlet,
        frequency: outlet.frequency,
        status: isRemote ? "CS từ xa" : "Chưa đi",
        warning: slot.warning,
        priorityReason: outlet.reason,
      });
    }
  }

  balanceSaleDailyMinimums();
  return assignDailyOrders(visits, clusters, saleStartPoints);
}

function getWeeksForOutlet(
  outlet: EnrichedOutlet,
  f2CounterByCluster: Map<string, number>,
  f1CounterByCluster: Map<string, number>,
): WeekKey[] {
  if (outlet.frequency === "F4") return weeks;
  if (outlet.frequency === "F8") return ["W1", "W1", "W2", "W2", "W3", "W3", "W4", "W4"];
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
  if (outlet.frequency === "F0.5") return ["W4"];
  return ["W4"];
}

function getPlannedDayName(baseDayName: string, sequence: number): string {
  if (sequence <= 1) return baseDayName;
  const baseIndex = dayIndexByName[baseDayName] ?? 1;
  const nextIndex = Math.min(6, baseIndex + 2 * (sequence - 1));
  return dayNameByIndex[nextIndex];
}

export function getPlannedDate(year: number, month: number, week: WeekKey, dayName: string): string {
  const weekIndex = weeks.indexOf(week);
  const startDay = weekIndex * 7 + 1;
  const targetDay = dayIndexByName[dayName] ?? 1;
  const lastDay = new Date(year, month, 0).getDate();

  for (let day = startDay; day <= Math.min(startDay + 6, lastDay); day += 1) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === targetDay) return toDateInputValue(date);
  }

  return toDateInputValue(new Date(year, month - 1, Math.min(startDay, lastDay)));
}

function toDateInputValue(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function orderVisitsFromStart(group: RouteVisit[], startPoint?: { toaDoX: number; toaDoY: number }): RouteVisit[] {
  const remaining = [...group];
  const ordered: RouteVisit[] = [];
  let cursor = startPoint ? { toaDoX: startPoint.toaDoX, toaDoY: startPoint.toaDoY } : { toaDoX: group[0].outlet.toaDoX, toaDoY: group[0].outlet.toaDoY };

  while (remaining.length) {
    remaining.sort((a, b) => {
      const distanceDiff = distanceBetween(cursor, a.outlet) - distanceBetween(cursor, b.outlet);
      if (Math.abs(distanceDiff) > 0.001) return distanceDiff;
      const frequencyDiff = frequencyRank[b.frequency] - frequencyRank[a.frequency];
      if (frequencyDiff !== 0) return frequencyDiff;
      return b.outlet.totalScore - a.outlet.totalScore;
    });
    const next = remaining.shift();
    if (!next) break;
    ordered.push(next);
    cursor = { toaDoX: next.outlet.toaDoX, toaDoY: next.outlet.toaDoY };
  }

  return reduceRouteZigzag(ordered, startPoint);
}

function routeDistance(route: RouteVisit[], startPoint?: { toaDoX: number; toaDoY: number }) {
  if (!route.length) return 0;
  let total = startPoint ? distanceBetween(startPoint, route[0].outlet) : 0;
  for (let index = 1; index < route.length; index += 1) {
    total += distanceBetween(route[index - 1].outlet, route[index].outlet);
  }
  return total;
}

function reduceRouteZigzag(route: RouteVisit[], startPoint?: { toaDoX: number; toaDoY: number }) {
  if (route.length < 4) return route;
  let best = [...route];
  let improved = true;
  let guard = 0;

  while (improved && guard < 8) {
    improved = false;
    guard += 1;
    for (let left = 0; left < best.length - 2; left += 1) {
      for (let right = left + 2; right < best.length; right += 1) {
        const candidate = [...best.slice(0, left), ...best.slice(left, right + 1).reverse(), ...best.slice(right + 1)];
        if (routeDistance(candidate, startPoint) + 0.000001 < routeDistance(best, startPoint)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }

  return best;
}

function getClusterCenter(group: RouteVisit[], cluster?: RouteCluster) {
  if (cluster) return { toaDoX: cluster.toaDoTamX, toaDoY: cluster.toaDoTamY };
  return {
    toaDoX: group.reduce((sum, visit) => sum + visit.outlet.toaDoX, 0) / group.length,
    toaDoY: group.reduce((sum, visit) => sum + visit.outlet.toaDoY, 0) / group.length,
  };
}

function orderSaleDayRoute(group: RouteVisit[], clusterById: Map<string, RouteCluster>, startPoint?: SaleStartPoint): RouteVisit[] {
  const routeStart = startPoint ?? getClusterCenter(group, clusterById.get(group[0].clusterId));
  return orderVisitsFromStart(group, routeStart);
}

function assignDailyOrders(visits: RouteVisit[], clusters: RouteCluster[], saleStartPoints: SaleStartPoint[] = []): RouteVisit[] {
  const clusterById = new Map(clusters.map((cluster) => [cluster.maCum, cluster]));
  const defaultStartBySale = new Map(saleStartPoints.filter((point) => !point.date).map((point) => [point.salePhuTrach, point]));
  const dateStartBySale = new Map(saleStartPoints.filter((point) => point.date).map((point) => [`${point.date}-${point.salePhuTrach}`, point]));
  const grouped = new Map<string, RouteVisit[]>();

  for (const visit of visits) {
    const key = `${visit.plannedDate}-${visit.outlet.salePhuTrach}-${visit.clusterId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), visit]);
  }

  const ordered: RouteVisit[] = [];
  for (const [, group] of grouped) {
    const cluster = clusterById.get(group[0].clusterId);
    if (!cluster) {
      ordered.push(...group);
      continue;
    }
    const startPoint = dateStartBySale.get(`${group[0].plannedDate}-${group[0].outlet.salePhuTrach}`) ?? defaultStartBySale.get(group[0].outlet.salePhuTrach);
    const orderedGroup = startPoint
      ? orderSaleDayRoute(group, clusterById, startPoint)
      : group.length > 1
        ? orderSaleDayRoute(group, clusterById)
        : optimizeDailyRoute(group.map((visit) => visit.outlet), cluster).map((outlet) => group.find((visit) => visit.outlet.outletId === outlet.outletId)).filter((visit): visit is RouteVisit => Boolean(visit));
    ordered.push(...orderedGroup.map((visit, index) => ({ ...visit, routeOrder: index + 1 })));
  }

  return ordered.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.routeOrder - b.routeOrder);
}

export function getOverloadedClusters(plan: RouteVisit[], clusters: RouteCluster[]) {
  const capacityByCluster = new Map(clusters.map((cluster) => [cluster.maCum, cluster.capacityNgay]));
  const counts = new Map<string, { week: WeekKey; clusterId: string; clusterName: string; visits: number; capacity: number }>();

  for (const visit of plan.filter((item) => item.status !== "CS từ xa")) {
    const key = `${visit.week}-${visit.clusterId}-${visit.dayName}`;
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
