import Papa from "papaparse";
import { executionStatuses } from "@/lib/route-execution";
import { clusters as defaultClusters } from "@/lib/seed-data";
import type { RouteCluster } from "@/types/cluster";
import type { Frequency, Outlet } from "@/types/outlet";
import type { RouteExecutionRecord, RouteVisit, VisitStatus, WeekKey } from "@/types/route";

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

const validFrequencies: Frequency[] = ["F8", "F4", "F2", "F1", "F0.5", "F0.3"];

function parseFrequency(value: string | undefined): Frequency | undefined {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return undefined;
  if (normalized === "F05" || normalized === "F0,5") return "F0.5";
  if (normalized === "F03" || normalized === "F0,3") return "F0.3";
  return validFrequencies.includes(normalized as Frequency) ? (normalized as Frequency) : undefined;
}

export function parseOutletCsv(csv: string, routeClusters: RouteCluster[] = defaultClusters): { outlets: Outlet[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const fields = result.meta.fields ?? [];
  const missingColumns = validateOutletColumns(fields);
  if (missingColumns.length) {
    return { outlets: [], errors: [`Thiếu cột bắt buộc: ${missingColumns.join(", ")}. Cột khoangCachTamCumKm không bắt buộc, app sẽ tự tính nếu có tọa độ.`] };
  }

  const clusterById = new Map(routeClusters.map((cluster) => [cluster.maCum, cluster]));
  const hasDistanceColumn = fields.includes("khoangCachTamCumKm");
  const errors: string[] = [];

  const outlets: Outlet[] = result.data.map((row, index) => {
    const line = index + 2;
    const toaDoX = parseCsvNumber(row.toaDoX);
    const toaDoY = parseCsvNumber(row.toaDoY);
    const importedDistance = hasDistanceColumn && row.khoangCachTamCumKm?.trim() ? parseCsvNumber(row.khoangCachTamCumKm) : Number.NaN;
    const rawFrequency = row.ghiNhanF || row.F || row.tanSuat;
    const ghiNhanF = parseFrequency(rawFrequency);
    const cluster = clusterById.get(row.cumNho);
    const calculatedDistance = calculateDistanceToClusterCenter(toaDoX, toaDoY, cluster);
    const khoangCachTamCumKm = Number.isNaN(importedDistance) ? calculatedDistance : importedDistance;

    if (!cluster) errors.push(`Dòng ${line}: cumNho "${row.cumNho}" chưa có trong danh sách cụm, không tự tính được khoảng cách tâm cụm.`);
    if (Number.isNaN(toaDoX) || Number.isNaN(toaDoY)) errors.push(`Dòng ${line}: toaDoX/toaDoY không hợp lệ.`);
    if (Number.isNaN(khoangCachTamCumKm)) errors.push(`Dòng ${line}: khoangCachTamCumKm trống và không tự tính được từ tọa độ/tâm cụm.`);

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
      cumNho: row.cumNho,
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

export function parseExecutionHistoryCsv(csv: string): { records: RouteExecutionRecord[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const fields = result.meta.fields ?? [];
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

    return [
      {
        visitId: row.visitId || `${year}-${month}-${week}-${row.outletId}`,
        outletId: row.outletId,
        month,
        year,
        week,
        clusterId: row.clusterId || "",
        salePhuTrach: row.salePhuTrach,
        actualStatus,
        actualVisitDate: row.actualVisitDate || undefined,
        actualRevenue: row.actualRevenue ? parseCsvNumber(row.actualRevenue) : undefined,
        note: row.note || undefined,
        carryToNextMonth: ["true", "1", "yes", "co", "có"].includes(row.carryToNextMonth.trim().toLowerCase()),
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
