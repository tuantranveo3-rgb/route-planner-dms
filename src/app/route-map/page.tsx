"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { loadClusters } from "@/lib/cluster-storage";
import { loadOutlets } from "@/lib/outlet-storage";
import { clusters, salesTerritories, seedOutlets } from "@/lib/seed-data";
import { DEFAULT_SETTINGS, generateMonthlyRoutePlan, getPlannedDate, weeks } from "@/lib/route-logic";
import { loadSalesConfig } from "@/lib/sales-config";
import { loadSaleUnavailableDays } from "@/lib/sale-unavailable";
import { loadStartPoints, saveStartPoints } from "@/lib/start-points";
import type { Frequency, Outlet } from "@/types/outlet";
import type { RouteCluster } from "@/types/cluster";
import type { RouteVisit, SaleStartPoint, SaleUnavailableDay, WeekKey } from "@/types/route";
import type { SalesTerritory } from "@/types/territory";

type Point = {
  x: number;
  y: number;
};

type LeafletLatLng = [number, number];
type LeafletBounds = unknown;
type LeafletMap = {
  fitBounds: (bounds: LeafletBounds, options?: { padding?: [number, number] }) => void;
  setView: (center: LeafletLatLng, zoom: number) => void;
  invalidateSize: () => void;
};
type LeafletLayer = {
  addTo: (map: LeafletMap) => LeafletLayer;
  remove: () => void;
};
type LeafletMarker = LeafletLayer & {
  bindPopup: (content: string) => LeafletMarker;
};
type LeafletApi = {
  divIcon: (options: { className: string; html: string; iconSize: [number, number]; iconAnchor: [number, number] }) => unknown;
  latLngBounds: (points: LeafletLatLng[]) => LeafletBounds;
  map: (element: HTMLElement, options: { center: LeafletLatLng; zoom: number; scrollWheelZoom: boolean }) => LeafletMap;
  marker: (position: LeafletLatLng, options?: { icon?: unknown; title?: string }) => LeafletMarker;
  polyline: (path: LeafletLatLng[], options: { color: string; opacity: number; weight: number }) => LeafletLayer;
  tileLayer: (url: string, options: { attribution: string; maxZoom: number }) => LeafletLayer;
};

declare global {
  interface Window {
    L?: LeafletApi;
  }
}

type StartPointType = SaleStartPoint["loaiDiem"];

const leafletCssUrl = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const leafletJsUrl = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
let leafletLoader: Promise<LeafletApi> | undefined;

const startPointTypes: StartPointType[] = ["Văn phòng", "Kho", "Nhà sale", "Điểm hẹn"];

const frequencyColors: Record<Frequency, string> = {
  F8: "#9333ea",
  F4: "#dc2626",
  F2: "#2563eb",
  F1: "#16a34a",
  "F0.5": "#64748b",
  "F0.3": "#71717a",
};

function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("Leaflet chỉ chạy trên trình duyệt."));
  if (window.L) return Promise.resolve(window.L);

  if (!document.querySelector("link[data-route-planner-leaflet-css]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = leafletCssUrl;
    link.dataset.routePlannerLeafletCss = "true";
    document.head.appendChild(link);
  }

  if (!leafletLoader) {
    leafletLoader = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>("script[data-route-planner-leaflet]");
      if (existing) {
        existing.addEventListener("load", () => window.L ? resolve(window.L) : reject(new Error("Không tải được Leaflet.")), { once: true });
        existing.addEventListener("error", () => reject(new Error("Không tải được Leaflet.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = leafletJsUrl;
      script.async = true;
      script.defer = true;
      script.dataset.routePlannerLeaflet = "true";
      script.addEventListener("load", () => window.L ? resolve(window.L) : reject(new Error("Không tải được Leaflet.")), { once: true });
      script.addEventListener("error", () => reject(new Error("Không tải được Leaflet.")), { once: true });
      document.head.appendChild(script);
    });
  }

  return leafletLoader;
}

function toLatLng(x: number, y: number): LeafletLatLng | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  if (x < -180 || x > 180 || y < -90 || y > 90) return undefined;
  return [y, x];
}

function isVietnamCoordinate(x: number, y: number) {
  return x >= 102 && x <= 110 && y >= 8 && y <= 24;
}

function hasRealVietnamOutletCoordinates(visits: RouteVisit[]) {
  return visits.length > 0 && visits.every((visit) => isVietnamCoordinate(visit.outlet.toaDoX, visit.outlet.toaDoY));
}

function isValidVietnamStartPoint(point: SaleStartPoint) {
  return isVietnamCoordinate(point.toaDoX, point.toaDoY);
}

function normalizeVietnamCoordinateInput(x: number, y: number) {
  if (isVietnamCoordinate(x, y)) return { x, y, wasSwapped: false };
  if (isVietnamCoordinate(y, x)) return { x: y, y: x, wasSwapped: true };
  return { x, y, wasSwapped: false };
}

function normalizeOutletCoordinates(outlet: Outlet): Outlet {
  const normalized = normalizeVietnamCoordinateInput(outlet.toaDoX, outlet.toaDoY);
  if (!normalized.wasSwapped) return outlet;
  return {
    ...outlet,
    toaDoX: normalized.x,
    toaDoY: normalized.y,
  };
}

function normalizeStartPoint(point: SaleStartPoint): SaleStartPoint {
  const normalized = normalizeVietnamCoordinateInput(point.toaDoX, point.toaDoY);
  if (!normalized.wasSwapped) return point;
  return {
    ...point,
    toaDoX: normalized.x,
    toaDoY: normalized.y,
    ghiChu: [point.ghiChu, "App tự đảo lat/lng khi tải START."].filter(Boolean).join(" · "),
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

function markerHtml(label: string, color: string) {
  return `<div style="
    display:flex;
    align-items:center;
    justify-content:center;
    width:28px;
    height:28px;
    border-radius:999px;
    background:${color};
    color:white;
    border:2px solid white;
    box-shadow:0 8px 18px rgba(15,23,42,.25);
    font-size:12px;
    font-weight:800;
  ">${escapeHtml(label)}</div>`;
}

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

const workingDayNames = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export default function RouteMapPage() {
  const year = new Date().getFullYear();
  const mapElementRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const leafletLayersRef = useRef<LeafletLayer[]>([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [date, setDate] = useState("all");
  const [week, setWeek] = useState<"all" | WeekKey>("all");
  const [sale, setSale] = useState("all");
  const [cluster, setCluster] = useState("all");
  const [frequency, setFrequency] = useState<"all" | Frequency>("all");
  const [outlets, setOutlets] = useState<Outlet[]>(seedOutlets);
  const [routeClusters, setRouteClusters] = useState<RouteCluster[]>(clusters);
  const [startPoints, setStartPoints] = useState<SaleStartPoint[]>([]);
  const [editingSale, setEditingSale] = useState("");
  const selectedStartPoint = startPoints.find((point) => point.salePhuTrach === editingSale && !point.date);
  const [startName, setStartName] = useState("");
  const [startType, setStartType] = useState<StartPointType>("Văn phòng");
  const [startX, setStartX] = useState("");
  const [startY, setStartY] = useState("");
  const [startNote, setStartNote] = useState("");
  const [startScope, setStartScope] = useState<"default" | "date">("default");
  const [startDate, setStartDate] = useState("");
  const [salesConfig, setSalesConfig] = useState<SalesTerritory[]>(salesTerritories);
  const [unavailableDays, setUnavailableDays] = useState<SaleUnavailableDay[]>([]);
  const [mapStatus, setMapStatus] = useState("Đang tải bản đồ OpenStreetMap...");

  useEffect(() => {
    const storedOutlets = loadOutlets().map(normalizeOutletCoordinates);
    const currentSales = new Set(storedOutlets.map((outlet) => outlet.salePhuTrach).filter(Boolean));
    const cleanedStartPoints = loadStartPoints()
      .map(normalizeStartPoint)
      .filter((point) => currentSales.has(point.salePhuTrach));
    setOutlets(storedOutlets);
    setRouteClusters(loadClusters());
    setEditingSale(Array.from(currentSales)[0] ?? "");
    setStartPoints(cleanedStartPoints);
    saveStartPoints(cleanedStartPoints);
    setSalesConfig(loadSalesConfig());
    setUnavailableDays(loadSaleUnavailableDays());
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

  const saleOptions = useMemo(() => Array.from(new Set(outlets.map((outlet) => outlet.salePhuTrach))).filter(Boolean), [outlets]);
  const currentSaleSet = useMemo(() => new Set(saleOptions), [saleOptions]);
  const currentStartPoints = useMemo(() => startPoints.filter((point) => currentSaleSet.has(point.salePhuTrach)), [currentSaleSet, startPoints]);
  const outletsUseStreetCoordinates = useMemo(() => outlets.length > 0 && outlets.every((outlet) => isVietnamCoordinate(outlet.toaDoX, outlet.toaDoY)), [outlets]);
  const startPointsForPlanning = useMemo(
    () => (outletsUseStreetCoordinates ? currentStartPoints.filter(isValidVietnamStartPoint) : currentStartPoints),
    [currentStartPoints, outletsUseStreetCoordinates],
  );
  const plan = useMemo(() => generateMonthlyRoutePlan(month, year, outlets, routeClusters, DEFAULT_SETTINGS, [], startPointsForPlanning, salesConfig, unavailableDays), [month, year, outlets, routeClusters, startPointsForPlanning, salesConfig, unavailableDays]);
  const dateCandidateRows = plan
    .filter((visit) => visit.status !== "CS từ xa")
    .filter((visit) => week === "all" || visit.week === week)
    .filter((visit) => sale === "all" || visit.outlet.salePhuTrach === sale)
    .filter((visit) => cluster === "all" || visit.clusterId === cluster)
    .filter((visit) => frequency === "all" || visit.frequency === frequency);
  const routeDates = useMemo(() => uniqueDates(dateCandidateRows), [dateCandidateRows]);
  const dateOptions = useMemo(() => {
    const selectedWeeks = week === "all" ? weeks : [week];
    const calendarDates = selectedWeeks.flatMap((weekKey) => workingDayNames.map((dayName) => getPlannedDate(year, month, weekKey, dayName)));
    return Array.from(new Set([...calendarDates, ...routeDates])).sort();
  }, [month, routeDates, week, year]);
  const routeDateSet = useMemo(() => new Set(routeDates), [routeDates]);
  const rows = plan
    .filter((visit) => visit.status !== "CS từ xa")
    .filter((visit) => date === "all" || visit.plannedDate === date)
    .filter((visit) => week === "all" || visit.week === week)
    .filter((visit) => sale === "all" || visit.outlet.salePhuTrach === sale)
    .filter((visit) => cluster === "all" || visit.clusterId === cluster)
    .filter((visit) => frequency === "all" || visit.frequency === frequency)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.outlet.salePhuTrach.localeCompare(b.outlet.salePhuTrach) || a.routeOrder - b.routeOrder);
  const visibleClusterIds = Array.from(new Set(rows.map((visit) => visit.clusterId)));
  const isMultiClusterOverview = cluster === "all" && visibleClusterIds.length > 1;
  const shouldDrawRouteLines = !isMultiClusterOverview;
  const dailyStartBySale = new Map(currentStartPoints.filter((point) => point.date).map((point) => [`${point.date}-${point.salePhuTrach}`, point]));
  const defaultStartBySale = new Map(currentStartPoints.filter((point) => !point.date).map((point) => [point.salePhuTrach, point]));
  const visibleStartPoints = Array.from(
    new Map(
      rows.map((visit) => {
        const startPoint = dailyStartBySale.get(`${visit.plannedDate}-${visit.outlet.salePhuTrach}`) ?? defaultStartBySale.get(visit.outlet.salePhuTrach);
        return [`${visit.plannedDate}-${visit.outlet.salePhuTrach}`, startPoint];
      }),
    ).values(),
  ).filter((point): point is SaleStartPoint => Boolean(point));
  const validVisibleStartPoints = visibleStartPoints.filter(isValidVietnamStartPoint);
  const useStreetMap = hasRealVietnamOutletCoordinates(rows);
  const startPointsForDisplay = useStreetMap ? validVisibleStartPoints : visibleStartPoints;
  const bounds = rows.length ? getBounds(rows, startPointsForDisplay) : undefined;
  const points = bounds ? rows.map((visit) => ({ visit, point: projectPoint(visit, bounds) })) : [];
  const startMarkers = bounds ? startPointsForDisplay.map((start) => ({ start, point: projectXY(start.toaDoX, start.toaDoY, bounds) })) : [];
  const dailyStartPointBySale = new Map(startMarkers.filter((marker) => marker.start.date).map((marker) => [`${marker.start.date}-${marker.start.salePhuTrach}`, marker.point]));
  const defaultStartPointBySale = new Map(startMarkers.filter((marker) => !marker.start.date).map((marker) => [marker.start.salePhuTrach, marker.point]));
  const lineGroups = new Map<string, string>();

  if (shouldDrawRouteLines) {
    for (const item of points) {
      const key = `${item.visit.plannedDate}-${item.visit.outlet.salePhuTrach}-${item.visit.clusterId}`;
      const current = lineGroups.get(key) ?? (() => {
        const startPoint = dailyStartPointBySale.get(`${item.visit.plannedDate}-${item.visit.outlet.salePhuTrach}`) ?? defaultStartPointBySale.get(item.visit.outlet.salePhuTrach);
        return startPoint ? `${startPoint.x},${startPoint.y}` : "";
      })();
      lineGroups.set(key, `${current ? `${current} ` : ""}${item.point.x},${item.point.y}`);
    }
  }

  const selectedSaleText = sale === "all" ? "tất cả sale" : sale;
  const selectedDateText = date === "all" ? "tất cả ngày" : formatDateValue(date);
  const totalDistance = rows.reduce((sum, visit) => sum + visit.outlet.khoangCachTamCumKm, 0);
  const showInternalMap = !useStreetMap || mapStatus.includes("sơ đồ nội bộ");
  const missingValidStartPoint = rows.length > 0 && useStreetMap && visibleStartPoints.length > 0 && startPointsForDisplay.length === 0;

  useEffect(() => {
    if (date !== "all" && !dateOptions.includes(date)) {
      setDate("all");
    }
  }, [date, dateOptions]);

  useEffect(() => {
    if (sale !== "all" && !saleOptions.includes(sale)) {
      setSale("all");
    }
    if (editingSale && !saleOptions.includes(editingSale)) {
      setEditingSale(saleOptions[0] ?? "");
    }
  }, [editingSale, sale, saleOptions]);

  useEffect(() => {
    const element = mapElementRef.current;
    if (!element) return;
    if (!rows.length) {
      leafletLayersRef.current.forEach((layer) => layer.remove());
      leafletLayersRef.current = [];
      setMapStatus("Không có điểm phù hợp với bộ lọc hiện tại. Hãy chọn Tất cả ngày hoặc ngày có tuyến của sale này.");
      return;
    }
    if (!hasRealVietnamOutletCoordinates(rows)) {
      setMapStatus("Tọa độ hiện tại là X/Y demo, đang dùng sơ đồ nội bộ. Muốn hiện bản đồ thật, nhập toaDoX=kinh độ và toaDoY=vĩ độ tại Việt Nam.");
      return;
    }

    let cancelled = false;
    setMapStatus("Đang tải bản đồ OpenStreetMap...");

    loadLeaflet()
      .then((leaflet) => {
        if (cancelled) return;

        leafletLayersRef.current.forEach((layer) => layer.remove());
        leafletLayersRef.current = [];

        const visitPositions = rows
          .map((visit) => ({ visit, position: toLatLng(visit.outlet.toaDoX, visit.outlet.toaDoY) }))
          .filter((item): item is { visit: RouteVisit; position: LeafletLatLng } => Boolean(item.position));
        const startPositions = validVisibleStartPoints
          .map((start) => ({ start, position: toLatLng(start.toaDoX, start.toaDoY) }))
          .filter((item): item is { start: SaleStartPoint; position: LeafletLatLng } => Boolean(item.position));

        if (!visitPositions.length && !startPositions.length) {
          setMapStatus("Không có tọa độ hợp lệ để hiển thị trên OpenStreetMap. Đang dùng sơ đồ nội bộ.");
          return;
        }

        const firstPosition = visitPositions[0]?.position ?? startPositions[0].position;
        const map = leafletMapRef.current ?? leaflet.map(element, { center: firstPosition, zoom: 13, scrollWheelZoom: true });
        leafletMapRef.current = map;

        if (!leafletLayersRef.current.length) {
          leafletLayersRef.current.push(
            leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
              maxZoom: 19,
            }).addTo(map),
          );
        }

        for (const { start, position } of startPositions) {
          const icon = leaflet.divIcon({
            className: "route-map-start-marker",
            html: markerHtml("0", "#0f172a"),
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const marker = leaflet.marker(position, { icon, title: `${start.tenDiemXuatPhat} · ${formatStartScope(start)}` });
          marker
            .bindPopup(`<strong>${escapeHtml(start.tenDiemXuatPhat)}</strong><br/>${escapeHtml(start.loaiDiem)} · ${escapeHtml(formatStartScope(start))}<br/>X/Y: ${start.toaDoX}, ${start.toaDoY}`)
            .addTo(map);
          leafletLayersRef.current.push(marker);
        }

        for (const { visit, position } of visitPositions) {
          const icon = leaflet.divIcon({
            className: "route-map-outlet-marker",
            html: markerHtml(String(visit.routeOrder), frequencyColors[visit.frequency]),
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const marker = leaflet.marker(position, { icon, title: `${visit.routeOrder}. ${visit.outlet.tenDiemBan}` });
          marker
            .bindPopup(
              `<strong>${visit.routeOrder}. ${escapeHtml(visit.outlet.tenDiemBan)}</strong><br/>${escapeHtml(visit.outlet.salePhuTrach)} · ${escapeHtml(visit.clusterId)} · ${escapeHtml(visit.frequency)}<br/>${escapeHtml(visit.outlet.diaChi)}<br/>X/Y: ${visit.outlet.toaDoX}, ${visit.outlet.toaDoY}`,
            )
            .addTo(map);
          leafletLayersRef.current.push(marker);
        }

        if (shouldDrawRouteLines) {
          const routeGroups = new Map<string, LeafletLatLng[]>();
          const sortedPositions = visitPositions.sort(
            (a, b) =>
              a.visit.plannedDate.localeCompare(b.visit.plannedDate) ||
              a.visit.outlet.salePhuTrach.localeCompare(b.visit.outlet.salePhuTrach) ||
              a.visit.clusterId.localeCompare(b.visit.clusterId) ||
              a.visit.routeOrder - b.visit.routeOrder,
          );
          for (const { visit, position } of sortedPositions) {
            const key = `${visit.plannedDate}-${visit.outlet.salePhuTrach}-${visit.clusterId}`;
            if (!routeGroups.has(key)) {
              const start =
                startPositions.find((item) => item.start.salePhuTrach === visit.outlet.salePhuTrach && item.start.date === visit.plannedDate) ??
                startPositions.find((item) => item.start.salePhuTrach === visit.outlet.salePhuTrach && !item.start.date);
              routeGroups.set(key, start ? [start.position] : []);
            }
            routeGroups.get(key)?.push(position);
          }

          for (const path of routeGroups.values()) {
            if (path.length < 2) continue;
            leafletLayersRef.current.push(leaflet.polyline(path, { color: "#0f172a", opacity: 0.55, weight: 3 }).addTo(map));
          }
        }

        const allPositions = [...visitPositions.map((item) => item.position), ...startPositions.map((item) => item.position)];
        if (allPositions.length === 1) {
          map.setView(allPositions[0], 15);
        } else {
          map.fitBounds(leaflet.latLngBounds(allPositions), { padding: [28, 28] });
        }
        setTimeout(() => map.invalidateSize(), 50);
        setMapStatus(
          startPositions.length
            ? `OpenStreetMap: ${visitPositions.length} điểm bán, ${startPositions.length} điểm xuất phát #0. Không cần API key.`
            : `OpenStreetMap: ${visitPositions.length} điểm bán, 0 điểm xuất phát hợp lệ. Hãy lưu START bằng tọa độ thật để tuyến bắt đầu từ #0.`,
        );
      })
      .catch((error: Error) => {
        if (!cancelled) setMapStatus(`${error.message} Đang dùng sơ đồ nội bộ.`);
      });

    return () => {
      cancelled = true;
    };
  }, [rows, shouldDrawRouteLines, validVisibleStartPoints]);

  function saveSelectedStartPoint() {
    const x = Number(startX);
    const y = Number(startY);
    if (!editingSale || Number.isNaN(x) || Number.isNaN(y)) return;
    const normalized = normalizeVietnamCoordinateInput(x, y);
    if (normalized.wasSwapped) {
      setStartX(String(normalized.x));
      setStartY(String(normalized.y));
    }

    const nextPoint: SaleStartPoint = {
      salePhuTrach: editingSale,
      date: startScope === "date" ? startDate : undefined,
      tenDiemXuatPhat: startName.trim() || `${startType} ${editingSale}`,
      loaiDiem: startType,
      toaDoX: normalized.x,
      toaDoY: normalized.y,
      ghiChu: [startNote.trim(), normalized.wasSwapped ? "App tự đảo lat/lng khi lưu START." : ""].filter(Boolean).join(" · "),
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
        description="Hiển thị marker điểm bán, điểm xuất phát và thứ tự đi. Nếu tọa độ là kinh độ/vĩ độ Việt Nam, app dùng Leaflet + OpenStreetMap; nếu là X/Y demo, app dùng sơ đồ nội bộ để tránh nhảy sai bản đồ."
      />

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <MetricCard label="Điểm trên bản đồ" value={rows.length} hint={`${selectedSaleText} · ${selectedDateText}`} />
        <MetricCard label="Cụm đang hiển thị" value={visibleClusterIds.length} hint="Gom theo cụm nhỏ, không theo quận lớn" />
        <MetricCard label="Tổng khoảng cách tâm cụm" value={`${Math.round(totalDistance)} km`} hint="Ước tính từ dữ liệu mẫu/import" />
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
            {saleOptions.map((owner) => (
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
          <input className="h-10 rounded-md border border-line px-3 text-sm" value={startX} onChange={(event) => setStartX(event.target.value)} placeholder="Kinh độ X, ví dụ 106.6659" title="Kinh độ/toaDoX, thường là 106.x ở TP.HCM" type="number" step="0.000001" />
          <input className="h-10 rounded-md border border-line px-3 text-sm" value={startY} onChange={(event) => setStartY(event.target.value)} placeholder="Vĩ độ Y, ví dụ 10.7995" title="Vĩ độ/toaDoY, thường là 10.x ở TP.HCM" type="number" step="0.000001" />
          <input className="h-10 rounded-md border border-line px-3 text-sm" value={startNote} onChange={(event) => setStartNote(event.target.value)} placeholder="Ghi chú" />
          <button className="h-10 rounded-md bg-ink px-4 text-sm font-bold text-white disabled:opacity-50" disabled={startScope === "date" && !startDate} onClick={saveSelectedStartPoint}>
            Lưu START
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {currentStartPoints.map((point) => (
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
          {dateOptions.map((item) => (
            <option key={item} value={item}>
              {formatDateValue(item)}
              {routeDateSet.has(item) ? "" : " - không có tuyến"}
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
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <div className="border-b border-line px-4 py-3">
            <div className="font-bold text-ink">{useStreetMap ? "OpenStreetMap tuyến bán hàng" : "Sơ đồ tuyến nội bộ"}</div>
            <div className="text-sm text-muted">{mapStatus}</div>
            {isMultiClusterOverview ? (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                Đang xem nhiều cụm cùng lúc. App đang ẩn đường nối để tránh hiểu nhầm là một tuyến; chọn một cụm cụ thể để xem thứ tự đi trong ngày rõ nhất.
              </div>
            ) : null}
          </div>
          <div className="bg-slate-50 p-4">
            {rows.length && !showInternalMap ? (
              <div ref={mapElementRef} className="h-[560px] w-full rounded-md bg-white" />
            ) : points.length ? (
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
                  <g key={`${start.salePhuTrach}-${start.date ?? "default"}`}>
                    <circle cx={point.x} cy={point.y} r="14" fill="#0f172a" stroke="#ffffff" strokeWidth="3" />
                    <text x={point.x} y={point.y + 4} textAnchor="middle" className="fill-white text-[12px] font-black">
                      0
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
            {startPointsForDisplay.map((start) => (
              <div key={`start-${start.salePhuTrach}-${start.date ?? "default"}`} className="rounded-md bg-ink p-3 text-sm text-white">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-black">#0</span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold">START</span>
                </div>
                <div className="font-bold">{start.tenDiemXuatPhat}</div>
                <div className="text-xs text-slate-200">
                  {start.loaiDiem} · {formatStartScope(start)}
                </div>
                <div className="mt-1 text-xs text-slate-200">
                  X/Y: {start.toaDoX}, {start.toaDoY}
                </div>
              </div>
            ))}
            {missingValidStartPoint ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Chưa có #0 hợp lệ cho bộ lọc hiện tại. Hãy nhập tọa độ xuất phát thật, ví dụ toaDoX=106.x và toaDoY=10.x, rồi bấm Lưu START.
              </div>
            ) : null}
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
