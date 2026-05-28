import { describe, expect, it } from "vitest";
import { clusters, salesTerritories, seedOutlets } from "@/lib/seed-data";
import { findUnassignedClusters, summarizeTerritories } from "@/lib/territory-logic";
import { parseExecutionHistoryCsv } from "@/lib/csv";
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

  it("generateMonthlyRoutePlan creates non-empty weekly plan with F4 locked in all weeks", () => {
    const plan = generateMonthlyRoutePlan(5, 2026, seedOutlets, clusters);
    const f4Outlet = plan.find((visit) => visit.frequency === "F4")?.outlet.outletId;
    expect(plan.length).toBeGreaterThan(0);
    expect(new Set(plan.filter((visit) => visit.outlet.outletId === f4Outlet).map((visit) => visit.week))).toEqual(new Set(["W1", "W2", "W3", "W4"]));
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
    const first = plan[0];
    const second = plan[1];
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
