"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { loadClusters } from "@/lib/cluster-storage";
import { loadOutlets } from "@/lib/outlet-storage";
import { buildCarryoversForNextMonth, buildLowFrequencyHistoryCarryovers, EXECUTION_STORAGE_KEY, recordsForPeriod, summarizeExecution } from "@/lib/route-execution";
import { generateMonthlyRoutePlan } from "@/lib/route-logic";
import { clusters, salesTerritories, seedOutlets } from "@/lib/seed-data";
import { loadSalesConfig } from "@/lib/sales-config";
import { loadPlannerSettings } from "@/lib/settings-storage";
import type { Frequency, Outlet } from "@/types/outlet";
import type { RouteCluster } from "@/types/cluster";
import type { PlannerSettings, RouteExecutionRecord, RouteVisit } from "@/types/route";
import { DEFAULT_SETTINGS } from "@/lib/route-logic";
import type { SalesTerritory } from "@/types/territory";

type SaleReportRow = {
  sale: string;
  required: number;
  completed: number;
  missed: number;
  completionRate: number;
  carryover: number;
  f8: number;
  f4: number;
  f2: number;
  f1: number;
  f05: number;
  f03: number;
  revenue: number;
};

type ReportView = "month" | "sale" | "revenue" | "route" | "multi";

function getPreviousPeriod(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function monthLabel(month: number, year: number) {
  return `Tháng ${month}/${year}`;
}

export default function ReportsPage() {
  const year = new Date().getFullYear();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [sale, setSale] = useState("all");
  const [reportView, setReportView] = useState<ReportView>("month");
  const [records, setRecords] = useState<RouteExecutionRecord[]>([]);
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULT_SETTINGS);
  const [salesConfig, setSalesConfig] = useState<SalesTerritory[]>(salesTerritories);
  const [outlets, setOutlets] = useState<Outlet[]>(seedOutlets);
  const [routeClusters, setRouteClusters] = useState<RouteCluster[]>(clusters);

  useEffect(() => {
    const raw = window.localStorage.getItem(EXECUTION_STORAGE_KEY);
    if (raw) setRecords(JSON.parse(raw) as RouteExecutionRecord[]);
    setSettings(loadPlannerSettings());
    setSalesConfig(loadSalesConfig());
    setOutlets(loadOutlets());
    setRouteClusters(loadClusters());
  }, []);

  const saleOptions = useMemo(() => Array.from(new Set(outlets.map((outlet) => outlet.salePhuTrach))).filter(Boolean), [outlets]);
  const previousPeriod = getPreviousPeriod(month, year);
  const previousPlan = useMemo(() => generateMonthlyRoutePlan(previousPeriod.month, previousPeriod.year, outlets, routeClusters, settings, [], [], salesConfig), [previousPeriod.month, previousPeriod.year, outlets, routeClusters, settings, salesConfig]);
  const previousRecords = useMemo(() => recordsForPeriod(records, previousPeriod.month, previousPeriod.year), [records, previousPeriod.month, previousPeriod.year]);
  const carryovers = useMemo(() => {
    const previousCarryovers = buildCarryoversForNextMonth(previousPlan, previousRecords);
    const historyCarryovers = buildLowFrequencyHistoryCarryovers(outlets, records, month, year, settings);
    const byOutlet = new Map([...previousCarryovers, ...historyCarryovers].map((item) => [item.outletId, item]));
    return [...byOutlet.values()];
  }, [previousPlan, previousRecords, outlets, records, month, year, settings]);
  const plan = useMemo(() => generateMonthlyRoutePlan(month, year, outlets, routeClusters, settings, carryovers, [], salesConfig), [month, year, outlets, routeClusters, settings, carryovers, salesConfig]);
  const currentRecords = useMemo(() => recordsForPeriod(records, month, year), [records, month, year]);
  const filteredPlan = sale === "all" ? plan : plan.filter((visit) => visit.outlet.salePhuTrach === sale);
  const summary = summarizeExecution(filteredPlan, currentRecords);
  const filteredRecords = sale === "all" ? currentRecords : currentRecords.filter((record) => record.salePhuTrach === sale);
  const actualRevenue = filteredRecords.reduce((sum, record) => sum + (record.actualRevenue ?? 0), 0);
  const lowFrequencyCarryovers = carryovers.filter((carryover) => {
    const outlet = plan.find((visit) => visit.outlet.outletId === carryover.outletId)?.outlet;
    return outlet?.frequency === "F0.5" || outlet?.frequency === "F0.3";
  }).length;

  const frequencyCounts = filteredPlan.reduce<Record<Frequency, number>>(
    (acc, visit) => {
      acc[visit.frequency] += 1;
      return acc;
    },
    { F8: 0, F4: 0, F2: 0, F1: 0, "F0.5": 0, "F0.3": 0 },
  );

  useEffect(() => {
    if (sale !== "all" && !saleOptions.includes(sale)) {
      setSale("all");
    }
  }, [sale, saleOptions]);

  const saleRows: SaleReportRow[] = saleOptions.map((owner) => {
    const ownerPlan = plan.filter((visit) => visit.outlet.salePhuTrach === owner);
    const ownerSummary = summarizeExecution(ownerPlan, currentRecords);
    const ownerFreq = ownerPlan.reduce<Record<Frequency, number>>(
      (acc, visit) => {
        acc[visit.frequency] += 1;
        return acc;
      },
      { F8: 0, F4: 0, F2: 0, F1: 0, "F0.5": 0, "F0.3": 0 },
    );
    return {
      sale: owner,
      required: ownerSummary.required,
      completed: ownerSummary.completed,
      missed: ownerSummary.missed,
      completionRate: ownerSummary.completionRate,
      carryover: ownerPlan.filter((visit) => visit.isCarryover).length,
      f8: ownerFreq.F8,
      f4: ownerFreq.F4,
      f2: ownerFreq.F2,
      f1: ownerFreq.F1,
      f05: ownerFreq["F0.5"],
      f03: ownerFreq["F0.3"],
      revenue: currentRecords.filter((record) => record.salePhuTrach === owner).reduce((sum, record) => sum + (record.actualRevenue ?? 0), 0),
    };
  });

  const routeRows = routeClusters.map((cluster) => {
    const clusterPlan = filteredPlan.filter((visit) => visit.clusterId === cluster.maCum);
    const clusterRecords = filteredRecords.filter((record) => record.clusterId === cluster.maCum);
    const clusterSummary = summarizeExecution(clusterPlan, currentRecords);
    return {
      clusterId: cluster.maCum,
      clusterName: cluster.tenCum,
      district: cluster.quanHuyen,
      required: clusterSummary.required,
      completed: clusterSummary.completed,
      missed: clusterSummary.missed,
      revenue: clusterRecords.reduce((sum, record) => sum + (record.actualRevenue ?? 0), 0),
    };
  }).filter((row) => row.required || row.revenue);

  const multiMonthRows = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(year, month - 1 - index, 1);
      const itemMonth = date.getMonth() + 1;
      const itemYear = date.getFullYear();
      const monthPlan = generateMonthlyRoutePlan(itemMonth, itemYear, outlets, routeClusters, settings, [], [], salesConfig);
      const monthRecords = recordsForPeriod(records, itemMonth, itemYear);
      const monthFilteredPlan = sale === "all" ? monthPlan : monthPlan.filter((visit) => visit.outlet.salePhuTrach === sale);
      const monthFilteredRecords = sale === "all" ? monthRecords : monthRecords.filter((record) => record.salePhuTrach === sale);
      const monthSummary = summarizeExecution(monthFilteredPlan, monthRecords);
      return {
        label: monthLabel(itemMonth, itemYear),
        required: monthSummary.required,
        completed: monthSummary.completed,
        missed: monthSummary.missed,
        rate: monthSummary.completionRate,
        revenue: monthFilteredRecords.reduce((sum, record) => sum + (record.actualRevenue ?? 0), 0),
      };
    }).reverse();
  }, [month, outlets, records, routeClusters, sale, salesConfig, settings, year]);

  const columns: Column<SaleReportRow>[] = [
    { key: "sale", header: "Sale", cell: (row) => <span className="font-bold">{row.sale}</span> },
    { key: "required", header: "Cần đi", cell: (row) => row.required },
    { key: "completed", header: "Hoàn tất", cell: (row) => row.completed },
    { key: "missed", header: "Thiếu", cell: (row) => <span className={row.missed ? "font-bold text-amber-700" : "text-emerald-700"}>{row.missed}</span> },
    { key: "rate", header: "Tỷ lệ", cell: (row) => `${row.completionRate}%` },
    { key: "carry", header: "Tuyến bù", cell: (row) => row.carryover },
    { key: "revenue", header: "Doanh thu", cell: (row) => `${formatCurrency(row.revenue)} đ` },
    {
      key: "mix",
      header: "Mix F",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.f8 ? <FrequencyBadge frequency="F8" /> : null}
          {row.f4 ? <FrequencyBadge frequency="F4" /> : null}
          {row.f2 ? <FrequencyBadge frequency="F2" /> : null}
          {row.f1 ? <FrequencyBadge frequency="F1" /> : null}
          {row.f05 ? <FrequencyBadge frequency="F0.5" /> : null}
          {row.f03 ? <FrequencyBadge frequency="F0.3" /> : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Báo cáo"
        description="Theo dõi KPI tháng và KPI theo sale: số lượt cần đi, hoàn tất, đi thiếu, tuyến bù và mix tần suất F."
      />

      <div className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-4 shadow-soft md:grid-cols-2">
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
            <option key={item} value={item}>
              Tháng {item}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={sale} onChange={(event) => setSale(event.target.value)}>
          <option value="all">Tất cả sale</option>
          {saleOptions.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["month", "Tổng tháng"],
          ["sale", "Từng sale"],
          ["revenue", "Doanh thu"],
          ["route", "Báo cáo tuyến"],
          ["multi", "Nhiều tháng"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`rounded-full border px-3 py-1.5 text-sm font-bold ${reportView === key ? "border-ink bg-ink text-white" : "border-line bg-white text-muted"}`}
            onClick={() => setReportView(key as ReportView)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Lượt cần đi" value={summary.required} />
        <MetricCard label="Hoàn tất" value={summary.completed} />
        <MetricCard label="Đi thiếu" value={summary.missed} />
        <MetricCard label="Tỷ lệ hoàn thành" value={`${summary.completionRate}%`} />
        <MetricCard label="F0.5/F0.3 bù tháng này" value={lowFrequencyCarryovers} hint="Chưa đi từ tháng trước" />
      </div>
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <MetricCard label="Doanh thu thực tế" value={`${formatCurrency(actualRevenue)} đ`} hint="Từ actualRevenue đã nhập/import" />
        <MetricCard label="Số sale" value={saleOptions.length} />
        <MetricCard label="Số cụm có tuyến" value={routeRows.length} />
      </div>

      {reportView === "month" || reportView === "revenue" ? (
        <div className="mb-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {(Object.keys(frequencyCounts) as Frequency[]).map((frequency) => (
            <div key={frequency} className="rounded-lg border border-line bg-white p-4 shadow-soft">
              <div className="mb-2 flex items-center justify-between">
                <FrequencyBadge frequency={frequency} />
                <span className="text-xl font-bold">{frequencyCounts[frequency]}</span>
              </div>
              <div className="text-xs text-muted">Lượt trong tháng</div>
            </div>
          ))}
        </div>
      ) : null}

      {reportView === "month" || reportView === "sale" || reportView === "revenue" ? <DataTable columns={columns} rows={saleRows} rowKey={(row) => row.sale} /> : null}

      {reportView === "route" ? (
        <div className="overflow-auto rounded-lg border border-line bg-white shadow-soft">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Cụm</th>
                <th className="px-4 py-3">Khu vực</th>
                <th className="px-4 py-3">Cần đi</th>
                <th className="px-4 py-3">Hoàn tất</th>
                <th className="px-4 py-3">Thiếu</th>
                <th className="px-4 py-3">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {routeRows.map((row) => (
                <tr key={row.clusterId} className="border-t border-line">
                  <td className="px-4 py-3"><span className="font-bold">{row.clusterId}</span><div className="text-xs text-muted">{row.clusterName}</div></td>
                  <td className="px-4 py-3">{row.district}</td>
                  <td className="px-4 py-3">{row.required}</td>
                  <td className="px-4 py-3">{row.completed}</td>
                  <td className="px-4 py-3 font-bold text-amber-700">{row.missed}</td>
                  <td className="px-4 py-3">{formatCurrency(row.revenue)} đ</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {reportView === "multi" ? (
        <div className="overflow-auto rounded-lg border border-line bg-white shadow-soft">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Tháng</th>
                <th className="px-4 py-3">Cần đi</th>
                <th className="px-4 py-3">Hoàn tất</th>
                <th className="px-4 py-3">Thiếu</th>
                <th className="px-4 py-3">Tỷ lệ</th>
                <th className="px-4 py-3">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {multiMonthRows.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <td className="px-4 py-3 font-bold">{row.label}</td>
                  <td className="px-4 py-3">{row.required}</td>
                  <td className="px-4 py-3">{row.completed}</td>
                  <td className="px-4 py-3 font-bold text-amber-700">{row.missed}</td>
                  <td className="px-4 py-3">{row.rate}%</td>
                  <td className="px-4 py-3">{formatCurrency(row.revenue)} đ</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
