import Papa from "papaparse";
import type { Outlet } from "@/types/outlet";
import type { RouteExecutionRecord, RouteVisit, VisitStatus, WeekKey } from "@/types/route";
import { executionStatuses } from "@/lib/route-execution";

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
  "khoangCachTamCumKm",
  "toaDoX",
  "toaDoY",
  "ghiChu",
];

export function validateOutletColumns(fields: string[]): string[] {
  return requiredOutletColumns.filter((column) => !fields.includes(column));
}

export function parseOutletCsv(csv: string): { outlets: Outlet[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const missingColumns = validateOutletColumns(result.meta.fields ?? []);
  if (missingColumns.length) {
    return { outlets: [], errors: [`Thiếu cột bắt buộc: ${missingColumns.join(", ")}`] };
  }

  const outlets: Outlet[] = result.data.map((row) => ({
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
    doanhSo3Thang: Number(row.doanhSo3Thang),
    soDon3Thang: Number(row.soDon3Thang),
    tiemNang: Number(row.tiemNang),
    ruiRoMatKhach: Number(row.ruiRoMatKhach),
    khoangCachTamCumKm: Number(row.khoangCachTamCumKm),
    toaDoX: Number(row.toaDoX),
    toaDoY: Number(row.toaDoY),
    ghiChu: row.ghiChu,
  }));

  const invalid = outlets.filter((outlet) => !outlet.outletId || Number.isNaN(outlet.doanhSo3Thang));
  return {
    outlets,
    errors: invalid.length ? [`Có ${invalid.length} dòng thiếu outletId hoặc số liệu không hợp lệ.`] : [],
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
        visitId: `${year}-${month}-${week}-${row.outletId}`,
        outletId: row.outletId,
        month,
        year,
        week,
        clusterId: row.clusterId || "",
        salePhuTrach: row.salePhuTrach,
        actualStatus,
        actualVisitDate: row.actualVisitDate || undefined,
        actualRevenue: row.actualRevenue ? Number(row.actualRevenue) : undefined,
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
      thang: `${visit.month}/${visit.year}`,
      tuan: visit.week,
      ngayDi: visit.dayName,
      sttDi: visit.routeOrder,
      outletId: visit.outlet.outletId,
      tenDiemBan: visit.outlet.tenDiemBan,
      kenh: visit.outlet.kenh,
      chuoi: visit.outlet.chuoi,
      quanHuyen: visit.outlet.quanHuyen,
      phuongXa: visit.outlet.phuongXa,
      cumNho: visit.clusterId,
      tanSuat: visit.frequency,
      tongDiem: visit.outlet.totalScore,
      doanhSo3Thang: visit.outlet.doanhSo3Thang,
      lyDoUuTien: visit.priorityReason,
      trangThai: visit.status,
      canhBao: visit.warning ?? "",
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
