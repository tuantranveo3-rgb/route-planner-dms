import type { SaleUnavailableDay } from "@/types/route";

export const UNAVAILABLE_STORAGE_KEY = "route-planner-dms-sale-unavailable-days-v1";

export function loadSaleUnavailableDays(): SaleUnavailableDay[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(UNAVAILABLE_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SaleUnavailableDay[];
  } catch {
    return [];
  }
}

export function saveSaleUnavailableDays(days: SaleUnavailableDay[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(UNAVAILABLE_STORAGE_KEY, JSON.stringify(days));
}
