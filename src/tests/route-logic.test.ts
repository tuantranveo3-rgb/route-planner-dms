import { describe, expect, it } from "vitest";
import { clusters, salesTerritories, seedOutlets } from "@/lib/seed-data";
import { findUnassignedClusters, summarizeTerritories } from "@/lib/territory-logic";
import { parseExecutionHistoryCsv, parseOutletCsv } from "@/lib/csv";
import { buildCarryoversForNextMonth, buildLowFrequencyHistoryCarryovers, summarizeExecution, upsertExecutionRecord } from "@/lib/route-execution";
import {
  assignFrequency,
  calculateMonthlyVisits,
  calculateOutletScore,
  generateMonthlyRoutePlan,
  optimizeDailyRoute,
} from "@/lib/route-logic";
import type { Outlet } from "@/types/outlet";

const strongOutlet: Outlet = {
  outletId: "TEST-001",
  tenDiemBan: "Hasaki Test",
  kenh: "MT",
  chuoi: "Hasaki",
  tinhThanh: "TP.HCM",
  quanHuyen: "Quận 1",
  phuongXa: "Bến Nghé",
  diaChi: "1 Đồng Khởi",
  cumNho: "Q1-A",
  salePhuTrach: "An Nguyễn",
  doanhSo3Thang: 300_000_000,
  soDon3Thang: 36,
  tiemNang: 5,
  ruiRoMatKhach: 5,
  khoangCachTamCumKm: 1.2,
  toaDoX: 10,
  toaDoY: 11,
  ghiChu: "Khách trọng điểm",
};

describe("route logic", () => {
  it("calculateOutletScore returns weighted score and F8 for a top outlet", () => {
    const score = calculateOutletScore(strongOutlet);
    expect(score.totalScore).toBe(100);
    expect(score.frequency).toBe("F8");
    expect(score.monthlyVisits).toBe(8);
  });

  it("assignFrequency maps score thresholds correctly", () => {
    expect(assignFrequency(92)).toBe("F8");
    expect(assignFrequency(80)).toBe("F4");
    expect(assignFrequency(60)).toBe("F2");
    expect(assignFrequency(40)).toBe("F1");
    expect(assignFrequency(25)).toBe("F0.5");
    expect(assignFrequency(24.9)).toBe("F0.3");
  });

  it("calculateMonthlyVisits maps each frequency to visit count", () => {
    expect(calculateMonthlyVisits("F8")).toBe(8);
    expect(calculateMonthlyVisits("F4")).toBe(4);
    expect(calculateMonthlyVisits("F2")).toBe(2);
    expect(calculateMonthlyVisits("F1")).toBe(1);
    expect(calculateMonthlyVisits("F0.5")).toBe(0.5);
    expect(calculateMonthlyVisits("F0.3")).toBe(0.3);
  });

  it("uses imported ghiNhanF instead of recalculating route frequency", () => {
    const outlet: Outlet = { ...strongOutlet, ghiNhanF: "F1" };
    const score = calculateOutletScore(outlet);
    const plan = generateMonthlyRoutePlan(5, 2026, [outlet], clusters);

    expect(score.totalScore).toBe(100);
    expect(score.frequency).toBe("F1");
    expect(score.monthlyVisits).toBe(1);
    expect(plan.filter((visit) => visit.outlet.outletId === outlet.outletId)).toHaveLength(1);
    expect(plan[0].frequency).toBe("F1");
  });

  it("generateMonthlyRoutePlan creates non-empty weekly plan with F4 locked in all weeks", () => {
    const plan = generateMonthlyRoutePlan(5, 2026, seedOutlets, clusters);
    const f4Outlet = plan.find((visit) => visit.frequency === "F4")?.outlet.outletId;
    expect(plan.length).toBeGreaterThan(0);
    expect(new Set(plan.filter((visit) => visit.outlet.outletId === f4Outlet).map((visit) => visit.week))).toEqual(new Set(["W1", "W2", "W3", "W4"]));
  });

  it("uses sale-specific cluster day plans before cluster default days", () => {
    const customTerritories = [
      {
        salePhuTrach: "An Nguyễn",
        khuVucPhuTrach: ["Quận 1"],
        cumNhoPhuTrach: ["Q1-A"],
        saleBackup: "Bình Trần",
        ngayDiUuTien: ["Thứ 5"],
        lichTheoNgay: [{ dayName: "Thứ 5", clusterIds: ["Q1-A"] }],
        minVisitsPerDay: 6,
        maxVisitsPerDay: 15,
        ghiChu: "",
      },
    ];
    const outlet = { ...strongOutlet, doanhSo3Thang: 70_000_000, soDon3Thang: 6, tiemNang: 2, ruiRoMatKhach: 1 };
    const plan = generateMonthlyRoutePlan(5, 2026, [outlet], clusters, undefined, [], [], customTerritories);

    expect(plan.some((visit) => visit.dayName === "Thứ 5")).toBe(true);
  });

  it("auto-moves visits to nearby days when a sale reaches daily max", () => {
    const saleName = "Sale Max";
    const dayName = clusters[0].ngayDiCoDinh;
    const outlets = Array.from({ length: 16 }, (_, index) => ({
      ...strongOutlet,
      outletId: `MAX-${index}`,
      salePhuTrach: saleName,
      doanhSo3Thang: 260_000_000,
      soDon3Thang: 30,
      tiemNang: 4,
      ruiRoMatKhach: 4,
    }));
    const territories = [
      {
        salePhuTrach: saleName,
        khuVucPhuTrach: ["Quáº­n 1"],
        cumNhoPhuTrach: ["Q1-A"],
        saleBackup: "",
        ngayDiUuTien: [dayName],
        lichTheoNgay: [{ dayName, clusterIds: ["Q1-A"] }],
        minVisitsPerDay: 6,
        maxVisitsPerDay: 15,
        ghiChu: "",
      },
    ];
    const plan = generateMonthlyRoutePlan(5, 2026, outlets, clusters, undefined, [], [], territories);
    const weekOneVisits = plan.filter((visit) => visit.week === "W1" && visit.outlet.salePhuTrach === saleName && visit.status !== "CS từ xa");
    const countsByDate = new Map<string, number>();
    for (const visit of weekOneVisits) {
      countsByDate.set(visit.plannedDate, (countsByDate.get(visit.plannedDate) ?? 0) + 1);
    }

    expect(Math.max(...countsByDate.values())).toBeLessThanOrEqual(15);
    expect(new Set(weekOneVisits.map((visit) => visit.dayName)).size).toBeGreaterThan(1);
  });

  it("does not schedule visits on sale unavailable days", () => {
    const territory = {
      salePhuTrach: "Sale Off",
      khuVucPhuTrach: ["Quận 1"],
      cumNhoPhuTrach: ["Q1-A"],
      saleBackup: "",
      ngayDiUuTien: ["Thứ 2"],
      lichTheoNgay: [{ dayName: "Thứ 2", clusterIds: ["Q1-A"] }],
      minVisitsPerDay: 1,
      maxVisitsPerDay: 15,
      ghiChu: "",
    };
    const outlet: Outlet = {
      ...strongOutlet,
      outletId: "OFF-001",
      salePhuTrach: "Sale Off",
      ghiNhanF: "F1",
    };
    const plan = generateMonthlyRoutePlan(6, 2026, [outlet], clusters, undefined, [], [], [territory], [
      {
        id: "Sale Off-2026-06-01",
        salePhuTrach: "Sale Off",
        date: "2026-06-01",
        reason: "Nghỉ phép",
      },
    ]);

    expect(plan).toHaveLength(1);
    expect(plan[0].plannedDate).not.toBe("2026-06-01");
    expect(plan[0].warning).toContain("Tự dời");
  });

  it("builds carryover items from missed execution records and injects them into next month", () => {
    const plan = generateMonthlyRoutePlan(5, 2026, seedOutlets, clusters);
    const visit = plan.find((item) => item.frequency === "F4");
    expect(visit).toBeDefined();

    const records = upsertExecutionRecord([], visit!, {
      actualStatus: "Không gặp khách",
      note: "Khách đóng cửa",
      carryToNextMonth: true,
    });
    const carryovers = buildCarryoversForNextMonth(plan, records);
    const nextPlan = generateMonthlyRoutePlan(6, 2026, seedOutlets, clusters, undefined, carryovers);

    expect(carryovers).toHaveLength(1);
    expect(nextPlan.some((item) => item.isCarryover && item.outlet.outletId === visit!.outlet.outletId)).toBe(true);
  });

  it("prioritizes overdue F0.5 and F0.3 outlets from cumulative history", () => {
    const lowFrequencyOutlet: Outlet = {
      ...strongOutlet,
      outletId: "LOW-F05",
      doanhSo3Thang: 75_000_000,
      soDon3Thang: 6,
      tiemNang: 2,
      ruiRoMatKhach: 1,
      khoangCachTamCumKm: 8,
    };
    const records = [
      {
        visitId: "2026-3-W4-LOW-F05",
        outletId: "LOW-F05",
        month: 3,
        year: 2026,
        week: "W4" as const,
        clusterId: "Q1-A",
        salePhuTrach: "An Nguyễn",
        actualStatus: "Đã đi" as const,
        carryToNextMonth: false,
        updatedAt: "2026-03-28T00:00:00.000Z",
      },
    ];

    const carryovers = buildLowFrequencyHistoryCarryovers([lowFrequencyOutlet], records, 5, 2026);
    const plan = generateMonthlyRoutePlan(5, 2026, [lowFrequencyOutlet], clusters, undefined, carryovers);

    expect(carryovers).toHaveLength(1);
    expect(plan.filter((visit) => visit.outlet.outletId === "LOW-F05")).toHaveLength(1);
    expect(plan[0].isCarryover).toBe(true);
  });

  it("summarizeExecution reports completed and missed visits", () => {
    const plan = generateMonthlyRoutePlan(5, 2026, seedOutlets, clusters);
    const requiredVisits = plan.filter((visit) => visit.status !== "CS từ xa");
    const first = requiredVisits[0];
    const second = requiredVisits.find((visit) => visit.id !== first.id)!;
    const records = upsertExecutionRecord(upsertExecutionRecord([], first, { actualStatus: "Có đơn" }), second, { actualStatus: "Dời lịch" });
    const summary = summarizeExecution([first, second], records);

    expect(summary.completed).toBe(1);
    expect(summary.missed).toBe(1);
  });

  it("parses execution history csv into route execution records", () => {
    const csv = [
      "month,year,week,outletId,salePhuTrach,actualStatus,actualVisitDate,actualRevenue,note,carryToNextMonth",
      "5,2026,W1,OUT-011,Chi Lê,Dời lịch,,0,Khách hẹn lại,true",
    ].join("\n");
    const parsed = parseExecutionHistoryCsv(csv);

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.records[0]).toMatchObject({
      visitId: "2026-5-W1-OUT-011",
      actualStatus: "Dời lịch",
      carryToNextMonth: true,
    });
  });

  it("parses outlet csv without distance and auto-calculates distance from cluster center", () => {
    const csv = [
      "outletId,tenDiemBan,kenh,chuoi,tinhThanh,quanHuyen,phuongXa,diaChi,cumNho,salePhuTrach,doanhSo3Thang,soDon3Thang,tiemNang,ruiRoMatKhach,toaDoX,toaDoY,ghiChu",
      "CSV-X,Outlet X,GT,C2,TP.HCM,Quan 1,Ben Nghe,Test,Q1-A,Sale A,100000000,10,3,2,13,14,Auto distance",
    ].join("\n");
    const parsed = parseOutletCsv(csv, clusters);

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.outlets[0].khoangCachTamCumKm).toBe(5);
  });

  it("parses outlet csv numbers with thousands separators", () => {
    const csv = [
      "outletId,tenDiemBan,kenh,chuoi,tinhThanh,quanHuyen,phuongXa,diaChi,cumNho,salePhuTrach,doanhSo3Thang,soDon3Thang,tiemNang,ruiRoMatKhach,toaDoX,toaDoY,ghiChu",
      "CSV-N,Outlet N,MT,Watsons,TP.HCM,Quan 1,Ben Nghe,Test,Q1-A,Sale A,\"6,448,190.00\",1,2,5,106.701,10.78187,Number format",
    ].join("\n");
    const parsed = parseOutletCsv(csv, clusters);

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.outlets[0].doanhSo3Thang).toBe(6448190);
    expect(parsed.outlets[0].toaDoX).toBe(106.701);
  });

  it("parses imported ghiNhanF from outlet csv", () => {
    const csv = [
      "outletId,tenDiemBan,kenh,chuoi,tinhThanh,quanHuyen,phuongXa,diaChi,cumNho,salePhuTrach,doanhSo3Thang,soDon3Thang,tiemNang,ruiRoMatKhach,toaDoX,toaDoY,ghiNhanF,ghiChu",
      "CSV-F,Outlet F,MT,Watsons,TP.HCM,Quan 1,Ben Nghe,Test,Q1-A,Sale A,\"300,000,000\",36,5,5,10,11,F1,Use imported F",
    ].join("\n");
    const parsed = parseOutletCsv(csv, clusters);

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.outlets[0].ghiNhanF).toBe("F1");
    expect(calculateOutletScore(parsed.outlets[0]).frequency).toBe("F1");
  });

  it("covers every route cluster with a sales territory", () => {
    const unassigned = findUnassignedClusters(salesTerritories, clusters);
    const summary = summarizeTerritories(salesTerritories, seedOutlets, clusters);

    expect(unassigned).toHaveLength(0);
    expect(summary.every((territory) => territory.outletCount > 0)).toBe(true);
  });

  it("optimizeDailyRoute prioritizes frequency then follows cluster angle", () => {
    const cluster = clusters[0];
    const high = { ...strongOutlet, outletId: "HIGH", frequency: "F4" as const, totalScore: 95, monthlyVisits: 4, salesScore: 100, orderScore: 100, potentialScore: 100, distanceScore: 100, riskScore: 100, reason: "" };
    const low = { ...strongOutlet, outletId: "LOW", frequency: "F1" as const, totalScore: 45, monthlyVisits: 1, salesScore: 40, orderScore: 40, potentialScore: 40, distanceScore: 80, riskScore: 20, reason: "", toaDoX: 9, toaDoY: 9 };
    const ordered = optimizeDailyRoute([low, high], cluster);
    expect(ordered[0].outletId).toBe("HIGH");
  });
});
