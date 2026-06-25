"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { MetricCard } from "@/components/MetricCard";
import { OverloadWarning } from "@/components/OverloadWarning";
import { PageHeader } from "@/components/PageHeader";
import { canEdit, loadCurrentAccount, type AppRole } from "@/lib/auth";
import { loadClusters } from "@/lib/cluster-storage";
import { downloadCsv, parseExecutionHistoryCsv, plannerToCsv } from "@/lib/csv";
import { loadOutlets } from "@/lib/outlet-storage";
import {
  buildCarryoversForNextMonth,
  buildLowFrequencyHistoryCarryovers,
  EXECUTION_STORAGE_KEY,
  executionStatuses,
  getEffectiveStatus,
  isMissedVisit,
  recordsForPeriod,
  summarizeExecution,
  upsertExecutionRecord,
} from "@/lib/route-execution";
import { generateMonthlyRoutePlan, getOverloadedClusters } from "@/lib/route-logic";
import { loadSaleUnavailableDays, saveSaleUnavailableDays, UNAVAILABLE_STORAGE_KEY } from "@/lib/sale-unavailable";
import { clusters, saleStartPoints, seedOutlets } from "@/lib/seed-data";
import { getSaleLimits, loadSalesConfig } from "@/lib/sales-config";
import { loadPlannerSettings } from "@/lib/settings-storage";
import type { Frequency, Outlet } from "@/types/outlet";
import type { PlannerSettings, RouteExecutionRecord, RouteVisit, SaleUnavailableDay, VisitStatus, WeekKey } from "@/types/route";
import { DEFAULT_SETTINGS } from "@/lib/route-logic";
import type { RouteCluster } from "@/types/cluster";
import type { SalesTerritory } from "@/types/territory";

type QuickRouteFilter = "all" | "carryover" | "missed" | "missed-priority";
type PlannerViewMode = "daily" | "table";
type UnavailableReason = SaleUnavailableDay["reason"];

const unavailableReasons: UnavailableReason[] = ["Ở văn phòng", "Ở kho", "Chỉ đạo khác", "Nghỉ phép"];

function getPreviousPeriod(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

function getDayNameFromDate(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  return ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"][date.getDay()];
}

function formatDateValue(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function toDateValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function findNextAvailableDate(sourceDate: string, salePhuTrach: string, unavailableDays: SaleUnavailableDay[], month: number, year: number) {
  const blockedDates = new Set(unavailableDays.filter((item) => item.salePhuTrach === salePhuTrach).map((item) => item.date));
  const date = new Date(`${sourceDate}T00:00:00`);
  const lastDay = new Date(year, month, 0).getDate();

  for (let day = date.getDate() + 1; day <= lastDay; day += 1) {
    const candidate = new Date(year, month - 1, day);
    if (candidate.getDay() === 0) continue;
    const value = toDateValue(candidate);
    if (!blockedDates.has(value)) return value;
  }

  return "";
}

function applyUnavailableDays(plan: RouteVisit[], unavailableDays: SaleUnavailableDay[], month: number, year: number): RouteVisit[] {
  if (!unavailableDays.length) return plan;
  const unavailableBySaleDate = new Map(unavailableDays.map((item) => [`${item.salePhuTrach}-${item.date}`, item]));

  return plan.map((visit) => {
    const unavailable = unavailableBySaleDate.get(`${visit.outlet.salePhuTrach}-${visit.plannedDate}`);
    if (!unavailable || visit.status === "CS từ xa") return visit;

    const nextDate = findNextAvailableDate(visit.plannedDate, visit.outlet.salePhuTrach, unavailableDays, month, year);
    const reason = `${unavailable.reason}${unavailable.note ? `: ${unavailable.note}` : ""}`;
    const warning = nextDate
      ? `Dời từ ${formatDateValue(visit.plannedDate)} do ${reason}`
      : `Không còn ngày trống để dời trong tháng do ${reason}`;

    return {
      ...visit,
      plannedDate: nextDate || visit.plannedDate,
      dayName: nextDate ? getDayNameFromDate(nextDate) : visit.dayName,
      status: nextDate ? visit.status : "Dời lịch",
      warning: visit.warning ? `${visit.warning}; ${warning}` : warning,
    };
  });
}

function groupDailySchedule(rows: RouteVisit[], salesConfig: SalesTerritory[], settings: PlannerSettings) {
  const grouped = new Map<string, { date: string; dayName: string; sale: string; visits: RouteVisit[]; min: number; max: number }>();

  for (const visit of rows.filter((item) => item.status !== "CS từ xa")) {
    const key = `${visit.plannedDate}-${visit.outlet.salePhuTrach}`;
    const limits = getSaleLimits(salesConfig, visit.outlet.salePhuTrach, settings.minVisitsPerSaleDay, settings.maxVisitsPerSaleDay);
    const current = grouped.get(key) ?? {
      date: visit.plannedDate,
      dayName: visit.dayName,
      sale: visit.outlet.salePhuTrach,
      visits: [],
      min: limits.min,
      max: limits.max,
    };
    current.visits.push(visit);
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      visits: [...group.visits].sort((a, b) => a.routeOrder - b.routeOrder),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.sale.localeCompare(b.sale));
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
  const [viewMode, setViewMode] = useState<PlannerViewMode>("daily");
  const [records, setRecords] = useState<RouteExecutionRecord[]>([]);
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULT_SETTINGS);
  const [salesConfig, setSalesConfig] = useState<SalesTerritory[]>([]);
  const [routeClusters, setRouteClusters] = useState<RouteCluster[]>(clusters);
  const [outlets, setOutlets] = useState<Outlet[]>(seedOutlets);
  const [unavailableDays, setUnavailableDays] = useState<SaleUnavailableDay[]>([]);
  const [unavailableSale, setUnavailableSale] = useState("");
  const [unavailableDate, setUnavailableDate] = useState("");
  const [unavailableReason, setUnavailableReason] = useState<UnavailableReason>("Ở văn phòng");
  const [unavailableNote, setUnavailableNote] = useState("");
  const [executionImportMessage, setExecutionImportMessage] = useState("");
  const [role, setRole] = useState<AppRole>("boss");
  const editable = canEdit(role);

  useEffect(() => {
    const raw = window.localStorage.getItem(EXECUTION_STORAGE_KEY);
    if (raw) setRecords(JSON.parse(raw) as RouteExecutionRecord[]);
    setUnavailableDays(loadSaleUnavailableDays());
    setSettings(loadPlannerSettings());
    setSalesConfig(loadSalesConfig());
    setRouteClusters(loadClusters());
    const storedOutlets = loadOutlets();
    setOutlets(storedOutlets);
    setUnavailableSale(Array.from(new Set(storedOutlets.map((outlet) => outlet.salePhuTrach)))[0] ?? "");
    setRole(loadCurrentAccount().role);
    const listener = () => setRole(loadCurrentAccount().role);
    window.addEventListener("route-planner-account-change", listener);
    return () => window.removeEventListener("route-planner-account-change", listener);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    saveSaleUnavailableDays(unavailableDays);
  }, [unavailableDays]);

  const previousPeriod = getPreviousPeriod(month, year);
  const saleOptions = useMemo(() => Array.from(new Set(outlets.map((outlet) => outlet.salePhuTrach))).filter(Boolean), [outlets]);
  const previousBasePlan = useMemo(
    () => generateMonthlyRoutePlan(previousPeriod.month, previousPeriod.year, outlets, routeClusters, settings, [], saleStartPoints, salesConfig, unavailableDays),
    [previousPeriod.month, previousPeriod.year, outlets, routeClusters, settings, salesConfig, unavailableDays],
  );
  const previousRecords = useMemo(
    () => recordsForPeriod(records, previousPeriod.month, previousPeriod.year),
    [records, previousPeriod.month, previousPeriod.year],
  );
  const carryovers = useMemo(() => {
    const previousCarryovers = buildCarryoversForNextMonth(previousBasePlan, previousRecords);
    const historyCarryovers = buildLowFrequencyHistoryCarryovers(outlets, records, month, year, settings);
    const byOutlet = new Map([...previousCarryovers, ...historyCarryovers].map((item) => [item.outletId, item]));
    return [...byOutlet.values()];
  }, [previousBasePlan, previousRecords, records, month, year, settings, outlets]);
  const plan = useMemo(() => generateMonthlyRoutePlan(month, year, outlets, routeClusters, settings, carryovers, saleStartPoints, salesConfig, unavailableDays), [month, year, outlets, routeClusters, settings, carryovers, salesConfig, unavailableDays]);
  const scheduledPlan = plan;
  const currentRecords = useMemo(() => recordsForPeriod(records, month, year), [records, month, year]);
  const planWithExecution = useMemo(
    () => scheduledPlan.map((visit) => ({ ...visit, status: getEffectiveStatus(visit, currentRecords) })),
    [scheduledPlan, currentRecords],
  );
  const summary = summarizeExecution(scheduledPlan, currentRecords);
  const overloaded = getOverloadedClusters(planWithExecution, routeClusters);
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
  const dailySchedule = useMemo(() => groupDailySchedule(rows, salesConfig, settings), [rows, salesConfig, settings]);
  const unavailableInMonth = unavailableDays
    .filter((item) => item.date.startsWith(`${year}-${String(month).padStart(2, "0")}`))
    .sort((a, b) => a.date.localeCompare(b.date) || a.salePhuTrach.localeCompare(b.salePhuTrach));

  function updateExecution(visit: RouteVisit, patch: Parameters<typeof upsertExecutionRecord>[2]) {
    if (!editable) return;
    setRecords((current) => upsertExecutionRecord(current, visit, patch));
  }

  function getRecord(visitId: string) {
    return currentRecords.find((record) => record.visitId === visitId);
  }

  function addUnavailableDay() {
    if (!editable) return;
    if (!unavailableSale || !unavailableDate) return;
    const next: SaleUnavailableDay = {
      id: `${unavailableSale}-${unavailableDate}-${Date.now()}`,
      salePhuTrach: unavailableSale,
      date: unavailableDate,
      reason: unavailableReason,
      note: unavailableNote.trim() || undefined,
    };
    setUnavailableDays((current) => [...current.filter((item) => !(item.salePhuTrach === next.salePhuTrach && item.date === next.date)), next]);
    setUnavailableNote("");
  }

  function removeUnavailableDay(id: string) {
    if (!editable) return;
    setUnavailableDays((current) => current.filter((item) => item.id !== id));
  }

  function resetDemoExecution() {
    if (!editable) return;
    const ok = window.confirm("Xóa toàn bộ dữ liệu thực hiện demo đang lưu trên trình duyệt?");
    if (!ok) return;
    setRecords([]);
    window.localStorage.removeItem(EXECUTION_STORAGE_KEY);
  }

  async function importPlannerExecution(file?: File) {
    if (!editable) {
      setExecutionImportMessage("Account Người xem không được import thực hiện.");
      return;
    }
    if (!file) return;
    const text = await file.text();
    const parsed = parseExecutionHistoryCsv(text);
    if (parsed.errors.length) {
      setExecutionImportMessage(parsed.errors.join(" "));
      return;
    }

    setRecords((current) => {
      const merged = new Map(current.map((record) => [record.visitId, record]));
      let added = 0;
      let updated = 0;
      for (const record of parsed.records) {
        if (merged.has(record.visitId)) updated += 1;
        else added += 1;
        merged.set(record.visitId, record);
      }
      const next = [...merged.values()];
      setExecutionImportMessage(`Import thực hiện thành công: thêm ${added}, cập nhật ${updated}. Tổng đang lưu ${next.length} dòng.`);
      return next;
    });
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
      key: "plannedDate",
      header: "Ngày dự kiến",
      cell: (row) => (
        <div>
          <div className="font-bold">{formatDateValue(row.plannedDate)}</div>
          <div className="text-xs text-muted">{row.dayName}</div>
        </div>
      ),
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
          <div className="text-xs text-muted">{row.plannedDate}</div>
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
              className="h-9 rounded-md border border-line px-2 text-sm disabled:bg-slate-50"
              disabled={!editable}
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
              className="h-9 rounded-md border border-line px-2 text-sm disabled:bg-slate-50"
              disabled={!editable}
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
              className="h-9 rounded-md border border-line px-2 text-sm disabled:bg-slate-50"
              disabled={!editable}
              type="number"
              min={0}
              placeholder="Doanh số phát sinh"
              value={record?.actualRevenue ?? ""}
              onChange={(event) => updateExecution(row, { actualRevenue: Number(event.target.value) })}
            />
            <input
              className="h-9 rounded-md border border-line px-2 text-sm disabled:bg-slate-50"
              disabled={!editable}
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
              disabled={!editable}
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
  const selectedSaleExportPlan = sale === "all" ? exportPlan : exportPlan.filter((visit) => visit.outlet.salePhuTrach === sale);

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
        <MetricCard label="Sẽ bù/ưu tiên lại" value={carryovers.length} hint="Từ tháng trước và lịch sử F0.5/F0.3" />
      </div>
      <div className="mb-4 rounded-lg border border-line bg-white p-4 text-sm text-muted shadow-soft">
        Ràng buộc sale/ngày mặc định: tối thiểu <span className="font-bold text-ink">{settings.minVisitsPerSaleDay}</span> điểm, tối đa{" "}
        <span className="font-bold text-ink">{settings.maxVisitsPerSaleDay}</span> điểm. Min/max riêng từng sale chỉnh ở màn Phân vùng sale.
      </div>

      <div className="mb-4 rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="mb-3 flex flex-col gap-1">
          <div className="font-bold">Ngày sale không đi tuyến</div>
          <div className="text-sm text-muted">
            Nếu sale ở văn phòng/kho hoặc nhận chỉ đạo khác, thêm ngày tại đây. Planner sẽ tự dời điểm của sale đó sang ngày làm việc kế tiếp trong tháng; nếu hết ngày trống thì đánh dấu dời lịch để bù.
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <select className="h-10 rounded-md border border-line px-3 text-sm disabled:bg-slate-50" disabled={!editable} value={unavailableSale} onChange={(event) => setUnavailableSale(event.target.value)}>
            {saleOptions.map((owner) => (
              <option key={owner} value={owner}>
                {owner}
              </option>
            ))}
          </select>
          <input className="h-10 rounded-md border border-line px-3 text-sm disabled:bg-slate-50" disabled={!editable} type="date" value={unavailableDate} onChange={(event) => setUnavailableDate(event.target.value)} />
          <select className="h-10 rounded-md border border-line px-3 text-sm disabled:bg-slate-50" disabled={!editable} value={unavailableReason} onChange={(event) => setUnavailableReason(event.target.value as UnavailableReason)}>
            {unavailableReasons.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
          <input className="h-10 rounded-md border border-line px-3 text-sm disabled:bg-slate-50" disabled={!editable} placeholder="Ghi chú nếu có" value={unavailableNote} onChange={(event) => setUnavailableNote(event.target.value)} />
          <button className="h-10 rounded-md bg-ink px-4 text-sm font-bold text-white disabled:opacity-50" disabled={!editable || !unavailableDate} onClick={addUnavailableDay}>
            Thêm ngày khóa
          </button>
        </div>
        {unavailableInMonth.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {unavailableInMonth.map((item) => (
              <button
                key={item.id}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                disabled={!editable}
                onClick={() => removeUnavailableDay(item.id)}
                title="Bấm để xóa ngày khóa"
              >
                {formatDateValue(item.date)} · {item.salePhuTrach} · {item.reason} ×
              </button>
            ))}
          </div>
        ) : null}
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
          {saleOptions.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={cluster} onChange={(event) => setCluster(event.target.value)}>
          <option value="all">Tất cả cụm</option>
          {routeClusters.map((item) => (
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
          <button
            className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700"
            onClick={() => downloadCsv(`template-thuc-hien-${sale === "all" ? "tat-ca-sale" : sale}-${month}-${year}.csv`, plannerToCsv(selectedSaleExportPlan))}
          >
            Tải mẫu thực hiện
          </button>
          <label className={`flex cursor-pointer items-center rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 ${editable ? "" : "cursor-not-allowed opacity-50"}`}>
            Import thực hiện
            <input
              className="hidden"
              disabled={!editable}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                void importPlannerExecution(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button className="rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-ink disabled:opacity-50" disabled={!editable} onClick={resetDemoExecution}>
            Reset dữ liệu demo
          </button>
          <button className="rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-ink" onClick={() => downloadCsv(`route-plan-filtered-${month}-${year}.csv`, plannerToCsv(rows))}>
            Export theo filter
          </button>
          <button
            className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700"
            onClick={() => downloadCsv(`route-plan-${sale === "all" ? "tat-ca-sale" : sale}-${month}-${year}.csv`, plannerToCsv(selectedSaleExportPlan))}
          >
            Export tháng {sale === "all" ? "tất cả sale" : sale}
          </button>
          <button className="rounded-md bg-ink px-4 py-2 text-sm font-bold text-white" onClick={() => downloadCsv(`route-plan-all-${month}-${year}.csv`, plannerToCsv(exportPlan))}>
            Export toàn bộ
          </button>
        </div>
      </div>
      {executionImportMessage ? (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${executionImportMessage.includes("Thiếu") || executionImportMessage.includes("không hợp lệ") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {executionImportMessage}
        </div>
      ) : null}

      <div className="mb-4 flex rounded-lg border border-line bg-white p-1 shadow-soft">
        {[
          ["daily", "Lịch từng ngày"],
          ["table", "Bảng chi tiết"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-bold ${viewMode === key ? "bg-ink text-white" : "text-muted hover:bg-slate-50"}`}
            onClick={() => setViewMode(key as PlannerViewMode)}
          >
            {label}
          </button>
        ))}
      </div>

      <OverloadWarning title="Cụm vượt capacity" items={overloaded.map((item) => `${item.week} - ${item.clusterName}: ${item.visits}/${item.capacity} điểm.`)} />
      <div className="mt-4">
        <OverloadWarning title="Cảnh báo min/max sale/ngày" items={saleDayWarnings} />
      </div>
      {viewMode === "daily" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {dailySchedule.map((group) => {
            const underMin = group.visits.length < group.min;
            const overMax = group.visits.length > group.max;
            return (
              <div key={`${group.date}-${group.sale}`} className="rounded-lg border border-line bg-white p-4 shadow-soft">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-muted">{group.sale}</div>
                    <div className="text-lg font-extrabold text-ink">
                      {group.dayName}, {formatDateValue(group.date)}
                    </div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-bold ${underMin || overMax ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
                    {group.visits.length} điểm · min {group.min}/max {group.max}
                  </div>
                </div>
                <div className="grid gap-2">
                  {group.visits.map((visit) => (
                    <div key={visit.id} className="grid gap-3 rounded-md bg-slate-50 p-3 text-sm md:grid-cols-[44px_1fr_92px_96px] md:items-center">
                      <div className="text-lg font-black text-ink">{visit.routeOrder}</div>
                      <div>
                        <div className="font-bold text-ink">{visit.outlet.tenDiemBan}</div>
                        <div className="text-xs text-muted">
                          {visit.outlet.outletId} · {visit.outlet.phuongXa} · {visit.clusterId}
                        </div>
                      </div>
                      <div className="justify-self-start">
                        <FrequencyBadge frequency={visit.frequency} />
                      </div>
                      <div className="text-xs font-semibold text-muted">{visit.status}</div>
                      {visit.warning ? <div className="md:col-span-4 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{visit.warning}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {!dailySchedule.length ? (
            <div className="rounded-lg border border-line bg-white p-6 text-sm text-muted shadow-soft">Không có lịch theo bộ lọc hiện tại.</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <DataTable columns={tableColumns} rows={rows} rowKey={(row) => row.id} />
        </div>
      )}
    </div>
  );
}
