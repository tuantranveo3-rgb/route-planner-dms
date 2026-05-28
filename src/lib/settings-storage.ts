import { DEFAULT_SETTINGS } from "@/lib/route-logic";
import type { PlannerSettings } from "@/types/route";

export const SETTINGS_STORAGE_KEY = "route-planner-dms-settings-v1";

export function loadPlannerSettings(): PlannerSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PlannerSettings>) };
}

export function savePlannerSettings(settings: PlannerSettings) {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
