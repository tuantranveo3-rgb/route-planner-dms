import { DataTable, type Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { clusters, seedOutlets } from "@/lib/seed-data";
import type { RouteCluster } from "@/types/cluster";

const columns: Column<RouteCluster>[] = [
  { key: "id", header: "Mã cụm", cell: (row) => <span className="font-bold">{row.maCum}</span> },
  { key: "name", header: "Tên cụm nhỏ", cell: (row) => row.tenCum },
  { key: "district", header: "Quận/Huyện", cell: (row) => row.quanHuyen },
  { key: "wards", header: "Phường/Xã trong cụm", cell: (row) => row.danhSachPhuongXa.join(", ") },
  { key: "day", header: "Ngày đi cố định", cell: (row) => row.ngayDiCoDinh },
  { key: "capacity", header: "Capacity/ngày", cell: (row) => `${row.capacityNgay} điểm` },
  { key: "center", header: "Tâm cụm", cell: (row) => `X ${row.toaDoTamX}, Y ${row.toaDoTamY}` },
  { key: "count", header: "Số điểm bán", cell: (row) => seedOutlets.filter((outlet) => outlet.cumNho === row.maCum).length },
];

export default function ClustersPage() {
  return (
    <div>
      <PageHeader
        title="Cụm tuyến"
        description="Cụm tuyến là đơn vị lập lịch chính. App không gom tuyến theo quận/huyện lớn mà dùng cụm nhỏ phường/xã/cụm đường để sale đi cùng hướng."
      />
      <DataTable columns={columns} rows={clusters} rowKey={(row) => row.maCum} />
    </div>
  );
}
