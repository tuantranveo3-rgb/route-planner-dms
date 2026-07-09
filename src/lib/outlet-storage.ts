import { seedOutlets } from "@/lib/seed-data";
import type { Outlet } from "@/types/outlet";

export const OUTLET_STORAGE_KEY = "route-planner-dms-imported-outlets-v1";

function isVietnamCoordinate(x: number, y: number) {
  return x >= 102 && x <= 110 && y >= 8 && y <= 24;
}

function normalizeOutletCoordinates(outlet: Outlet): Outlet {
  if (isVietnamCoordinate(outlet.toaDoX, outlet.toaDoY)) return outlet;
  if (!isVietnamCoordinate(outlet.toaDoY, outlet.toaDoX)) return outlet;
  return {
    ...outlet,
    toaDoX: outlet.toaDoY,
    toaDoY: outlet.toaDoX,
  };
}

export function loadOutlets(): Outlet[] {
  if (typeof window === "undefined") return seedOutlets;
  const raw = window.localStorage.getItem(OUTLET_STORAGE_KEY);
  if (!raw) return seedOutlets;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as Outlet[]).map(normalizeOutletCoordinates) : seedOutlets;
  } catch {
    return seedOutlets;
  }
}

export function saveOutlets(outlets: Outlet[]) {
  window.localStorage.setItem(OUTLET_STORAGE_KEY, JSON.stringify(outlets.map(normalizeOutletCoordinates)));
}

export function clearImportedOutlets() {
  window.localStorage.removeItem(OUTLET_STORAGE_KEY);
}
