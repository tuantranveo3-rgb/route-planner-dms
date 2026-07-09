import Papa from "papaparse";
import { executionStatuses } from "@/lib/route-execution";
import { clusters as defaultClusters } from "@/lib/seed-data";
import type { RouteCluster } from "@/types/cluster";
import type { Frequency, Outlet } from "@/types/outlet";
import type { RouteExecutionRecord, RouteVisit, VisitStatus, VisitType, WeekKey } from "@/types/route";

export const requiredOutletColumns: Array<keyof Outlet> = [
  "outletId",
  "tenDiemBan",
  "kenh",
  "chuoi",
  "tinhThanh",
  "quanHuyen",
  "phuongXa",
  "diaChi",
  "cumNho",
  "salePhuTrach",
  "doanhSo3Thang",
  "soDon3Thang",
  "tiemNang",
  "ruiRoMatKhach",
  "toaDoX",
  "toaDoY",
  "ghiChu",
];

export const optionalOutletColumns: Array<keyof Outlet> = ["khoangCachTamCumKm", "ghiNhanF"];

export function validateOutletColumns(fields: string[]): string[] {
  return requiredOutletColumns.filter((column) => !fields.includes(column));
}

function normalizeHeaderKey(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const outletHeaderAliases: Partial<Record<keyof Outlet, string[]>> = {
  outletId: ["outletId", "outlet id", "ma diem ban", "ma khach hang", "ma outlet"],
  tenDiemBan: ["tenDiemBan", "ten diem ban", "ten outlet", "ten khach hang", "ten cua hang"],
  kenh: ["kenh", "channel"],
  chuoi: ["chuoi", "chain"],
  tinhThanh: ["tinhThanh", "tinh thanh", "thanh pho", "city", "province"],
  quanHuyen: ["quanHuyen", "quan huyen", "quan", "district"],
  phuongXa: ["phuongXa", "phuong xa", "phuong", "ward"],
  diaChi: ["diaChi", "dia chi", "address"],
  cumNho: ["cumNho", "cum nho", "cum", "cluster", "ma cum"],
  salePhuTrach: ["salePhuTrach", "sale phu trach", "sale", "nhan vien ban hang", "salesman"],
  doanhSo3Thang: ["doanhSo3Thang", "doanh so 3 thang", "ds 3 thang", "ds3thang", "sales 3 months", "revenue"],
  soDon3Thang: ["soDon3Thang", "so don 3 thang", "don 3 thang", "orders 3 months", "orders"],
  tiemNang: ["tiemNang", "tiem nang", "potential"],
  ruiRoMatKhach: ["ruiRoMatKhach", "rui ro mat khach", "rui ro", "risk"],
  khoangCachTamCumKm: ["khoangCachTamCumKm", "khoang cach tam cum", "khoang cach", "distance"],
  toaDoX: ["toaDoX", "toa do x", "kinh do", "longitude", "lng", "long"],
  toaDoY: ["toaDoY", "toa do y", "vi do", "latitude", "lat"],
  ghiNhanF: ["ghiNhanF", "ghi nhan f", "f", "tan suat", "frequency"],
  ghiChu: ["ghiChu", "ghi chu", "note", "notes"],
};

const outletHeaderLookup = new Map<string, keyof Outlet>();
for (const [canonical, aliases] of Object.entries(outletHeaderAliases) as Array<[keyof Outlet, string[]]>) {
  for (const alias of aliases) outletHeaderLookup.set(normalizeHeaderKey(alias), canonical);
}

function normalizeOutletHeader(header: string) {
  const clean = header.replace(/^\uFEFF/, "").trim();
  return outletHeaderLookup.get(normalizeHeaderKey(clean)) ?? clean;
}

export function normalizeClusterId(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "-");
}

function weekdayByIndex(index: number): RouteCluster["ngayDiCoDinh"] {
  const days: RouteCluster["ngayDiCoDinh"][] = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  return days[index % days.length];
}

export function buildImportedClusters(outlets: Outlet[], baseClusters: RouteCluster[] = defaultClusters): RouteCluster[] {
  const clusterById = new Map(baseClusters.map((cluster) => [normalizeClusterId(cluster.maCum), { ...cluster, maCum: normalizeClusterId(cluster.maCum) }]));
  const grouped = new Map<string, Outlet[]>();

  for (const outlet of outlets) {
    const clusterId = normalizeClusterId(outlet.cumNho);
    if (!clusterId || clusterById.has(clusterId)) continue;
    grouped.set(clusterId, [...(grouped.get(clusterId) ?? []), outlet]);
  }

  let index = clusterById.size;
  for (const [clusterId, rows] of grouped) {
    const validCoordinates = rows.filter((row) => !Number.isNaN(row.toaDoX) && !Number.isNaN(row.toaDoY));
    const centerX = validCoordinates.length ? validCoordinates.reduce((sum, row) => sum + row.toaDoX, 0) / validCoordinates.length : 0;
    const centerY = validCoordinates.length ? validCoordinates.reduce((sum, row) => sum + row.toaDoY, 0) / validCoordinates.length : 0;
    const wards = Array.from(new Set(rows.map((row) => row.phuongXa).filter(Boolean)));
    const districts = Array.from(new Set(rows.map((row) => row.quanHuyen).filter(Boolean)));
    clusterById.set(clusterId, {
      maCum: clusterId,
      tenCum: `${districts[0] || "Cụm mới"} - ${wards.slice(0, 2).join(", ") || clusterId}`,
      quanHuyen: districts.join(", ") || "Chưa xác định",
      danhSachPhuongXa: wards.length ? wards : ["Chưa xác định"],
      ngayDiCoDinh: weekdayByIndex(index),
      capacityNgay: 18,
      toaDoTamX: Number(centerX.toFixed(6)),
      toaDoTamY: Number(centerY.toFixed(6)),
    });
    index += 1;
  }

  return Array.from(clusterById.values());
}

function roundDistance(value: number) {
  return Number(value.toFixed(1));
}

function parseCsvNumber(value: string | number | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const compact = raw.replace(/\s/g, "");
  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");

  if (hasComma && hasDot) {
    const lastComma = compact.lastIndexOf(",");
    const lastDot = compact.lastIndexOf(".");
    return Number(lastComma > lastDot ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(/,/g, ""));
  }

  if (hasComma) {
    const parts = compact.split(",");
    const last = parts.at(-1) ?? "";
    return Number(last.length === 3 && parts.length > 1 ? compact.replace(/,/g, "") : compact.replace(",", "."));
  }

  return Number(compact);
}

function calculateDistanceToClusterCenter(toaDoX: number, toaDoY: number, cluster?: RouteCluster) {
  if (!cluster) return Number.NaN;
  const dx = toaDoX - cluster.toaDoTamX;
  const dy = toaDoY - cluster.toaDoTamY;
  return roundDistance(Math.sqrt(dx * dx + dy * dy));
}

function isVietnamCoordinate(x: number, y: number) {
  return x >= 102 && x <= 110 && y >= 8 && y <= 24;
}

function normalizeVietnamCoordinateInput(x: number, y: number) {
  if (isVietnamCoordinate(x, y)) return { x, y };
  if (isVietnamCoordinate(y, x)) return { x: y, y: x };
  return { x, y };
}

const validFrequencies: Frequency[] = ["F8", "F4", "F2", "F1", "F0.5", "F0.3"];

function parseFrequency(value: string | undefined): Frequency | undefined {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return undefined;
  if (normalized === "F05" || normalized === "F0,5") return "F0.5";
  if (normalized === "F03" || normalized === "F0,3") return "F0.3";
  return validFrequencies.includes(normalized as Frequency) ? (normalized as Frequency) : undefined;
}

export function parseOutletCsv(csv: string, routeClusters: RouteCluster[] = defaultClusters): { outlets: Outlet[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: normalizeOutletHeader });
  const fields = result.meta.fields ?? [];
  const missingColumns = validateOutletColumns(fields);
  if (missingColumns.length) {
    return { outlets: [], errors: [`Thiếu cột bắt buộc: ${missingColumns.join(", ")}. Cột khoangCachTamCumKm không bắt buộc, app sẽ tự tính nếu có tọa độ.`] };
  }

  const clusterById = new Map(routeClusters.map((cluster) => [normalizeClusterId(cluster.maCum), { ...cluster, maCum: normalizeClusterId(cluster.maCum) }]));
  const hasDistanceColumn = fields.includes("khoangCachTamCumKm");
  const errors: string[] = [];
  const inferredClusterRows = new Map<string, Record<string, string>[]>();

  for (const row of result.data) {
    const clusterId = normalizeClusterId(row.cumNho);
    if (!clusterId || clusterById.has(clusterId)) continue;
    inferredClusterRows.set(clusterId, [...(inferredClusterRows.get(clusterId) ?? []), row]);
  }

  let inferredIndex = clusterById.size;
  for (const [clusterId, rows] of inferredClusterRows) {
    const coordinateRows = rows
      .map((row) => ({ x: parseCsvNumber(row.toaDoX), y: parseCsvNumber(row.toaDoY) }))
      .filter((row) => !Number.isNaN(row.x) && !Number.isNaN(row.y));
    const centerX = coordinateRows.length ? coordinateRows.reduce((sum, row) => sum + row.x, 0) / coordinateRows.length : 0;
    const centerY = coordinateRows.length ? coordinateRows.reduce((sum, row) => sum + row.y, 0) / coordinateRows.length : 0;
    clusterById.set(clusterId, {
      maCum: clusterId,
      tenCum: clusterId,
      quanHuyen: rows[0]?.quanHuyen || "Chưa xác định",
      danhSachPhuongXa: Array.from(new Set(rows.map((row) => row.phuongXa).filter(Boolean))),
      ngayDiCoDinh: weekdayByIndex(inferredIndex),
      capacityNgay: 18,
      toaDoTamX: Number(centerX.toFixed(6)),
      toaDoTamY: Number(centerY.toFixed(6)),
    });
    inferredIndex += 1;
  }

  const outlets: Outlet[] = result.data.map((row, index) => {
    const line = index + 2;
    const rawToaDoX = parseCsvNumber(row.toaDoX);
    const rawToaDoY = parseCsvNumber(row.toaDoY);
    const normalizedCoordinates = normalizeVietnamCoordinateInput(rawToaDoX, rawToaDoY);
    const toaDoX = normalizedCoordinates.x;
    const toaDoY = normalizedCoordinates.y;
    const importedDistance = hasDistanceColumn && row.khoangCachTamCumKm?.trim() ? parseCsvNumber(row.khoangCachTamCumKm) : Number.NaN;
    const rawFrequency = row.ghiNhanF || row.F || row.tanSuat;
    const ghiNhanF = parseFrequency(rawFrequency);
    const cumNho = normalizeClusterId(row.cumNho);
    const cluster = clusterById.get(cumNho);
    const calculatedDistance = calculateDistanceToClusterCenter(toaDoX, toaDoY, cluster);
    const khoangCachTamCumKm = Number.isNaN(importedDistance) ? calculatedDistance : importedDistance;

    if (Number.isNaN(toaDoX) || Number.isNaN(toaDoY)) errors.push(`Dòng ${line}: toaDoX/toaDoY không hợp lệ.`);
    if (Number.isNaN(khoangCachTamCumKm) && hasDistanceColumn) errors.push(`Dòng ${line}: khoangCachTamCumKm không hợp lệ.`);

    if (rawFrequency && !ghiNhanF) errors.push(`Dòng ${line}: ghiNhanF "${rawFrequency}" không hợp lệ. Chỉ nhận F8, F4, F2, F1, F0.5, F0.3.`);

    return {
      outletId: row.outletId,
      tenDiemBan: row.tenDiemBan,
      kenh: row.kenh === "MT" ? "MT" : "GT",
      chuoi: row.chuoi,
      tinhThanh: row.tinhThanh,
      quanHuyen: row.quanHuyen,
      phuongXa: row.phuongXa,
      diaChi: row.diaChi,
      cumNho,
      salePhuTrach: row.salePhuTrach,
      doanhSo3Thang: parseCsvNumber(row.doanhSo3Thang),
      soDon3Thang: parseCsvNumber(row.soDon3Thang),
      tiemNang: parseCsvNumber(row.tiemNang),
      ruiRoMatKhach: parseCsvNumber(row.ruiRoMatKhach),
      khoangCachTamCumKm,
      toaDoX,
      toaDoY,
      ghiNhanF,
      ghiChu: row.ghiChu,
    };
  });

  const invalid = outlets.filter((outlet) => !outlet.outletId || Number.isNaN(outlet.doanhSo3Thang));
  return {
    outlets,
    errors: [...errors, ...(invalid.length ? [`Có ${invalid.length} dòng thiếu outletId hoặc số liệu không hợp lệ.`] : [])],
  };
}

export const requiredExecutionColumns = [
  "month",
  "year",
  "week",
  "outletId",
  "salePhuTrach",
  "actualStatus",
  "actualVisitDate",
  "actualRevenue",
  "note",
  "carryToNextMonth",
];

const visitTypes: VisitType[] = ["Theo lịch", "Ghé thêm", "Bù tuyến", "Đi sớm"];

function parseBoolean(value?: string) {
  return ["true", "1", "yes", "co", "có", "x"].includes((value ?? "").trim().toLowerCase());
}

function makeExtraVisitId(row: Record<string, string>, month: number, year: number, week: WeekKey, line: number) {
  const datePart = row.actualVisitDate || row.ngayDuKien || "no-date";
  const salePart = (row.salePhuTrach || "no-sale").replace(/\s+/g, "-");
  return `EXTRA-${year}-${month}-${week}-${datePart}-${row.outletId}-${salePart}-${line}`;
}

export function parseExecutionHistoryCsv(csv: string): { records: RouteExecutionRecord[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const fields = result.meta.fields ?? [];
  const hasVisitIdColumn = fields.includes("visitId");
  const missingColumns = requiredExecutionColumns.filter((column) => !fields.includes(column));
  if (missingColumns.length) {
    return { records: [], errors: [`Thiếu cột lịch sử bắt buộc: ${missingColumns.join(", ")}`] };
  }

  const errors: string[] = [];
  const records: RouteExecutionRecord[] = result.data.flatMap((row, index) => {
    const line = index + 2;
    const month = Number(row.month);
    const year = Number(row.year);
    const week = row.week as WeekKey;
    const actualStatus = row.actualStatus as VisitStatus;
    const visitType = (row.visitType || "").trim() as VisitType;
    const isExtraVisit = parseBoolean(row.isExtraVisit) || (hasVisitIdColumn && !row.visitId);

    if (!month || !year || !["W1", "W2", "W3", "W4"].includes(week)) {
      errors.push(`Dòng ${line}: month/year/week không hợp lệ.`);
      return [];
    }
    if (!row.outletId) {
      errors.push(`Dòng ${line}: thiếu outletId.`);
      return [];
    }
    if (!executionStatuses.includes(actualStatus)) {
      errors.push(`Dòng ${line}: actualStatus không hợp lệ.`);
      return [];
    }
    if (visitType && !visitTypes.includes(visitType)) {
      errors.push(`Dòng ${line}: visitType không hợp lệ. Dùng: ${visitTypes.join(", ")}.`);
      return [];
    }

    return [
      {
        visitId: row.visitId || (hasVisitIdColumn ? makeExtraVisitId(row, month, year, week, line) : `${year}-${month}-${week}-${row.outletId}`),
        outletId: row.outletId,
        month,
        year,
        week,
        clusterId: row.clusterId || "",
        salePhuTrach: row.salePhuTrach,
        actualStatus,
        actualVisitDate: row.actualVisitDate || undefined,
        actualRevenue: row.actualRevenue ? parseCsvNumber(row.actualRevenue) : undefined,
        visitType: visitType || (isExtraVisit ? "Ghé thêm" : "Theo lịch"),
        source: row.source || undefined,
        isExtraVisit,
        note: row.note || undefined,
        carryToNextMonth: parseBoolean(row.carryToNextMonth),
        updatedAt: new Date().toISOString(),
      },
    ];
  });

  const invalidRevenue = records.filter((record) => Number.isNaN(record.actualRevenue));
  if (invalidRevenue.length) {
    errors.push(`Có ${invalidRevenue.length} dòng actualRevenue không hợp lệ.`);
  }

  return { records, errors };
}

export function plannerToCsv(plan: RouteVisit[]): string {
  return Papa.unparse(
    plan.map((visit) => ({
      visitId: visit.id,
      thang: `${visit.month}/${visit.year}`,
      month: visit.month,
      year: visit.year,
      tuan: visit.week,
      week: visit.week,
      ngayDi: visit.dayName,
      ngayDuKien: visit.plannedDate,
      sttDi: visit.routeOrder,
      outletId: visit.outlet.outletId,
      tenDiemBan: visit.outlet.tenDiemBan,
      salePhuTrach: visit.outlet.salePhuTrach,
      clusterId: visit.clusterId,
      kenh: visit.outlet.kenh,
      chuoi: visit.outlet.chuoi,
      quanHuyen: visit.outlet.quanHuyen,
      phuongXa: visit.outlet.phuongXa,
      cumNho: visit.clusterId,
      ghiNhanF: visit.outlet.ghiNhanF ?? "",
      tanSuat: visit.frequency,
      tongDiem: visit.outlet.totalScore,
      doanhSo3Thang: visit.outlet.doanhSo3Thang,
      lyDoUuTien: visit.priorityReason,
      trangThai: visit.status,
      actualStatus: visit.status,
      actualVisitDate: "",
      actualRevenue: "",
      visitType: "Theo lịch",
      source: "",
      isExtraVisit: "false",
      note: "",
      carryToNextMonth: "false",
      canhBao: visit.warning ?? "",
    })),
  );
}

export function executionHistoryToCsv(records: RouteExecutionRecord[]): string {
  return Papa.unparse(
    records
      .slice()
      .sort((a, b) => a.year - b.year || a.month - b.month || a.week.localeCompare(b.week) || a.salePhuTrach.localeCompare(b.salePhuTrach))
      .map((record) => ({
        visitId: record.visitId,
        month: record.month,
        year: record.year,
        week: record.week,
        outletId: record.outletId,
        salePhuTrach: record.salePhuTrach,
        clusterId: record.clusterId,
        actualStatus: record.actualStatus,
        actualVisitDate: record.actualVisitDate ?? "",
        actualRevenue: record.actualRevenue ?? "",
        visitType: record.visitType ?? (record.isExtraVisit ? "Ghé thêm" : "Theo lịch"),
        source: record.source ?? "",
        isExtraVisit: record.isExtraVisit ? "true" : "false",
        note: record.note ?? "",
        carryToNextMonth: record.carryToNextMonth ? "true" : "false",
        updatedAt: record.updatedAt,
      })),
  );
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
