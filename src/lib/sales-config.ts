import { salesTerritories } from "@/lib/seed-data";
import type { RouteCluster } from "@/types/cluster";
import type { Outlet } from "@/types/outlet";
import type { SalesTerritory } from "@/types/territory";

export const SALES_CONFIG_STORAGE_KEY = "route-planner-dms-sales-config-v1";

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function loadSalesConfig(): SalesTerritory[] {
  if (typeof window === "undefined") return salesTerritories;
  const raw = window.localStorage.getItem(SALES_CONFIG_STORAGE_KEY);
  if (!raw) return salesTerritories;
  let parsed: SalesTerritory[];
  try {
    const value = JSON.parse(raw);
    parsed = Array.isArray(value) ? (value as SalesTerritory[]) : [];
  } catch {
    parsed = [];
  }
  if (!parsed.length) return salesTerritories;
  const fallbackSaleNames = new Set(salesTerritories.map((item) => item.salePhuTrach));
  const parsedExtras = parsed.filter((item) => item.salePhuTrach && !fallbackSaleNames.has(item.salePhuTrach));
  const parsedBySale = new Map(parsed.map((item) => [item.salePhuTrach, item]));
  const normalizedFallbacks = salesTerritories.map((fallback) => {
    const item = parsedBySale.get(fallback.salePhuTrach) ?? fallback;
    return {
      ...fallback,
      ...item,
      khuVucPhuTrach: asArray(item.khuVucPhuTrach).length ? asArray(item.khuVucPhuTrach) : fallback.khuVucPhuTrach,
      cumNhoPhuTrach: asArray(item.cumNhoPhuTrach).length ? asArray(item.cumNhoPhuTrach) : fallback.cumNhoPhuTrach,
      ngayDiUuTien: asArray(item.ngayDiUuTien).length ? asArray(item.ngayDiUuTien) : fallback.ngayDiUuTien,
      lichTheoNgay: Array.isArray(item.lichTheoNgay) && item.lichTheoNgay.length ? item.lichTheoNgay : fallback.lichTheoNgay,
      minVisitsPerDay: item.minVisitsPerDay ?? fallback?.minVisitsPerDay ?? 6,
      maxVisitsPerDay: item.maxVisitsPerDay ?? fallback?.maxVisitsPerDay ?? 15,
      saleBackup: item.saleBackup || fallback?.saleBackup || "",
      ghiChu: item.ghiChu || fallback?.ghiChu || "",
    };
  });
  return [
    ...normalizedFallbacks,
    ...parsedExtras.map((item) => ({
      ...item,
      khuVucPhuTrach: asArray(item.khuVucPhuTrach),
      cumNhoPhuTrach: asArray(item.cumNhoPhuTrach),
      ngayDiUuTien: asArray(item.ngayDiUuTien),
      lichTheoNgay: Array.isArray(item.lichTheoNgay) ? item.lichTheoNgay : [],
      minVisitsPerDay: item.minVisitsPerDay ?? 6,
      maxVisitsPerDay: item.maxVisitsPerDay ?? 15,
      saleBackup: item.saleBackup || "",
      ghiChu: item.ghiChu || "",
    })),
  ];
}

export function saveSalesConfig(config: SalesTerritory[]) {
  window.localStorage.setItem(SALES_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function syncSalesConfigWithOutlets(config: SalesTerritory[], outlets: Outlet[], clusters: RouteCluster[]) {
  const bySale = new Map(config.map((item) => [item.salePhuTrach, item]));
  const clusterById = new Map(clusters.map((cluster) => [cluster.maCum, cluster]));
  const days = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

  Array.from(new Set(outlets.map((outlet) => outlet.salePhuTrach).filter(Boolean))).forEach((saleName) => {
    const saleOutlets = outlets.filter((outlet) => outlet.salePhuTrach === saleName);
    const districts = Array.from(new Set(saleOutlets.map((outlet) => outlet.quanHuyen).filter(Boolean)));
    const clusterIds = Array.from(new Set(saleOutlets.map((outlet) => outlet.cumNho).filter(Boolean)));
    const existing = bySale.get(saleName);

    const mergedClusterIds = Array.from(new Set([...(existing?.cumNhoPhuTrach ?? []), ...clusterIds]));
    const scheduleByDay = new Map<string, Set<string>>();
    (existing?.lichTheoNgay ?? []).forEach((item) => {
      scheduleByDay.set(item.dayName, new Set(item.clusterIds.filter((clusterId) => mergedClusterIds.includes(clusterId))));
    });
    clusterIds.forEach((clusterId, index) => {
      if ([...scheduleByDay.values()].some((set) => set.has(clusterId))) return;
      const dayName = clusterById.get(clusterId)?.ngayDiCoDinh ?? days[index % days.length];
      const set = scheduleByDay.get(dayName) ?? new Set<string>();
      set.add(clusterId);
      scheduleByDay.set(dayName, set);
    });

    bySale.set(saleName, {
      salePhuTrach: saleName,
      khuVucPhuTrach: Array.from(new Set([...(existing?.khuVucPhuTrach ?? []), ...districts])),
      cumNhoPhuTrach: mergedClusterIds,
      saleBackup: existing?.saleBackup ?? "",
      ngayDiUuTien: [...scheduleByDay.keys()],
      lichTheoNgay: [...scheduleByDay.entries()].map(([dayName, set]) => ({ dayName, clusterIds: [...set] })),
      minVisitsPerDay: existing?.minVisitsPerDay ?? 6,
      maxVisitsPerDay: existing?.maxVisitsPerDay ?? 15,
      ghiChu: existing?.ghiChu ?? "Tự tạo từ file import điểm bán.",
    });
  });

  return [...bySale.values()];
}

export function getSaleLimits(config: SalesTerritory[], saleName: string, fallbackMin: number, fallbackMax: number) {
  const sale = config.find((item) => item.salePhuTrach === saleName);
  return {
    min: sale?.minVisitsPerDay ?? fallbackMin,
    max: sale?.maxVisitsPerDay ?? fallbackMax,
  };
}
