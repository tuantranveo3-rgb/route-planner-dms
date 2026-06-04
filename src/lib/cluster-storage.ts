import { clusters as seedClusters } from "@/lib/seed-data";
import type { RouteCluster } from "@/types/cluster";

export const CLUSTER_STORAGE_KEY = "route-planner-dms-clusters-v1";

export function loadClusters(): RouteCluster[] {
  if (typeof window === "undefined") return seedClusters;
  const raw = window.localStorage.getItem(CLUSTER_STORAGE_KEY);
  if (!raw) return seedClusters;

  try {
    const parsed = JSON.parse(raw) as RouteCluster[];
    return Array.isArray(parsed) && parsed.length ? parsed : seedClusters;
  } catch {
    return seedClusters;
  }
}

export function saveClusters(clusters: RouteCluster[]) {
  window.localStorage.setItem(CLUSTER_STORAGE_KEY, JSON.stringify(clusters));
}

export function resetClusters() {
  window.localStorage.removeItem(CLUSTER_STORAGE_KEY);
}
