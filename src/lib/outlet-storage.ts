import { seedOutlets } from "@/lib/seed-data";
import type { Outlet } from "@/types/outlet";

export const OUTLET_STORAGE_KEY = "route-planner-dms-imported-outlets-v1";

export function loadOutlets(): Outlet[] {
  if (typeof window === "undefined") return seedOutlets;
  const raw = window.localStorage.getItem(OUTLET_STORAGE_KEY);
  if (!raw) return seedOutlets;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as Outlet[]) : seedOutlets;
  } catch {
    return seedOutlets;
  }
}

export function saveOutlets(outlets: Outlet[]) {
  window.localStorage.setItem(OUTLET_STORAGE_KEY, JSON.stringify(outlets));
}

export function clearImportedOutlets() {
  window.localStorage.removeItem(OUTLET_STORAGE_KEY);
}
