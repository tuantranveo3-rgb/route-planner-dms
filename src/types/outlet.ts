export type Channel = "GT" | "MT";
export type Frequency = "F8" | "F4" | "F2" | "F1" | "F0.5" | "F0.3";

export interface Outlet {
  outletId: string;
  tenDiemBan: string;
  kenh: Channel;
  chuoi: string;
  tinhThanh: string;
  quanHuyen: string;
  phuongXa: string;
  diaChi: string;
  cumNho: string;
  salePhuTrach: string;
  doanhSo3Thang: number;
  soDon3Thang: number;
  tiemNang: number;
  ruiRoMatKhach: number;
  khoangCachTamCumKm: number;
  toaDoX: number;
  toaDoY: number;
  ghiNhanF?: Frequency;
  kyImport?: string;
  ghiChu: string;
}

export interface OutletScore {
  salesScore: number;
  orderScore: number;
  potentialScore: number;
  distanceScore: number;
  riskScore: number;
  totalScore: number;
  frequency: Frequency;
  monthlyVisits: number;
  reason: string;
}

export type EnrichedOutlet = Outlet & OutletScore;
