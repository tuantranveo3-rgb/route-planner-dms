import type { RouteCluster } from "@/types/cluster";
import type { Outlet } from "@/types/outlet";
import type { SalesTerritory } from "@/types/territory";

export function summarizeTerritories(territories: SalesTerritory[], outlets: Outlet[], clusters: RouteCluster[]) {
  return territories.map((territory) => {
    const territoryOutlets = outlets.filter((outlet) => territory.cumNhoPhuTrach.includes(outlet.cumNho));
    const clusterNames = clusters
      .filter((cluster) => territory.cumNhoPhuTrach.includes(cluster.maCum))
      .map((cluster) => `${cluster.maCum} - ${cluster.tenCum}`);
    const actualSalesInArea = [...new Set(territoryOutlets.map((outlet) => outlet.salePhuTrach))];
    const mismatchedOutlets = territoryOutlets.filter((outlet) => outlet.salePhuTrach !== territory.salePhuTrach);

    return {
      ...territory,
      clusterNames,
      outletCount: territoryOutlets.length,
      actualSalesInArea,
      mismatchedOutletCount: mismatchedOutlets.length,
    };
  });
}

export function findUnassignedClusters(territories: SalesTerritory[], clusters: RouteCluster[]) {
  const assigned = new Set(territories.flatMap((territory) => territory.cumNhoPhuTrach));
  return clusters.filter((cluster) => !assigned.has(cluster.maCum));
}
