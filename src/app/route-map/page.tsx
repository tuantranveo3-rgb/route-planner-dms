"use client";

import { useEffect, useMemo, useState } from "react";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { clusters, saleOwners, seedOutlets } from "@/lib/seed-data";
import { DEFAULT_SETTINGS, generateMonthlyRoutePlan } from "@/lib/route-logic";
import { loadStartPoints, saveStartPoints } from "@/lib/start-points";
import type { Frequency } from "@/types/outlet";
import type { RouteVisit, WeekKey } from "@/types/route";
import type { SaleStartPoint } from "@/types/route";

type Point = {
  x: number;
  y: number;
};

type StartPointType = SaleStartPoint["loaiDiem"];

const startPointTypes: StartPointType[] = ["Văn phòng", "Kho", "Nhà sale", "Điểm hẹn"];

const frequencyColors: Record<Frequency, string> = {
  F8: "#9333ea",
  F4: "#dc2626",
  F2: "#2563eb",
  F1: "#16a34a",
  "F0.5": "#64748b",
  "F0.3": "#71717a",
};

function formatDateValue(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function formatStartScope(point: SaleStartPoint) {
  return point.date ? `${formatDateValue(point.date)} · ${point.salePhuTrach}` : point.salePhuTrach;
}

function getBounds(visits: RouteVisit[], starts: SaleStartPoint[]) {
  const xs = visits.map((visit) => visit.outlet.toaDoX);
  const ys = visits.map((visit) => visit.outlet.toaDoY);
  starts.forEach((start) => {
    xs.push(start.toaDoX);
    ys.push(start.toaDoY);
  });
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function projectXY(toaDoX: number, toaDoY: number, bounds: ReturnType<typeof getBounds>): Point {
  const width = 920;
  const height = 520;
  const padding = 42;
  const xRange = bounds.maxX - bounds.minX || 1;
  const yRange = bounds.maxY - bounds.minY || 1;

  return {
    x: padding + ((toaDoX - bounds.minX) / xRange) * (width - padding * 2),
    y: height - padding - ((toaDoY - bounds.minY) / yRange) * (height - padding * 2),
  };
}

function projectPoint(visit: RouteVisit, bounds: ReturnType<typeof getBounds>): Point {
  return projectXY(visit.outlet.toaDoX, visit.outlet.toaDoY, bounds);
}

function uniqueDates(plan: RouteVisit[]) {
  return Array.from(new Set(plan.map((visit) => visit.plannedDate))).sort();
}

export default function RouteMapPage() {
  const year = new Date().getFullYear();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [date, setDate] = useState("all");
  const [week, setWeek] = useState<"all" | WeekKey>("all");
  const [sale, setSale] = useState("all");
  const [cluster, setCluster] = useState("all");
  const [frequency, setFrequency] = useState<"all" | Frequency>("all");
  const [startPoints, setStartPoints] = useState<SaleStartPoint[]>([]);
  const [editingSale, setEditingSale] = useState(saleOwners[0] ?? "");
  const selectedStartPoint = startPoints.find((point) => point.salePhuTrach === editingSale && !point.date);
  const [startName, setStartName] = useState("");
  const [startType, setStartType] = useState<StartPointType>("Văn phòng");
  const [startX, setStartX] = useState("");
  const [startY, setStartY] = useState("");
  const [startNote, setStartNote] = useState("");
  const [startScope, setStartScope] = useState<"default" | "date">("default");
  const [startDate, setStartDate] = useState("");

  useEffect(() => {
    setStartPoints(loadStartPoints());
  }, []);

  useEffect(() => {
    const point =
      startScope === "date" && startDate
        ? startPoints.find((item) => item.salePhuTrach === editingSale && item.date === startDate) ?? selectedStartPoint
        : selectedStartPoint;
    if (!point) return;
    setStartName(point.tenDiemXuatPhat);
    setStartType(point.loaiDiem);
    setStartX(String(point.toaDoX));
    setStartY(String(point.toaDoY));
    setStartNote(point.ghiChu);
  }, [editingSale, selectedStartPoint, startDate, startPoints, startScope]);

  const plan = useMemo(() => generateMonthlyRoutePlan(month, year, seedOutlets, clusters, DEFAULT_SETTINGS, [], startPoints), [month, year, startPoints]);
  const dates = useMemo(() => uniqueDates(plan), [plan]);
  const rows = plan
    .filter((visit) => visit.status !== "CS từ xa")
    .filter((visit) => date === "all" || visit.plannedDate === date)
    .filter((visit) => week === "all" || visit.week === week)
    .filter((visit) => sale === "all" || visit.outlet.salePhuTrach === sale)
    .filter((visit) => cluster === "all" || visit.clusterId === cluster)
    .filter((visit) => frequency === "all" || visit.frequency === frequency)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.outlet.salePhuTrach.localeCompare(b.outlet.salePhuTrach) || a.routeOrder - b.routeOrder);
  const dailyStartBySale = new Map(startPoints.filter((point) => point.date).map((point) => [`${point.date}-${point.salePhuTrach}`, point]));
  const defaultStartBySale = new Map(startPoints.filter((point) => !point.date).map((point) => [point.salePhuTrach, point]));
  const visibleStartPoints = Array.from(
    new Map(
      rows.map((visit) => {
        const startPoint = dailyStartBySale.get(`${visit.plannedDate}-${visit.outlet.salePhuTrach}`) ?? defaultStartBySale.get(visit.outlet.salePhuTrach);
        return [`${visit.plannedDate}-${visit.outlet.salePhuTrach}`, startPoint];
      }),
    ).values(),
  ).filter((point): point is SaleStartPoint => Boolean(point));
  const bounds = rows.length ? getBounds(rows, visibleStartPoints) : undefined;
  const points = bounds ? rows.map((visit) => ({ visit, point: projectPoint(visit, bounds) })) : [];
  const startMarkers = bounds ? visibleStartPoints.map((start) => ({ start, point: projectXY(start.toaDoX, start.toaDoY, bounds) })) : [];
  const dailyStartPointBySale = new Map(startMarkers.filter((marker) => marker.start.date).map((marker) => [`${marker.start.date}-${marker.start.salePhuTrach}`, marker.point]));
  const defaultStartPointBySale = new Map(startMarkers.filter((marker) => !marker.start.date).map((marker) => [marker.start.salePhuTrach, marker.point]));
  const lineGroups = new Map<string, string>();

  for (const item of points) {
    const key = `${item.visit.plannedDate}-${item.visit.outlet.salePhuTrach}`;
    const current = lineGroups.get(key) ?? (() => {
      const startPoint = dailyStartPointBySale.get(`${item.visit.plannedDate}-${item.visit.outlet.salePhuTrach}`) ?? defaultStartPointBySale.get(item.visit.outlet.salePhuTrach);
      return startPoint ? `${startPoint.x},${startPoint.y}` : "";
    })();
    lineGroups.set(key, `${current ? `${current} ` : ""}${item.point.x},${item.point.y}`);
  }

  const selectedSaleText = sale === "all" ? "tất cả sale" : sale;
  const selectedDateText = date === "all" ? "tất cả ngày" : formatDateValue(date);
  const totalDistance = rows.reduce((sum, visit) => sum + visit.outlet.khoangCachTamCumKm, 0);

  function saveSelectedStartPoint() {
    const x = Number(startX);
    const y = Number(startY);
    if (!editingSale || Number.isNaN(x) || Number.isNaN(y)) return;

    const nextPoint: SaleStartPoint = {
      salePhuTrach: editingSale,
      date: startScope === "date" ? startDate : undefined,
      tenDiemXuatPhat: startName.trim() || `${startType} ${editingSale}`,
      loaiDiem: startType,
      toaDoX: x,
      toaDoY: y,
      ghiChu: startNote.trim(),
    };
    const next = [
      ...startPoints.filter((point) => !(point.salePhuTrach === editingSale && (startScope === "date" ? point.date === startDate : !point.date))),
      nextPoint,
    ];
    setStartPoints(next);
    saveStartPoints(next);
  }

  return (
    <div>
      <PageHeader
        title="Bản đồ tuyến"
        description="Xem vị trí điểm bán bằng tọa độ X/Y hiện có và đường nối theo STT đi trong ngày. Đây là bản đồ demo nội bộ, chưa dùng Google Maps nên không cần API key."
      />

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <MetricCard label="Điểm trên bản đồ" value={rows.length} hint={`${selectedSaleText} · ${selectedDateText}`} />
        <MetricCard label="Cụm đang hiển thị" value={new Set(rows.map((visit) => visit.clusterId)).size} hint="Gom theo cụm nhỏ, không theo quận lớn" />
        <MetricCard label="Tổng khoảng cách tâm cụm" value={`${Math.round(totalDistance)} km`} hint="Ước tính từ dữ liệu mẫu" />
      </div>

      <div className="mb-4 rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="mb-3">
          <div className="font-bold text-ink">Chọn điểm xuất phát</div>
          <div className="text-sm text-muted">Điểm xuất phát dùng làm START để xếp thứ tự đi trong ngày cho từng sale. Có thể nhập văn phòng, kho, nhà sale hoặc điểm hẹn đầu ngày.</div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={startScope} onChange={(event) => setStartScope(event.target.value as "default" | "date")}>
            <option value="default">Mặc định theo sale</option>
            <option value="date">Riêng cho ngày</option>
          </select>
          <input className="h-10 rounded-md border border-line px-3 text-sm disabled:bg-slate-100" type="date" value={startDate} disabled={startScope === "default"} onChange={(event) => setStartDate(event.target.value)} />
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={editingSale} onChange={(event) => setEditingSale(event.target.value)}>
            {saleOwners.map((owner) => (
              <option key={owner} value={owner}>
                {owner}
              </option>
            ))}
          </select>
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={startType} onChange={(event) => setStartType(event.target.value as StartPointType)}>
            {startPointTypes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input className="h-10 rounded-md border border-line px-3 text-sm" value={startName} onChange={(event) => setStartName(event.target.value)} placeholder="Tên điểm xuất phát" />
          <input className="h-10 rounded-md border border-line px-3 text-sm" value={startX} onChange={(event) => setStartX(event.target.value)} placeholder="Tọa độ X" type="number" step="0.01" />
          <input className="h-10 rounded-md border border-line px-3 text-sm" value={startY} onChange={(event) => setStartY(event.target.value)} placeholder="Tọa độ Y" type="number" step="0.01" />
          <input className="h-10 rounded-md border border-line px-3 text-sm" value={startNote} onChange={(event) => setStartNote(event.target.value)} placeholder="Ghi chú" />
          <button className="h-10 rounded-md bg-ink px-4 text-sm font-bold text-white disabled:opacity-50" disabled={startScope === "date" && !startDate} onClick={saveSelectedStartPoint}>
            Lưu START
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {startPoints.map((point) => (
            <button
              key={`${point.salePhuTrach}-${point.date ?? "default"}`}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${editingSale === point.salePhuTrach ? "border-ink bg-ink text-white" : "border-line bg-slate-50 text-slate-700"}`}
              onClick={() => {
                setEditingSale(point.salePhuTrach);
                setStartScope(point.date ? "date" : "default");
                setStartDate(point.date ?? "");
              }}
            >
              {formatStartScope(point)}: {point.loaiDiem} ({point.toaDoX}, {point.toaDoY})
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border border-line bg-white p-4 shadow-soft md:grid-cols-3 xl:grid-cols-6">
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
            <option key={item} value={item}>
              Tháng {item}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={date} onChange={(event) => setDate(event.target.value)}>
          <option value="all">Tất cả ngày</option>
          {dates.map((item) => (
            <option key={item} value={item}>
              {formatDateValue(item)}
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
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <div className="border-b border-line px-4 py-3">
            <div className="font-bold text-ink">Sơ đồ tuyến theo tọa độ</div>
            <div className="text-sm text-muted">Đường nối đi theo thứ tự từng ngày của từng sale. Chọn 1 ngày + 1 sale để nhìn tuyến rõ nhất.</div>
          </div>
          <div className="bg-slate-50 p-4">
            {points.length ? (
              <svg className="h-auto w-full rounded-md bg-white" viewBox="0 0 920 520" role="img" aria-label="Bản đồ tuyến theo tọa độ">
                <defs>
                  <pattern id="map-grid" width="46" height="46" patternUnits="userSpaceOnUse">
                    <path d="M 46 0 L 0 0 0 46" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="920" height="520" fill="url(#map-grid)" />
                {[...lineGroups.entries()].map(([key, value]) => (
                  <polyline key={key} points={value} fill="none" stroke="#0f172a" strokeDasharray={date === "all" || sale === "all" ? "7 7" : undefined} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" opacity="0.45" />
                ))}
                {startMarkers.map(({ start, point }) => (
                  <g key={start.salePhuTrach}>
                    <rect x={point.x - 20} y={point.y - 13} width="40" height="26" rx="7" fill="#0f172a" />
                    <text x={point.x} y={point.y + 4} textAnchor="middle" className="fill-white text-[10px] font-bold">
                      START
                    </text>
                    <text x={point.x} y={point.y - 20} textAnchor="middle" className="fill-slate-900 text-[11px] font-bold">
                      {start.salePhuTrach}
                    </text>
                    <title>{`${start.tenDiemXuatPhat} · ${start.loaiDiem} · ${formatStartScope(start)}`}</title>
                  </g>
                ))}
                {points.map(({ visit, point }) => (
                  <g key={visit.id}>
                    <circle cx={point.x} cy={point.y} r="13" fill={frequencyColors[visit.frequency]} opacity="0.18" />
                    <circle cx={point.x} cy={point.y} r="8" fill={frequencyColors[visit.frequency]} stroke="#ffffff" strokeWidth="2" />
                    <text x={point.x} y={point.y - 16} textAnchor="middle" className="fill-slate-900 text-[11px] font-bold">
                      {visit.routeOrder}
                    </text>
                    <title>{`${visit.routeOrder}. ${visit.outlet.tenDiemBan} · ${visit.outlet.salePhuTrach} · ${visit.clusterId} · ${visit.frequency}`}</title>
                  </g>
                ))}
              </svg>
            ) : (
              <div className="flex h-96 items-center justify-center rounded-md bg-white text-sm text-muted">Không có điểm phù hợp với bộ lọc hiện tại.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <div className="mb-3 font-bold">Thứ tự đi</div>
          <div className="grid max-h-[620px] gap-2 overflow-auto pr-1">
            {rows.slice(0, 80).map((visit) => (
              <div key={visit.id} className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-black text-ink">#{visit.routeOrder}</span>
                  <FrequencyBadge frequency={visit.frequency} />
                </div>
                <div className="font-bold text-ink">{visit.outlet.tenDiemBan}</div>
                <div className="text-xs text-muted">
                  {formatDateValue(visit.plannedDate)} · {visit.outlet.salePhuTrach} · {visit.clusterId}
                </div>
                <div className="mt-1 text-xs text-muted">
                  X/Y: {visit.outlet.toaDoX}, {visit.outlet.toaDoY}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
