"use client";

import { useEffect, useMemo, useState } from "react";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { MetricCard } from "@/components/MetricCard";
import { OverloadWarning } from "@/components/OverloadWarning";
import { PageHeader } from "@/components/PageHeader";
import { loadClusters } from "@/lib/cluster-storage";
import { formatNumber } from "@/lib/format";
import { loadOutlets } from "@/lib/outlet-storage";
import { clusters, salesTerritories, seedOutlets } from "@/lib/seed-data";
import { DEFAULT_SETTINGS, enrichOutlets, generateMonthlyRoutePlan, getOverloadedClusters } from "@/lib/route-logic";
import { loadSalesConfig } from "@/lib/sales-config";
import type { Frequency, Outlet } from "@/types/outlet";
import type { RouteCluster } from "@/types/cluster";
import type { SalesTerritory } from "@/types/territory";

const month = new Date().getMonth() + 1;
const year = new Date().getFullYear();

function buildActiveTerritories(outlets: Outlet[], savedConfig: SalesTerritory[]): SalesTerritory[] {
  const saleOptions = Array.from(new Set(outlets.map((outlet) => outlet.salePhuTrach))).filter(Boolean);
  return saleOptions.map((saleName) => {
    const existing = savedConfig.find((item) => item.salePhuTrach === saleName);
    const ownerOutlets = outlets.filter((outlet) => outlet.salePhuTrach === saleName);
    const khuVucPhuTrach = Array.from(new Set(ownerOutlets.map((outlet) => outlet.quanHuyen))).filter(Boolean);
    const cumNhoPhuTrach = Array.from(new Set(ownerOutlets.map((outlet) => outlet.cumNho))).filter(Boolean);
    return {
      ...(existing ?? {
        salePhuTrach: saleName,
        saleBackup: "",
        minVisitsPerDay: DEFAULT_SETTINGS.minVisitsPerSaleDay,
        maxVisitsPerDay: DEFAULT_SETTINGS.maxVisitsPerSaleDay,
        ngayDiUuTien: [],
        lichTheoNgay: [],
        ghiChu: "",
      }),
      khuVucPhuTrach: existing?.khuVucPhuTrach.length ? existing.khuVucPhuTrach : khuVucPhuTrach,
      cumNhoPhuTrach: existing?.cumNhoPhuTrach.length ? existing.cumNhoPhuTrach : cumNhoPhuTrach,
    };
  });
}

function getSaleWarnings(plan: ReturnType<typeof generateMonthlyRoutePlan>, territories: SalesTerritory[]) {
  const territoryBySale = new Map(territories.map((territory) => [territory.salePhuTrach, territory]));
  const grouped = new Map<string, { sale: string; week: string; dayName: string; visits: number; min: number; max: number }>();

  for (const visit of plan.filter((item) => !item.status.startsWith("CS"))) {
    const territory = territoryBySale.get(visit.outlet.salePhuTrach);
    const min = territory?.minVisitsPerDay ?? DEFAULT_SETTINGS.minVisitsPerSaleDay;
    const max = territory?.maxVisitsPerDay ?? DEFAULT_SETTINGS.maxVisitsPerSaleDay;
    const key = `${visit.week}-${visit.dayName}-${visit.outlet.salePhuTrach}`;
    const current = grouped.get(key) ?? {
      sale: visit.outlet.salePhuTrach,
      week: visit.week,
      dayName: visit.dayName,
      visits: 0,
      min,
      max,
    };
    current.visits += 1;
    grouped.set(key, current);
  }

  return [...grouped.values()].filter((item) => item.visits < item.min || item.visits > item.max);
}

export default function DashboardPage() {
  const [sourceOutlets, setSourceOutlets] = useState<Outlet[]>(seedOutlets);
  const [salesConfig, setSalesConfig] = useState<SalesTerritory[]>(salesTerritories);
  const [routeClusters, setRouteClusters] = useState<RouteCluster[]>(clusters);

  useEffect(() => {
    setSourceOutlets(loadOutlets());
    setSalesConfig(loadSalesConfig());
    setRouteClusters(loadClusters());
  }, []);

  const activeTerritories = useMemo(() => buildActiveTerritories(sourceOutlets, salesConfig), [sourceOutlets, salesConfig]);
  const outlets = useMemo(() => enrichOutlets(sourceOutlets), [sourceOutlets]);
  const plan = useMemo(() => generateMonthlyRoutePlan(month, year, sourceOutlets, routeClusters, undefined, [], [], activeTerritories), [activeTerritories, sourceOutlets, routeClusters]);
  const counts = useMemo(
    () =>
      outlets.reduce<Record<Frequency, number>>(
        (acc, outlet) => {
          acc[outlet.frequency] += 1;
          return acc;
        },
        { F8: 0, F4: 0, F2: 0, F1: 0, "F0.5": 0, "F0.3": 0 },
      ),
    [outlets],
  );
  const monthlyVisits = Number(outlets.reduce((sum, outlet) => sum + outlet.monthlyVisits, 0).toFixed(1));
  const averageDailyVisits = Number((monthlyVisits / DEFAULT_SETTINGS.workingDaysPerMonth).toFixed(1));
  const overloaded = getOverloadedClusters(plan, routeClusters);
  const saleWarningItems = useMemo(() => getSaleWarnings(plan, activeTerritories), [activeTerritories, plan]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Tổng quan năng lực tuyến theo tần suất F và cụm nhỏ. MVP luôn gom theo phường/xã/cụm đường, không gom tuyến theo quận lớn."
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Tổng điểm bán" value={outlets.length} hint="Dữ liệu import hiện tại" />
        <MetricCard label="Tổng lượt ghé/tháng" value={formatNumber(monthlyVisits)} hint="F8=8, F4=4, F2=2, F1=1, F0.5=1/2 tháng, F0.3=1/3 tháng" />
        <MetricCard label="Lượt ghé/ngày bình quân" value={formatNumber(averageDailyVisits)} hint={`${DEFAULT_SETTINGS.workingDaysPerMonth} ngày làm việc/tháng`} />
        <MetricCard label="Cảnh báo sale/ngày" value={saleWarningItems.length} hint="Theo min/max riêng từng sale" />
        <MetricCard label="Cụm quá tải" value={overloaded.length} hint="Theo capacity cụm/ngày" />
      </div>

      <div className="mb-6 rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Phân vùng sale theo khu vực</h2>
          <a className="rounded-md border border-line px-3 py-2 text-sm font-bold text-ink" href="/territories">
            Xem phân vùng
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {activeTerritories.map((territory) => (
            <div key={territory.salePhuTrach} className="rounded-md border border-line p-3">
              <div className="font-bold">{territory.salePhuTrach}</div>
              <div className="mt-1 text-sm text-muted">{territory.khuVucPhuTrach.join(", ")}</div>
              <div className="mt-2 text-sm">Cụm: {territory.cumNhoPhuTrach.join(", ")}</div>
              <div className="mt-1 text-xs text-muted">Backup: {territory.saleBackup || "Chưa set"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {(Object.keys(counts) as Frequency[]).map((frequency) => (
          <div key={frequency} className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Điểm bán {frequency}</span>
              <FrequencyBadge frequency={frequency} />
            </div>
            <div className="text-3xl font-bold text-ink">{counts[frequency]}</div>
          </div>
        ))}
      </div>

      <OverloadWarning
        title="Theo dõi min/max sale/ngày và cụm vượt capacity"
        items={[
          ...saleWarningItems.map((item) =>
            item.visits > item.max
              ? `${item.week} ${item.dayName} - ${item.sale}: ${item.visits} điểm, vượt max ${item.max}.`
              : `${item.week} ${item.dayName} - ${item.sale}: ${item.visits} điểm, dưới min ${item.min}.`,
          ),
          ...overloaded.map((item) => `${item.week} - ${item.clusterName}: ${item.visits}/${item.capacity} điểm. Quá tải, cần tách cụm hoặc hạ tần suất.`),
        ]}
      />

      <div className="mt-6 rounded-lg border border-line bg-white p-5 shadow-soft">
        <h2 className="mb-3 text-lg font-bold">Cụm tuyến cần chú ý</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {routeClusters.map((cluster) => {
            const clusterOutlets = outlets.filter((outlet) => outlet.cumNho === cluster.maCum);
            const clusterVisits = Number(clusterOutlets.reduce((sum, outlet) => sum + outlet.monthlyVisits, 0).toFixed(1));
            return (
              <div key={cluster.maCum} className="rounded-md border border-line p-3">
                <div className="font-bold">{cluster.maCum} - {cluster.tenCum}</div>
                <div className="mt-1 text-sm text-muted">{cluster.danhSachPhuongXa.join(", ")}</div>
                <div className="mt-2 text-sm">{clusterOutlets.length} điểm bán, {formatNumber(clusterVisits)} lượt/tháng, ngày cố định {cluster.ngayDiCoDinh}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
