"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { MetricCard } from "@/components/MetricCard";
import { OverloadWarning } from "@/components/OverloadWarning";
import { PageHeader } from "@/components/PageHeader";
import { downloadCsv, plannerToCsv } from "@/lib/csv";
import {
  buildCarryoversForNextMonth,
  EXECUTION_STORAGE_KEY,
  executionStatuses,
  getEffectiveStatus,
  isMissedVisit,
  recordsForPeriod,
  summarizeExecution,
  upsertExecutionRecord,
} from "@/lib/route-execution";
import { generateMonthlyRoutePlan, getOverloadedClusters } from "@/lib/route-logic";
import { clusters, saleOwners, seedOutlets } from "@/lib/seed-data";
import { getSaleLimits, loadSalesConfig } from "@/lib/sales-config";
import { loadPlannerSettings } from "@/lib/settings-storage";
import type { Frequency } from "@/types/outlet";
import type { PlannerSettings, RouteExecutionRecord, RouteVisit, VisitStatus, WeekKey } from "@/types/route";
import { DEFAULT_SETTINGS } from "@/lib/route-logic";
import type { SalesTerritory } from "@/types/territory";

type QuickRouteFilter = "all" | "carryover" | "missed" | "missed-priority";

function getPreviousPeriod(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

export default function PlannerPage() {
  const year = new Date().getFullYear();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [week, setWeek] = useState<"all" | WeekKey>("W1");
  const [sale, setSale] = useState("all");
  const [cluster, setCluster] = useState("all");
  const [frequency, setFrequency] = useState<"all" | Frequency>("all");
  const [status, setStatus] = useState<"all" | VisitStatus>("all");
  const [quickFilter, setQuickFilter] = useState<QuickRouteFilter>("all");
  const [records, setRecords] = useState<RouteExecutionRecord[]>([]);
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULT_SETTINGS);
  const [salesConfig, setSalesConfig] = useState<SalesTerritory[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem(EXECUTION_STORAGE_KEY);
    if (raw) setRecords(JSON.parse(raw) as RouteExecutionRecord[]);
    setSettings(loadPlannerSettings());
    setSalesConfig(loadSalesConfig());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  const previousPeriod = getPreviousPeriod(month, year);
  const previousBasePlan = useMemo(
    () => generateMonthlyRoutePlan(previousPeriod.month, previousPeriod.year, seedOutlets, clusters, settings),
    [previousPeriod.month, previousPeriod.year, settings],
  );
  const previousRecords = useMemo(
    () => recordsForPeriod(records, previousPeriod.month, previousPeriod.year),
    [records, previousPeriod.month, previousPeriod.year],
  );
  const carryovers = useMemo(() => buildCarryoversForNextMonth(previousBasePlan, previousRecords), [previousBasePlan, previousRecords]);
  const plan = useMemo(() => generateMonthlyRoutePlan(month, year, seedOutlets, clusters, settings, carryovers), [month, year, settings, carryovers]);
  const currentRecords = useMemo(() => recordsForPeriod(records, month, year), [records, month, year]);
  const planWithExecution = useMemo(
    () => plan.map((visit) => ({ ...visit, status: getEffectiveStatus(visit, currentRecords) })),
    [plan, currentRecords],
  );
  const summary = summarizeExecution(plan, currentRecords);
  const overloaded = getOverloadedClusters(planWithExecution, clusters);
  const saleDayWarnings = getSaleDayWarnings(planWithExecution, settings);
  const rows = planWithExecution.filter((visit) => {
    return (
      (week === "all" || visit.week === week) &&
      (sale === "all" || visit.outlet.salePhuTrach === sale) &&
      (cluster === "all" || visit.clusterId === cluster) &&
      (frequency === "all" || visit.frequency === frequency) &&
      (status === "all" || visit.status === status) &&
      matchesQuickFilter(visit, quickFilter)
    );
  });

  function updateExecution(visit: RouteVisit, patch: Parameters<typeof upsertExecutionRecord>[2]) {
    setRecords((current) => upsertExecutionRecord(current, visit, patch));
  }

  function getRecord(visitId: string) {
    return currentRecords.find((record) => record.visitId === visitId);
  }

  function resetDemoExecution() {
    const ok = window.confirm("Xóa toàn bộ dữ liệu thực hiện demo đang lưu trên trình duyệt?");
    if (!ok) return;
    setRecords([]);
    window.localStorage.removeItem(EXECUTION_STORAGE_KEY);
  }

  function matchesQuickFilter(visit: RouteVisit, filter: QuickRouteFilter) {
    if (filter === "all") return true;
    if (filter === "carryover") return Boolean(visit.isCarryover);
    if (filter === "missed") return isMissedVisit(visit.status);
    if (filter === "missed-priority") return ["F8", "F4", "F2"].includes(visit.frequency) && isMissedVisit(visit.status);
    return true;
  }

  function getSaleDayWarnings(planItems: RouteVisit[], plannerSettings: PlannerSettings) {
    const grouped = new Map<string, { sale: string; week: WeekKey; dayName: string; visits: number }>();
    for (const visit of planItems.filter((item) => item.status !== "CS từ xa")) {
      const key = `${visit.week}-${visit.dayName}-${visit.outlet.salePhuTrach}`;
      const current = grouped.get(key) ?? {
        sale: visit.outlet.salePhuTrach,
        week: visit.week,
        dayName: visit.dayName,
        visits: 0,
      };
      current.visits += 1;
      grouped.set(key, current);
    }

    return [...grouped.values()]
      .filter((item) => {
        const limits = getSaleLimits(salesConfig, item.sale, plannerSettings.minVisitsPerSaleDay, plannerSettings.maxVisitsPerSaleDay);
        return item.visits < limits.min || item.visits > limits.max;
      })
      .sort((a, b) => b.visits - a.visits)
      .map((item) => {
        const limits = getSaleLimits(salesConfig, item.sale, plannerSettings.minVisitsPerSaleDay, plannerSettings.maxVisitsPerSaleDay);
        return item.visits > limits.max
          ? `${item.week} ${item.dayName} - ${item.sale}: ${item.visits} điểm, vượt max riêng ${limits.max}.`
          : `${item.week} ${item.dayName} - ${item.sale}: ${item.visits} điểm, dưới min riêng ${limits.min}.`;
      });
  }

  const tableColumns: Column<RouteVisit>[] = [
    {
      key: "order",
      header: "STT đi",
      cell: (row) => <span className="font-bold">{row.status === "CS từ xa" ? "-" : row.routeOrder}</span>,
    },
    {
      key: "outlet",
      header: "Điểm bán",
      cell: (row) => (
        <div>
          <div className="flex items-center gap-2 font-bold">
            {row.isCarryover ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">Bù</span> : null}
            {row.outlet.tenDiemBan}
          </div>
          <div className="text-xs text-muted">{row.outlet.outletId} · {row.outlet.salePhuTrach}</div>
        </div>
      ),
    },
    {
      key: "channel",
      header: "Kênh/Chuỗi",
      cell: (row) => (
        <div>
          {row.outlet.kenh}
          <div className="text-xs text-muted">{row.outlet.chuoi}</div>
        </div>
      ),
    },
    {
      key: "area",
      header: "Khu vực",
      cell: (row) => (
        <div>
          {row.outlet.quanHuyen}
          <div className="text-xs text-muted">{row.outlet.phuongXa}</div>
        </div>
      ),
    },
    {
      key: "cluster",
      header: "Cụm nhỏ",
      cell: (row) => (
        <div>
          {row.clusterId}
          <div className="text-xs text-muted">{row.week} · {row.dayName}</div>
        </div>
      ),
    },
    { key: "f", header: "F", cell: (row) => <FrequencyBadge frequency={row.frequency} /> },
    { key: "score", header: "Tổng điểm", cell: (row) => row.outlet.totalScore },
    { key: "sales", header: "DS 3 tháng", cell: (row) => `${Math.round(row.outlet.doanhSo3Thang / 1_000_000)}tr` },
    {
      key: "status",
      header: "Thực hiện",
      cell: (row) => {
        const record = getRecord(row.id);
        return (
          <div className="grid min-w-56 gap-2">
            <select
              className="h-9 rounded-md border border-line px-2 text-sm"
              value={row.status}
              onChange={(event) => updateExecution(row, { actualStatus: event.target.value as VisitStatus })}
            >
              {executionStatuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              className="h-9 rounded-md border border-line px-2 text-sm"
              type="date"
              value={record?.actualVisitDate ?? ""}
              onChange={(event) => updateExecution(row, { actualVisitDate: event.target.value })}
            />
          </div>
        );
      },
    },
    {
      key: "revenue-note",
      header: "Kết quả thực tế",
      cell: (row) => {
        const record = getRecord(row.id);
        return (
          <div className="grid min-w-64 gap-2">
            <input
              className="h-9 rounded-md border border-line px-2 text-sm"
              type="number"
              min={0}
              placeholder="Doanh số phát sinh"
              value={record?.actualRevenue ?? ""}
              onChange={(event) => updateExecution(row, { actualRevenue: Number(event.target.value) })}
            />
            <input
              className="h-9 rounded-md border border-line px-2 text-sm"
              placeholder="Ghi chú lý do chưa đi/kết quả"
              value={record?.note ?? ""}
              onChange={(event) => updateExecution(row, { note: event.target.value })}
            />
          </div>
        );
      },
    },
    {
      key: "carry",
      header: "Bù tháng sau",
      cell: (row) => {
        const record = getRecord(row.id);
        return (
          <label className="flex min-w-28 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={record?.carryToNextMonth ?? false}
              onChange={(event) => updateExecution(row, { carryToNextMonth: event.target.checked })}
            />
            Cần bù
          </label>
        );
      },
    },
    {
      key: "reason",
      header: "Lý do ưu tiên",
      cell: (row) => <span className="text-slate-600">{row.priorityReason}</span>,
    },
    {
      key: "warning",
      header: "Cảnh báo",
      cell: (row) => (row.warning ? <span className="text-amber-700">{row.warning}</span> : ""),
    },
  ];

  const exportPlan = planWithExecution.map((visit) => ({ ...visit, status: getEffectiveStatus(visit, currentRecords) }));

  return (
    <div>
      <PageHeader
        title="Planner"
        description="Theo dõi kế hoạch và thực tế đi tuyến. Điểm chưa hoàn tất sẽ được đưa vào danh sách bù tháng sau theo đúng cụm nhỏ, ưu tiên F4/F2 trước."
      />

      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Lượt cần đi" value={summary.required} hint="Không tính CS từ xa" />
        <MetricCard label="Đã hoàn tất" value={summary.completed} hint="Đã đi, có đơn, không có đơn" />
        <MetricCard label="Đi thiếu" value={summary.missed} hint="Chưa đi, không gặp khách, dời lịch" />
        <MetricCard label="Tỷ lệ hoàn thành" value={`${summary.completionRate}%`} />
        <MetricCard label="Sẽ bù từ tháng trước" value={carryovers.length} hint={`${previousPeriod.month}/${previousPeriod.year}`} />
      </div>
      <div className="mb-4 rounded-lg border border-line bg-white p-4 text-sm text-muted shadow-soft">
        Ràng buộc sale/ngày mặc định: tối thiểu <span className="font-bold text-ink">{settings.minVisitsPerSaleDay}</span> điểm, tối đa{" "}
        <span className="font-bold text-ink">{settings.maxVisitsPerSaleDay}</span> điểm. Min/max riêng từng sale chỉnh ở màn Phân vùng sale.
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-4 shadow-soft md:grid-cols-3 xl:grid-cols-7">
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
            <option key={item} value={item}>
              Tháng {item}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={week} onChange={(event) => setWeek(event.target.value as "all" | WeekKey)}>
          <option value="all">Tất cả tuần</option>
          <option value="W1">W1</option>
          <option value="W2">W2</option>
          <option value="W3">W3</option>
          <option value="W4">W4</option>
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={sale} onChange={(event) => setSale(event.target.value)}>
          <option value="all">Tất cả sale</option>
          {saleOwners.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={cluster} onChange={(event) => setCluster(event.target.value)}>
          <option value="all">Tất cả cụm</option>
          {clusters.map((item) => (
            <option key={item.maCum} value={item.maCum}>
              {item.maCum}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={frequency} onChange={(event) => setFrequency(event.target.value as "all" | Frequency)}>
          <option value="all">Tất cả F</option>
          <option value="F8">F8</option>
          <option value="F4">F4</option>
          <option value="F2">F2</option>
          <option value="F1">F1</option>
          <option value="F0.5">F0.5</option>
          <option value="F0.3">F0.3</option>
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as "all" | VisitStatus)}>
          <option value="all">Tất cả trạng thái</option>
          {executionStatuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={quickFilter} onChange={(event) => setQuickFilter(event.target.value as QuickRouteFilter)}>
          <option value="all">Tất cả tuyến</option>
          <option value="carryover">Chỉ tuyến bù</option>
          <option value="missed">Chỉ tuyến thiếu</option>
          <option value="missed-priority">F8/F4/F2 bị miss</option>
        </select>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_2fr]">
        <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <div className="mb-3 font-bold">Đánh giá sale đi đủ/thiếu</div>
          <div className="grid gap-2 text-sm">
            {summary.bySale.map((item) => (
              <div key={item.sale} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                <span className="font-medium">{item.sale}</span>
                <span>
                  {item.completed}/{item.required} hoàn tất · thiếu {item.missed}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <div className="mb-3 font-bold">Quy tắc bù tuyến</div>
          <div className="grid gap-2 text-sm text-muted">
            <div>F8/F4/F2 chưa hoàn tất sẽ được ưu tiên bù trong W1-W2 tháng sau nếu cụm còn capacity.</div>
            <div>F1 chưa hoàn tất được bù vào W2-W3 cùng cụm. F0.5/F0.3 chưa đi sẽ được ghi nhớ để ưu tiên gợi ý tháng sau.</div>
            <div>Có thể tick “Cần bù” để ép một lượt vào danh sách bù tháng sau, kèm ghi chú lý do.</div>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="text-sm text-muted">
          Đang hiển thị {rows.length} lượt ghé. Trạng thái thực tế lưu trên trình duyệt bằng localStorage.
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-ink" onClick={resetDemoExecution}>
            Reset dữ liệu demo
          </button>
          <button className="rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-ink" onClick={() => downloadCsv(`route-plan-filtered-${month}-${year}.csv`, plannerToCsv(rows))}>
            Export theo filter
          </button>
          <button className="rounded-md bg-ink px-4 py-2 text-sm font-bold text-white" onClick={() => downloadCsv(`route-plan-all-${month}-${year}.csv`, plannerToCsv(exportPlan))}>
            Export toàn bộ
          </button>
        </div>
      </div>

      <OverloadWarning title="Cụm vượt capacity" items={overloaded.map((item) => `${item.week} - ${item.clusterName}: ${item.visits}/${item.capacity} điểm.`)} />
      <div className="mt-4">
        <OverloadWarning title="Cảnh báo min/max sale/ngày" items={saleDayWarnings} />
      </div>
      <div className="mt-4">
        <DataTable columns={tableColumns} rows={rows} rowKey={(row) => row.id} />
      </div>
    </div>
  );
}
