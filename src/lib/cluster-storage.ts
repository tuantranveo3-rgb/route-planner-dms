import { clusters as seedClusters } from "@/lib/seed-data";
import type { RouteCluster } from "@/types/cluster";

export const CLUSTER_STORAGE_KEY = "route-planner-dms-clusters-v1";

function isVietnamCoordinate(x: number, y: number) {
  return x >= 102 && x <= 110 && y >= 8 && y <= 24;
}

function normalizeClusterCenter(cluster: RouteCluster): RouteCluster {
  if (isVietnamCoordinate(cluster.toaDoTamX, cluster.toaDoTamY)) return cluster;
  if (!isVietnamCoordinate(cluster.toaDoTamY, cluster.toaDoTamX)) return cluster;
  return {
    ...cluster,
    toaDoTamX: cluster.toaDoTamY,
    toaDoTamY: cluster.toaDoTamX,
  };
}

export function loadClusters(): RouteCluster[] {
  if (typeof window === "undefined") return seedClusters;
  const raw = window.localStorage.getItem(CLUSTER_STORAGE_KEY);
  if (!raw) return seedClusters;

  try {
    const parsed = JSON.parse(raw) as RouteCluster[];
    return Array.isArray(parsed) && parsed.length ? parsed.map(normalizeClusterCenter) : seedClusters;
  } catch {
    return seedClusters;
  }
}

export function saveClusters(clusters: RouteCluster[]) {
  window.localStorage.setItem(CLUSTER_STORAGE_KEY, JSON.stringify(clusters.map(normalizeClusterCenter)));
}

export function resetClusters() {
  window.localStorage.removeItem(CLUSTER_STORAGE_KEY);
}
