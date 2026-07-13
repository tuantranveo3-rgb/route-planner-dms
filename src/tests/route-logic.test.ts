import { describe, expect, it } from "vitest";
import { clusters, salesTerritories, seedOutlets } from "@/lib/seed-data";
import { findUnassignedClusters, summarizeTerritories } from "@/lib/territory-logic";
import { buildImportedClusters, parseExecutionHistoryCsv, parseOutletCsv } from "@/lib/csv";
import { buildCarryoversForNextMonth, buildLowFrequencyHistoryCarryovers, summarizeExecution, upsertExecutionRecord } from "@/lib/route-execution";
import {
  assignFrequency,
  calculateMonthlyVisits,
  calculateDistanceScore,
  calculateOutletScore,
  generateMonthlyRoutePlan,
  optimizeDailyRoute,
} from "@/lib/route-logic";
import type { RouteCluster } from "@/types/cluster";
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

  it("calculateDistanceScore starts from zero for very far outlets", () => {
    expect(calculateDistanceScore(21)).toBe(0);
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
    const outlet = { ...strongOutlet, doanhSo3Thang: 70_000_000, soDon3Thang: 6, tiemNang: 2, ruiRoMatKhach: 1, ghiNhanF: "F1" as const };
    const plan = generateMonthlyRoutePlan(5, 2026, [outlet], clusters, undefined, [], [], customTerritories);

    expect(plan.some((visit) => visit.dayName === "Thứ 5")).toBe(true);
  });

  it("does not overfill a sale day when only one priority day is configured", () => {
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
    const weekOneVisits = plan.filter((visit) => visit.week === "W1" && visit.outlet.salePhuTrach === saleName && !visit.status.startsWith("CS"));
    const countsByDate = new Map<string, number>();
    for (const visit of weekOneVisits) {
      countsByDate.set(visit.plannedDate, (countsByDate.get(visit.plannedDate) ?? 0) + 1);
    }

    expect(Math.max(...countsByDate.values())).toBeLessThanOrEqual(15);
    expect(plan.some((visit) => visit.status.startsWith("CS") && visit.warning?.includes("max"))).toBe(true);
  });

  it("does not mix distant clusters into one sale day route", () => {
    const saleName = "Sale Far";
    const outlets: Outlet[] = [
      { ...strongOutlet, outletId: "FAR-Q1", cumNho: "Q1-A", salePhuTrach: saleName, ghiNhanF: "F1" },
      { ...strongOutlet, outletId: "FAR-TD", cumNho: "TD-A", salePhuTrach: saleName, ghiNhanF: "F1" },
    ];
    const territories = [
      {
        salePhuTrach: saleName,
        khuVucPhuTrach: ["Quan 1", "Thu Duc"],
        cumNhoPhuTrach: ["Q1-A", "TD-A"],
        saleBackup: "",
        ngayDiUuTien: ["Thứ 2"],
        lichTheoNgay: [{ dayName: "Thứ 2", clusterIds: ["Q1-A", "TD-A"] }],
        minVisitsPerDay: 1,
        maxVisitsPerDay: 15,
        ghiChu: "",
      },
    ];
    const plan = generateMonthlyRoutePlan(7, 2026, outlets, clusters, undefined, [], [], territories);
    const directClustersByDate = new Map<string, Set<string>>();

    for (const visit of plan.filter((item) => !item.status.startsWith("CS"))) {
      const key = `${visit.plannedDate}-${visit.outlet.salePhuTrach}`;
      directClustersByDate.set(key, new Set([...(directClustersByDate.get(key) ?? []), visit.clusterId]));
    }

    expect([...directClustersByDate.values()].every((clusterIds) => clusterIds.size === 1)).toBe(true);
    expect(plan.some((visit) => visit.status.startsWith("CS") && visit.warning?.includes("quá xa"))).toBe(true);
  });

  it("keeps real-coordinate clusters apart when they are several kilometers away", () => {
    const saleName = "Sale Real Distance";
    const realClusters: RouteCluster[] = [
      { maCum: "REAL-A", tenCum: "Khu A", quanHuyen: "Phú Nhuận", danhSachPhuongXa: ["A"], ngayDiCoDinh: "Thứ 2", capacityNgay: 18, toaDoTamX: 106.66, toaDoTamY: 10.8 },
      { maCum: "REAL-B", tenCum: "Khu B", quanHuyen: "Bình Thạnh", danhSachPhuongXa: ["B"], ngayDiCoDinh: "Thứ 2", capacityNgay: 18, toaDoTamX: 106.69, toaDoTamY: 10.81 },
    ];
    const outlets: Outlet[] = [
      { ...strongOutlet, outletId: "REAL-A-1", cumNho: "REAL-A", salePhuTrach: saleName, ghiNhanF: "F1", toaDoX: 106.6605, toaDoY: 10.8005 },
      { ...strongOutlet, outletId: "REAL-B-1", cumNho: "REAL-B", salePhuTrach: saleName, ghiNhanF: "F1", toaDoX: 106.6905, toaDoY: 10.8105 },
    ];
    const territories = [
      {
        salePhuTrach: saleName,
        khuVucPhuTrach: ["Phu Nhuan", "Binh Thanh"],
        cumNhoPhuTrach: ["REAL-A", "REAL-B"],
        saleBackup: "",
        ngayDiUuTien: ["Thứ 2"],
        lichTheoNgay: [{ dayName: "Thứ 2", clusterIds: ["REAL-A", "REAL-B"] }],
        minVisitsPerDay: 1,
        maxVisitsPerDay: 15,
        ghiChu: "",
      },
    ];
    const plan = generateMonthlyRoutePlan(7, 2026, outlets, realClusters, undefined, [], [], territories);
    const directVisits = plan.filter((visit) => !visit.status.startsWith("CS"));

    expect(new Set(directVisits.map((visit) => `${visit.plannedDate}-${visit.outlet.salePhuTrach}-${visit.clusterId}`)).size).toBe(1);
    expect(plan.some((visit) => visit.status.startsWith("CS") && visit.warning?.includes("quá xa"))).toBe(true);
  });

  it("assigns a unique daily route order for each sale day while keeping cluster assignment", () => {
    const outlets: Outlet[] = [
      { ...strongOutlet, outletId: "CL-A-1", cumNho: "Q1-A", salePhuTrach: "Sale Cluster", ghiNhanF: "F4", toaDoX: 106.7001, toaDoY: 10.781 },
      { ...strongOutlet, outletId: "CL-A-2", cumNho: "Q1-A", salePhuTrach: "Sale Cluster", ghiNhanF: "F4", toaDoX: 106.7005, toaDoY: 10.782 },
      { ...strongOutlet, outletId: "CL-B-1", cumNho: "Q1-B", salePhuTrach: "Sale Cluster", ghiNhanF: "F4", toaDoX: 106.6901, toaDoY: 10.791 },
      { ...strongOutlet, outletId: "CL-B-2", cumNho: "Q1-B", salePhuTrach: "Sale Cluster", ghiNhanF: "F4", toaDoX: 106.6905, toaDoY: 10.792 },
    ];
    const territories = [
      {
        salePhuTrach: "Sale Cluster",
        khuVucPhuTrach: ["Quan 1"],
        cumNhoPhuTrach: ["Q1-A", "Q1-B"],
        saleBackup: "",
        ngayDiUuTien: ["Thứ 2"],
        lichTheoNgay: [{ dayName: "Thứ 2", clusterIds: ["Q1-A", "Q1-B"] }],
        minVisitsPerDay: 1,
        maxVisitsPerDay: 15,
        ghiChu: "",
      },
    ];
    const plan = generateMonthlyRoutePlan(7, 2026, outlets, clusters, undefined, [], [], territories);
    const weekOne = plan.filter((visit) => visit.week === "W1" && !visit.status.startsWith("CS"));
    const orders = weekOne.map((visit) => visit.routeOrder).sort((a, b) => a - b);
    const clusterIds = new Set(weekOne.map((visit) => visit.clusterId));
    const dayByCluster = new Map(weekOne.map((visit) => [visit.clusterId, visit.dayName]));

    expect(orders).toEqual([1, 2, 3, 4]);
    expect(clusterIds).toEqual(new Set(["Q1-A", "Q1-B"]));
    expect(dayByCluster.get("Q1-A")).toBe("Thứ 2");
    expect(dayByCluster.get("Q1-B")).toBe("Thứ 2");
  });

  it("orders a daily route from start point to the nearest next outlet without closing a loop", () => {
    const outlets: Outlet[] = [
      { ...strongOutlet, outletId: "ROUTE-FAR", tenDiemBan: "Far", salePhuTrach: "Sale Start", ghiNhanF: "F4", toaDoX: 10, toaDoY: 0 },
      { ...strongOutlet, outletId: "ROUTE-NEAR", tenDiemBan: "Near", salePhuTrach: "Sale Start", ghiNhanF: "F4", toaDoX: 1, toaDoY: 0 },
      { ...strongOutlet, outletId: "ROUTE-MID", tenDiemBan: "Mid", salePhuTrach: "Sale Start", ghiNhanF: "F4", toaDoX: 2, toaDoY: 0 },
    ];
    const plan = generateMonthlyRoutePlan(7, 2026, outlets, clusters, undefined, [], [
      {
        salePhuTrach: "Sale Start",
        tenDiemXuatPhat: "Van phong",
        loaiDiem: "Văn phòng",
        toaDoX: 0,
        toaDoY: 0,
        ghiChu: "",
      },
    ]);
    const weekOne = plan.filter((visit) => visit.week === "W1" && !visit.status.startsWith("CS")).sort((a, b) => a.routeOrder - b.routeOrder);

    expect(weekOne.map((visit) => visit.outlet.outletId)).toEqual(["ROUTE-NEAR", "ROUTE-MID", "ROUTE-FAR"]);
  });

  it("smooths a zigzag daily route after the nearest-neighbor draft", () => {
    const routePoints = [
      { outletId: "SMOOTH-1", toaDoX: 0, toaDoY: 6 },
      { outletId: "SMOOTH-2", toaDoX: 4, toaDoY: 4 },
      { outletId: "SMOOTH-3", toaDoX: 4, toaDoY: 9 },
      { outletId: "SMOOTH-4", toaDoX: 3, toaDoY: 3 },
      { outletId: "SMOOTH-5", toaDoX: 3, toaDoY: 2 },
      { outletId: "SMOOTH-6", toaDoX: 4, toaDoY: 0 },
    ];
    const outlets: Outlet[] = routePoints.map((point) => ({
      ...strongOutlet,
      ...point,
      salePhuTrach: "Sale Smooth",
      ghiNhanF: "F4",
    }));
    const plan = generateMonthlyRoutePlan(7, 2026, outlets, clusters, undefined, [], [
      {
        salePhuTrach: "Sale Smooth",
        tenDiemXuatPhat: "Van phong",
        loaiDiem: "Văn phòng",
        toaDoX: 0,
        toaDoY: 0,
        ghiChu: "",
      },
    ]);
    const weekOne = plan.filter((visit) => visit.week === "W1" && !visit.status.startsWith("CS")).sort((a, b) => a.routeOrder - b.routeOrder);

    expect(weekOne.map((visit) => visit.outlet.outletId)).toEqual(["SMOOTH-6", "SMOOTH-5", "SMOOTH-4", "SMOOTH-2", "SMOOTH-1", "SMOOTH-3"]);
  });

  it("auto-spreads imported sale clusters when no territory day plan exists", () => {
    const outlets: Outlet[] = [
      { ...strongOutlet, outletId: "AUTO-A", cumNho: "Q1-A", salePhuTrach: "Sale Import", ghiNhanF: "F1" },
      { ...strongOutlet, outletId: "AUTO-B", cumNho: "TB-A", salePhuTrach: "Sale Import", ghiNhanF: "F1" },
    ];
    const plan = generateMonthlyRoutePlan(7, 2026, outlets, clusters);
    const dayByCluster = new Map(plan.map((visit) => [visit.clusterId, visit.dayName]));

    expect(dayByCluster.get("Q1-A")).toBe("Thứ 2");
    expect(dayByCluster.get("TB-A")).toBe("Thứ 3");
  });

  it("auto-creates two weekly days for F8 clusters when no priority day exists", () => {
    const outlet: Outlet = { ...strongOutlet, outletId: "AUTO-F8", cumNho: "GV-A", salePhuTrach: "Sale Auto F8", ghiNhanF: "F8" };
    const plan = generateMonthlyRoutePlan(7, 2026, [outlet], clusters);
    const realVisits = plan.filter((visit) => !visit.status.startsWith("CS"));

    expect(realVisits).toHaveLength(8);
    expect(new Set(realVisits.map((visit) => visit.dayName)).size).toBe(2);
    expect(new Set(realVisits.map((visit) => visit.clusterId))).toEqual(new Set(["GV-A"]));
  });

  it("keeps the first valid day when the same cluster is selected on many days", () => {
    const outlets: Outlet[] = [
      { ...strongOutlet, outletId: "DUP-A", cumNho: "Q1-A", salePhuTrach: "Sale Duplicate", ghiNhanF: "F1" },
      { ...strongOutlet, outletId: "DUP-B", cumNho: "Q1-B", salePhuTrach: "Sale Duplicate", ghiNhanF: "F1" },
    ];
    const territories = [
      {
        salePhuTrach: "Sale Duplicate",
        khuVucPhuTrach: ["Quan 1"],
        cumNhoPhuTrach: ["Q1-A", "Q1-B"],
        saleBackup: "",
        ngayDiUuTien: ["Thứ 2"],
        lichTheoNgay: [
          { dayName: "Thứ 2", clusterIds: ["Q1-A", "Q1-B"] },
          { dayName: "Thứ 3", clusterIds: ["Q1-A", "Q1-B"] },
        ],
        minVisitsPerDay: 1,
        maxVisitsPerDay: 15,
        ghiChu: "",
      },
    ];
    const plan = generateMonthlyRoutePlan(7, 2026, outlets, clusters, undefined, [], [], territories);
    const dayByCluster = new Map(plan.map((visit) => [visit.clusterId, visit.dayName]));

    expect(dayByCluster.get("Q1-A")).toBe("Thứ 2");
    expect(dayByCluster.get("Q1-B")).toBe("Thứ 2");
  });

  it("uses sale daily territory plan as priority days without dropping other assigned clusters", () => {
    const outlets: Outlet[] = [
      { ...strongOutlet, outletId: "IN-PLAN", cumNho: "GV-A", quanHuyen: "Gò Vấp", salePhuTrach: "Sale Strict", ghiNhanF: "F1" },
      { ...strongOutlet, outletId: "OUT-PLAN", cumNho: "BT-A", quanHuyen: "Bình Thạnh", salePhuTrach: "Sale Strict", ghiNhanF: "F1" },
    ];
    const territories = [
      {
        salePhuTrach: "Sale Strict",
        khuVucPhuTrach: ["Bình Thạnh", "Gò Vấp"],
        cumNhoPhuTrach: ["BT-A", "GV-A"],
        saleBackup: "",
        ngayDiUuTien: ["Thứ 2"],
        lichTheoNgay: [{ dayName: "Thứ 2", clusterIds: ["GV-A"] }],
        minVisitsPerDay: 1,
        maxVisitsPerDay: 15,
        ghiChu: "",
      },
    ];
    const plan = generateMonthlyRoutePlan(7, 2026, outlets, clusters, undefined, [], [], territories);

    expect(plan.map((visit) => visit.outlet.outletId).sort()).toEqual(["IN-PLAN", "OUT-PLAN"]);
    expect(plan[0].dayName).toBe("Thứ 2");
  });

  it("keeps F8 inside the same cluster days and warns when the second weekly slot is missing", () => {
    const outlet: Outlet = { ...strongOutlet, outletId: "F8-GV", cumNho: "GV-A", salePhuTrach: "Sale F8", ghiNhanF: "F8" };
    const oneDayTerritory = {
      salePhuTrach: "Sale F8",
      khuVucPhuTrach: ["Go Vap"],
      cumNhoPhuTrach: ["GV-A"],
      saleBackup: "",
      ngayDiUuTien: ["Thứ 2"],
      lichTheoNgay: [{ dayName: "Thứ 2", clusterIds: ["GV-A"] }],
      minVisitsPerDay: 1,
      maxVisitsPerDay: 15,
      ghiChu: "",
    };
    const twoDayTerritory = {
      ...oneDayTerritory,
      lichTheoNgay: [
        { dayName: "Thứ 2", clusterIds: ["GV-A"] },
        { dayName: "Thứ 5", clusterIds: ["GV-A"] },
      ],
    };
    const oneDayPlan = generateMonthlyRoutePlan(7, 2026, [outlet], clusters, undefined, [], [], [oneDayTerritory]);
    const twoDayPlan = generateMonthlyRoutePlan(7, 2026, [outlet], clusters, undefined, [], [], [twoDayTerritory]);

    expect(oneDayPlan.filter((visit) => !visit.status.startsWith("CS"))).toHaveLength(4);
    expect(oneDayPlan.some((visit) => visit.warning?.includes("F8 cần 2 ngày/tuần"))).toBe(true);
    expect(twoDayPlan.filter((visit) => !visit.status.startsWith("CS"))).toHaveLength(8);
    expect(new Set(twoDayPlan.map((visit) => visit.dayName))).toEqual(new Set(["Thứ 2", "Thứ 5"]));
  });

  it("does not force a real route when the only priority day is unavailable", () => {
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
    expect(plan[0].status.startsWith("CS")).toBe(true);
    expect(plan[0].warning).toContain("không đi tuyến");
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

  it("keeps F0.5 and F0.3 visible as remote follow-up when the month is not due", () => {
    const lowOutlet: Outlet = { ...strongOutlet, outletId: "LOW-VISIBLE", ghiNhanF: "F0.3", salePhuTrach: "Sale Low" };
    const monthlyPlans = Array.from({ length: 12 }, (_, index) => generateMonthlyRoutePlan(index + 1, 2026, [lowOutlet], clusters));
    const remoteMonth = monthlyPlans.find((plan) => plan.some((visit) => visit.status.startsWith("CS")));

    expect(remoteMonth).toBeDefined();
    expect(remoteMonth?.[0].frequency).toBe("F0.3");
    expect(remoteMonth?.[0].warning).toContain("chưa tới chu kỳ");
  });

  it("summarizeExecution reports completed and missed visits", () => {
    const plan = generateMonthlyRoutePlan(5, 2026, seedOutlets, clusters);
    const requiredVisits = plan.filter((visit) => !visit.status.startsWith("CS"));
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

  it("accepts common Vietnamese outlet csv header aliases", () => {
    const csv = [
      "ma diem ban,ten diem ban,kenh,chuoi,thanh pho,quan,phuong,dia chi,ma cum,sale,DS 3 thang,So don 3 thang,tiem nang,rui ro,kinh do,vi do,ghi chu",
      "CSV-Alias,Outlet Alias,GT,C2,TP.HCM,Quan 1,Ben Nghe,Test,Q1-A,Sale A,\"6,448,190.00\",2,3,4,106.701,10.78187,Alias header",
    ].join("\n");
    const parsed = parseOutletCsv(csv, clusters);

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.outlets[0].outletId).toBe("CSV-Alias");
    expect(parsed.outlets[0].doanhSo3Thang).toBe(6448190);
    expect(parsed.outlets[0].soDon3Thang).toBe(2);
  });

  it("normalizes cluster ids and accepts imported clusters that are not seeded", () => {
    const csv = [
      "outletId,tenDiemBan,kenh,chuoi,tinhThanh,quanHuyen,phuongXa,diaChi,cumNho,salePhuTrach,doanhSo3Thang,soDon3Thang,tiemNang,ruiRoMatKhach,toaDoX,toaDoY,ghiChu",
      "CSV-New-1,Outlet New 1,GT,C2,TP.HCM,Quan Moi,Phuong 1,Test,Q1 - B,Sale A,100000000,5,3,2,106.7,10.7,New cluster",
      "CSV-New-2,Outlet New 2,GT,C2,TP.HCM,Quan Moi,Phuong 2,Test,TEL - B,Sale A,100000000,5,3,2,106.8,10.8,New cluster",
    ].join("\n");
    const parsed = parseOutletCsv(csv, []);
    const importedClusters = buildImportedClusters(parsed.outlets, []);

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.outlets.map((outlet) => outlet.cumNho)).toEqual(["Q1-B", "TEL-B"]);
    expect(parsed.outlets.every((outlet) => !Number.isNaN(outlet.khoangCachTamCumKm))).toBe(true);
    expect(importedClusters.map((cluster) => cluster.maCum)).toEqual(["Q1-B", "TEL-B"]);
  });

  it("normalizes imported Vietnam coordinates when latitude and longitude are swapped", () => {
    const csv = [
      "outletId,tenDiemBan,kenh,chuoi,tinhThanh,quanHuyen,phuongXa,diaChi,cumNho,salePhuTrach,doanhSo3Thang,soDon3Thang,tiemNang,ruiRoMatKhach,toaDoX,toaDoY,ghiChu",
      "CSV-Swap,Outlet Swap,GT,C2,TP.HCM,Quan 1,Ben Nghe,Test,Q1-A,Sale A,100000000,5,3,2,10.78187,106.701,Swapped lat lng",
    ].join("\n");
    const parsed = parseOutletCsv(csv, clusters);

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.outlets[0].toaDoX).toBe(106.701);
    expect(parsed.outlets[0].toaDoY).toBe(10.78187);
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
