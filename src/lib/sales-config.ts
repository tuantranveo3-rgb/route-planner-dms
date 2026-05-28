import { salesTerritories } from "@/lib/seed-data";
import type { SalesTerritory } from "@/types/territory";

export const SALES_CONFIG_STORAGE_KEY = "route-planner-dms-sales-config-v1";

export function loadSalesConfig(): SalesTerritory[] {
  if (typeof window === "undefined") return salesTerritories;
  const raw = window.localStorage.getItem(SALES_CONFIG_STORAGE_KEY);
  if (!raw) return salesTerritories;
  const parsed = JSON.parse(raw) as SalesTerritory[];
  if (!parsed.length) return salesTerritories;
  return parsed.map((item) => {
    const fallback = salesTerritories.find((territory) => territory.salePhuTrach === item.salePhuTrach);
    return {
      ...fallback,
      ...item,
      khuVucPhuTrach: item.khuVucPhuTrach?.length ? item.khuVucPhuTrach : fallback?.khuVucPhuTrach ?? [],
      cumNhoPhuTrach: item.cumNhoPhuTrach?.length ? item.cumNhoPhuTrach : fallback?.cumNhoPhuTrach ?? [],
      ngayDiUuTien: item.ngayDiUuTien?.length ? item.ngayDiUuTien : fallback?.ngayDiUuTien ?? [],
      minVisitsPerDay: item.minVisitsPerDay ?? fallback?.minVisitsPerDay ?? 6,
      maxVisitsPerDay: item.maxVisitsPerDay ?? fallback?.maxVisitsPerDay ?? 15,
      saleBackup: item.saleBackup || fallback?.saleBackup || "",
      ghiChu: item.ghiChu || fallback?.ghiChu || "",
    };
  });
}

export function saveSalesConfig(config: SalesTerritory[]) {
  window.localStorage.setItem(SALES_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function getSaleLimits(config: SalesTerritory[], saleName: string, fallbackMin: number, fallbackMax: number) {
  const sale = config.find((item) => item.salePhuTrach === saleName);
  return {
    min: sale?.minVisitsPerDay ?? fallbackMin,
    max: sale?.maxVisitsPerDay ?? fallbackMax,
  };
}
