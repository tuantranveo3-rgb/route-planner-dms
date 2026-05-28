import type { EnrichedOutlet, Frequency } from "./outlet";

export type WeekKey = "W1" | "W2" | "W3" | "W4";
export type VisitStatus = "Chưa đi" | "Đã đi" | "Có đơn" | "Không có đơn" | "Không gặp khách" | "Dời lịch" | "CS từ xa";

export interface PlannerSettings {
  weights: {
    sales: number;
    orders: number;
    potential: number;
    distance: number;
    risk: number;
  };
  defaultDailyCapacity: number;
  minVisitsPerSaleDay: number;
  maxVisitsPerSaleDay: number;
  workingDaysPerMonth: number;
}

export interface RouteVisit {
  id: string;
  month: number;
  year: number;
  week: WeekKey;
  dayName: string;
  clusterId: string;
  clusterName: string;
  routeOrder: number;
  outlet: EnrichedOutlet;
  frequency: Frequency;
  status: VisitStatus;
  warning?: string;
  priorityReason: string;
  isCarryover?: boolean;
  carryoverReason?: string;
  sourceVisitId?: string;
}

export interface RouteExecutionRecord {
  visitId: string;
  outletId: string;
  month: number;
  year: number;
  week: WeekKey;
  clusterId: string;
  salePhuTrach: string;
  actualStatus: VisitStatus;
  actualVisitDate?: string;
  actualRevenue?: number;
  note?: string;
  carryToNextMonth: boolean;
  updatedAt: string;
}

export interface CarryoverVisit {
  outletId: string;
  sourceVisitId: string;
  sourceMonth: number;
  sourceYear: number;
  sourceWeek: WeekKey;
  reason: string;
}
