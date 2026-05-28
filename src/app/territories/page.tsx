import { DataTable, type Column } from "@/components/DataTable";
import { OverloadWarning } from "@/components/OverloadWarning";
import { PageHeader } from "@/components/PageHeader";
import { clusters, salesTerritories, seedOutlets } from "@/lib/seed-data";
import { findUnassignedClusters, summarizeTerritories } from "@/lib/territory-logic";

type TerritoryRow = ReturnType<typeof summarizeTerritories>[number];

const rows = summarizeTerritories(salesTerritories, seedOutlets, clusters);
const unassignedClusters = findUnassignedClusters(salesTerritories, clusters);

const columns: Column<TerritoryRow>[] = [
  {
    key: "sale",
    header: "Sale phụ trách",
    cell: (row) => (
      <div>
        <div className="font-bold">{row.salePhuTrach}</div>
        <div className="text-xs text-muted">Backup: {row.saleBackup}</div>
      </div>
    ),
  },
  { key: "districts", header: "Khu vực/quận", cell: (row) => row.khuVucPhuTrach.join(", ") },
  {
    key: "clusters",
    header: "Cụm nhỏ phụ trách",
    cell: (row) => (
      <div className="grid gap-1">
        {row.clusterNames.map((cluster) => (
          <span key={cluster}>{cluster}</span>
        ))}
      </div>
    ),
  },
  { key: "days", header: "Ngày ưu tiên", cell: (row) => row.ngayDiUuTien.join(", ") },
  { key: "outlets", header: "Số điểm bán", cell: (row) => <span className="font-bold">{row.outletCount}</span> },
  {
    key: "actual",
    header: "Kiểm tra dữ liệu",
    cell: (row) =>
      row.mismatchedOutletCount ? (
        <span className="text-amber-700">{row.mismatchedOutletCount} điểm không đúng sale vùng</span>
      ) : (
        <span className="text-emerald-700">Đúng vùng</span>
      ),
  },
  { key: "note", header: "Ghi chú vận hành", cell: (row) => <span className="text-slate-600">{row.ghiChu}</span> },
];

export default function TerritoriesPage() {
  return (
    <div>
      <PageHeader
        title="Phân vùng sale"
        description="Sale có thể phụ trách theo quận/khu vực, nhưng lịch tuyến vẫn phải chạy theo cụm nhỏ trong quận để tránh đi ziczac."
      />

      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <div className="font-bold">Nguyên tắc demo</div>
        <div>Mỗi sale có khu vực/quận phụ trách chính và sale backup. Trong khu vực đó, app vẫn chia tuyến theo cụm nhỏ như Q1-A, Q1-B, PN-A.</div>
        <div>Nếu sale nghỉ hoặc nhận chỉ đạo khác, ASM có thể dùng sale backup hoặc để Planner đưa điểm chưa đi sang tuyến bù tháng sau.</div>
      </div>

      <OverloadWarning
        title="Cụm chưa gán sale"
        items={unassignedClusters.map((cluster) => `${cluster.maCum} - ${cluster.tenCum} chưa có sale phụ trách.`)}
      />

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.salePhuTrach} />
      </div>
    </div>
  );
}
