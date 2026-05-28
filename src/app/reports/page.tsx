"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { buildCarryoversForNextMonth, EXECUTION_STORAGE_KEY, recordsForPeriod, summarizeExecution } from "@/lib/route-execution";
import { generateMonthlyRoutePlan } from "@/lib/route-logic";
import { clusters, saleOwners, seedOutlets } from "@/lib/seed-data";
import { loadPlannerSettings } from "@/lib/settings-storage";
import type { Frequency } from "@/types/outlet";
import type { PlannerSettings, RouteExecutionRecord, RouteVisit } from "@/types/route";
import { DEFAULT_SETTINGS } from "@/lib/route-logic";

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
};

function getPreviousPeriod(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

export default function ReportsPage() {
  const year = new Date().getFullYear();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [sale, setSale] = useState("all");
  const [records, setRecords] = useState<RouteExecutionRecord[]>([]);
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const raw = window.localStorage.getItem(EXECUTION_STORAGE_KEY);
    if (raw) setRecords(JSON.parse(raw) as RouteExecutionRecord[]);
    setSettings(loadPlannerSettings());
  }, []);

  const previousPeriod = getPreviousPeriod(month, year);
  const previousPlan = useMemo(() => generateMonthlyRoutePlan(previousPeriod.month, previousPeriod.year, seedOutlets, clusters, settings), [previousPeriod.month, previousPeriod.year, settings]);
  const previousRecords = useMemo(() => recordsForPeriod(records, previousPeriod.month, previousPeriod.year), [records, previousPeriod.month, previousPeriod.year]);
  const carryovers = useMemo(() => buildCarryoversForNextMonth(previousPlan, previousRecords), [previousPlan, previousRecords]);
  const plan = useMemo(() => generateMonthlyRoutePlan(month, year, seedOutlets, clusters, settings, carryovers), [month, year, settings, carryovers]);
  const currentRecords = useMemo(() => recordsForPeriod(records, month, year), [records, month, year]);
  const filteredPlan = sale === "all" ? plan : plan.filter((visit) => visit.outlet.salePhuTrach === sale);
  const summary = summarizeExecution(filteredPlan, currentRecords);
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

  const saleRows: SaleReportRow[] = saleOwners.map((owner) => {
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
    };
  });

  const columns: Column<SaleReportRow>[] = [
    { key: "sale", header: "Sale", cell: (row) => <span className="font-bold">{row.sale}</span> },
    { key: "required", header: "Cần đi", cell: (row) => row.required },
    { key: "completed", header: "Hoàn tất", cell: (row) => row.completed },
    { key: "missed", header: "Thiếu", cell: (row) => <span className={row.missed ? "font-bold text-amber-700" : "text-emerald-700"}>{row.missed}</span> },
    { key: "rate", header: "Tỷ lệ", cell: (row) => `${row.completionRate}%` },
    { key: "carry", header: "Tuyến bù", cell: (row) => row.carryover },
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
          {saleOwners.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Lượt cần đi" value={summary.required} />
        <MetricCard label="Hoàn tất" value={summary.completed} />
        <MetricCard label="Đi thiếu" value={summary.missed} />
        <MetricCard label="Tỷ lệ hoàn thành" value={`${summary.completionRate}%`} />
        <MetricCard label="F0.5/F0.3 bù tháng này" value={lowFrequencyCarryovers} hint="Chưa đi từ tháng trước" />
      </div>

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

      <DataTable columns={columns} rows={saleRows} rowKey={(row) => row.sale} />
    </div>
  );
}
