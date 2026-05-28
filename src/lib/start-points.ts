import { saleStartPoints } from "@/lib/seed-data";
import type { SaleStartPoint } from "@/types/route";

export const START_POINTS_STORAGE_KEY = "route-planner-dms-sale-start-points-v1";

export function loadStartPoints(): SaleStartPoint[] {
  if (typeof window === "undefined") return saleStartPoints;
  const raw = window.localStorage.getItem(START_POINTS_STORAGE_KEY);
  if (!raw) return saleStartPoints;

  try {
    const parsed = JSON.parse(raw) as SaleStartPoint[];
    return parsed.length ? parsed : saleStartPoints;
  } catch {
    return saleStartPoints;
  }
}

export function saveStartPoints(points: SaleStartPoint[]) {
  window.localStorage.setItem(START_POINTS_STORAGE_KEY, JSON.stringify(points));
}
