import type { RouteCluster } from "@/types/cluster";
import type { Outlet } from "@/types/outlet";
import type { SalesTerritory } from "@/types/territory";

export const clusters: RouteCluster[] = [
  { maCum: "Q1-A", tenCum: "Bến Nghé - Bến Thành", quanHuyen: "Quận 1", danhSachPhuongXa: ["Bến Nghé", "Bến Thành"], ngayDiCoDinh: "Thứ 2", capacityNgay: 18, toaDoTamX: 10, toaDoTamY: 10 },
  { maCum: "Q1-B", tenCum: "Đa Kao - Tân Định", quanHuyen: "Quận 1", danhSachPhuongXa: ["Đa Kao", "Tân Định"], ngayDiCoDinh: "Thứ 3", capacityNgay: 18, toaDoTamX: 14, toaDoTamY: 12 },
  { maCum: "Q3-A", tenCum: "Võ Thị Sáu - P6 - P7", quanHuyen: "Quận 3", danhSachPhuongXa: ["Võ Thị Sáu", "Phường 6", "Phường 7"], ngayDiCoDinh: "Thứ 4", capacityNgay: 18, toaDoTamX: 18, toaDoTamY: 14 },
  { maCum: "PN-A", tenCum: "Phú Nhuận 1-2-7", quanHuyen: "Phú Nhuận", danhSachPhuongXa: ["Phường 1", "Phường 2", "Phường 7"], ngayDiCoDinh: "Thứ 5", capacityNgay: 18, toaDoTamX: 22, toaDoTamY: 18 },
  { maCum: "BT-A", tenCum: "Bình Thạnh 1-2-3", quanHuyen: "Bình Thạnh", danhSachPhuongXa: ["Phường 1", "Phường 2", "Phường 3"], ngayDiCoDinh: "Thứ 6", capacityNgay: 18, toaDoTamX: 26, toaDoTamY: 20 },
  { maCum: "GV-A", tenCum: "Gò Vấp 1-3-5", quanHuyen: "Gò Vấp", danhSachPhuongXa: ["Phường 1", "Phường 3", "Phường 5"], ngayDiCoDinh: "Thứ 7", capacityNgay: 18, toaDoTamX: 30, toaDoTamY: 26 },
  { maCum: "TB-A", tenCum: "Tân Bình 2-4-12", quanHuyen: "Tân Bình", danhSachPhuongXa: ["Phường 2", "Phường 4", "Phường 12"], ngayDiCoDinh: "Thứ 2", capacityNgay: 18, toaDoTamX: 32, toaDoTamY: 14 },
  { maCum: "TP-A", tenCum: "Sơn Kỳ - Tân Sơn Nhì - Tây Thạnh", quanHuyen: "Tân Phú", danhSachPhuongXa: ["Sơn Kỳ", "Tân Sơn Nhì", "Tây Thạnh"], ngayDiCoDinh: "Thứ 3", capacityNgay: 18, toaDoTamX: 36, toaDoTamY: 18 },
  { maCum: "BTA-A", tenCum: "An Lạc - Bình Trị Đông", quanHuyen: "Bình Tân", danhSachPhuongXa: ["An Lạc", "Bình Trị Đông"], ngayDiCoDinh: "Thứ 4", capacityNgay: 18, toaDoTamX: 40, toaDoTamY: 20 },
  { maCum: "TD-A", tenCum: "Linh Trung - Hiệp Bình Chánh - Thảo Điền", quanHuyen: "Thủ Đức", danhSachPhuongXa: ["Linh Trung", "Hiệp Bình Chánh", "Thảo Điền"], ngayDiCoDinh: "Thứ 5", capacityNgay: 18, toaDoTamX: 46, toaDoTamY: 24 },
];

const chains = ["Hasaki", "Guardian", "Watsons", "Coop", "Winmart", "C2 độc lập", "Nhà thuốc khu phố", "Minimart gia đình"];

export const salesTerritories: SalesTerritory[] = [
  {
    salePhuTrach: "An Nguyễn",
    khuVucPhuTrach: ["Quận 1"],
    cumNhoPhuTrach: ["Q1-A", "Q1-B"],
    saleBackup: "Bình Trần",
    ngayDiUuTien: ["Thứ 2", "Thứ 3"],
    minVisitsPerDay: 6,
    maxVisitsPerDay: 15,
    ghiChu: "Phụ trách lõi trung tâm, chia tuyến theo Q1-A/Q1-B.",
  },
  {
    salePhuTrach: "Bình Trần",
    khuVucPhuTrach: ["Quận 3", "Phú Nhuận"],
    cumNhoPhuTrach: ["Q3-A", "PN-A"],
    saleBackup: "An Nguyễn",
    ngayDiUuTien: ["Thứ 4", "Thứ 5"],
    minVisitsPerDay: 6,
    maxVisitsPerDay: 15,
    ghiChu: "Phụ trách cụm gần trung tâm, ưu tiên khách MT và C2 tăng trưởng.",
  },
  {
    salePhuTrach: "Chi Lê",
    khuVucPhuTrach: ["Bình Thạnh", "Gò Vấp", "Tân Bình"],
    cumNhoPhuTrach: ["BT-A", "GV-A", "TB-A"],
    saleBackup: "Dung Phạm",
    ngayDiUuTien: ["Thứ 2", "Thứ 6", "Thứ 7"],
    minVisitsPerDay: 7,
    maxVisitsPerDay: 14,
    ghiChu: "Khu vực rộng, cần theo dõi min/max sale/ngày.",
  },
  {
    salePhuTrach: "Dung Phạm",
    khuVucPhuTrach: ["Tân Phú", "Bình Tân", "Thủ Đức"],
    cumNhoPhuTrach: ["TP-A", "BTA-A", "TD-A"],
    saleBackup: "Chi Lê",
    ngayDiUuTien: ["Thứ 3", "Thứ 4", "Thứ 5"],
    minVisitsPerDay: 5,
    maxVisitsPerDay: 13,
    ghiChu: "Cụm xa tâm, F0.5 ưu tiên CS từ xa nếu quá tải.",
  },
];

const territoryByCluster = new Map(salesTerritories.flatMap((territory) => territory.cumNhoPhuTrach.map((clusterId) => [clusterId, territory.salePhuTrach])));

function profile(index: number) {
  const band = index % 10;
  if (band <= 1) return { sales: 260_000_000 + band * 35_000_000, orders: 32 + band * 4, potential: 5, risk: 4, distance: 1.4 + band * 0.5 };
  if (band <= 4) return { sales: 155_000_000 + band * 12_000_000, orders: 18 + band * 2, potential: 4, risk: 3, distance: 3 + band * 0.6 };
  if (band <= 7) return { sales: 78_000_000 + band * 5_500_000, orders: 8 + band, potential: 3, risk: 2, distance: 6 + band * 0.9 };
  return { sales: 18_000_000 + band * 3_500_000, orders: 2 + band, potential: 1 + (band % 2), risk: 1, distance: 17 + band * 2 };
}

export function buildSeedOutlets(): Outlet[] {
  const outlets: Outlet[] = [];

  clusters.forEach((cluster, clusterIndex) => {
    for (let i = 0; i < 11; i += 1) {
      const globalIndex = clusterIndex * 11 + i;
      const p = profile(globalIndex);
      const phuongXa = cluster.danhSachPhuongXa[i % cluster.danhSachPhuongXa.length];
      const chain = chains[globalIndex % chains.length];
      const angle = (Math.PI * 2 * i) / 11;
      const radius = 1.2 + (i % 5) * 0.9;

      outlets.push({
        outletId: `OUT-${String(globalIndex + 1).padStart(3, "0")}`,
        tenDiemBan: `${chain} ${phuongXa} ${globalIndex + 1}`,
        kenh: chain.includes("C2") || chain.includes("Nhà thuốc") || chain.includes("Minimart") ? "GT" : "MT",
        chuoi: chain,
        tinhThanh: "TP.HCM",
        quanHuyen: cluster.quanHuyen,
        phuongXa,
        diaChi: `${12 + i} đường ${cluster.tenCum}`,
        cumNho: cluster.maCum,
        salePhuTrach: territoryByCluster.get(cluster.maCum) ?? salesTerritories[globalIndex % salesTerritories.length].salePhuTrach,
        doanhSo3Thang: p.sales,
        soDon3Thang: p.orders,
        tiemNang: p.potential,
        ruiRoMatKhach: p.risk,
        khoangCachTamCumKm: p.distance,
        toaDoX: Number((cluster.toaDoTamX + Math.cos(angle) * radius).toFixed(2)),
        toaDoY: Number((cluster.toaDoTamY + Math.sin(angle) * radius).toFixed(2)),
        ghiChu: globalIndex % 6 === 0 ? "Ưu tiên trưng bày, có đối thủ bám sát" : "Theo dõi định kỳ",
      });
    }
  });

  return outlets;
}

export const seedOutlets = buildSeedOutlets();
export const saleOwners = [...new Set(seedOutlets.map((outlet) => outlet.salePhuTrach))];
