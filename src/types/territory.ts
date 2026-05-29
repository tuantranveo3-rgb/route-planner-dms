export interface SaleDayClusterPlan {
  dayName: string;
  clusterIds: string[];
}

export interface SalesTerritory {
  salePhuTrach: string;
  khuVucPhuTrach: string[];
  cumNhoPhuTrach: string[];
  saleBackup: string;
  ngayDiUuTien: string[];
  lichTheoNgay: SaleDayClusterPlan[];
  minVisitsPerDay: number;
  maxVisitsPerDay: number;
  ghiChu: string;
}
