"use client";

import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { PageHeader } from "@/components/PageHeader";
import { formatNumber } from "@/lib/format";
import { enrichOutlets } from "@/lib/route-logic";
import { seedOutlets } from "@/lib/seed-data";
import type { EnrichedOutlet, Frequency } from "@/types/outlet";

export default function OutletsPage() {
  const [search, setSearch] = useState("");
  const [frequency, setFrequency] = useState<"all" | Frequency>("all");
  const outlets = useMemo(() => enrichOutlets(seedOutlets), []);
  const rows = outlets.filter((outlet) => {
    const matchesSearch = `${outlet.tenDiemBan} ${outlet.outletId} ${outlet.cumNho} ${outlet.salePhuTrach}`.toLowerCase().includes(search.toLowerCase());
    const matchesFrequency = frequency === "all" || outlet.frequency === frequency;
    return matchesSearch && matchesFrequency;
  });

  const columns: Column<EnrichedOutlet>[] = [
    { key: "outlet", header: "Điểm bán", cell: (row) => <div><div className="font-bold">{row.tenDiemBan}</div><div className="text-xs text-muted">{row.outletId} · {row.salePhuTrach}</div></div> },
    { key: "channel", header: "Kênh/Chuỗi", cell: (row) => <div>{row.kenh}<div className="text-xs text-muted">{row.chuoi}</div></div> },
    { key: "area", header: "Khu vực", cell: (row) => <div>{row.quanHuyen}<div className="text-xs text-muted">{row.phuongXa} · {row.cumNho}</div></div> },
    { key: "sales", header: "Điểm DS", cell: (row) => row.salesScore },
    { key: "orders", header: "Điểm đơn", cell: (row) => row.orderScore },
    { key: "potential", header: "Tiềm năng", cell: (row) => row.potentialScore },
    { key: "distance", header: "Khoảng cách", cell: (row) => row.distanceScore },
    { key: "risk", header: "Rủi ro", cell: (row) => row.riskScore },
    { key: "total", header: "Tổng điểm", cell: (row) => <span className="font-bold">{row.totalScore}</span> },
    { key: "frequency", header: "F đề xuất", cell: (row) => <FrequencyBadge frequency={row.frequency} /> },
    { key: "visits", header: "Lượt/tháng", cell: (row) => formatNumber(row.monthlyVisits) },
    { key: "reason", header: "Lý do", cell: (row) => <span className="text-sm text-slate-600">{row.reason}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Quản lý điểm bán"
        description="Danh sách điểm bán được chấm điểm theo doanh số, số đơn, tiềm năng, khoảng cách tâm cụm và rủi ro. F đề xuất sinh tự động từ tổng điểm."
      />
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-line bg-white p-4 shadow-soft md:flex-row">
        <input
          className="h-10 flex-1 rounded-md border border-line px-3 text-sm"
          placeholder="Tìm outletId, tên điểm bán, cụm nhỏ, sale..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={frequency} onChange={(event) => setFrequency(event.target.value as "all" | Frequency)}>
          <option value="all">Tất cả F</option>
          <option value="F8">F8</option>
          <option value="F4">F4</option>
          <option value="F2">F2</option>
          <option value="F1">F1</option>
          <option value="F0.5">F0.5</option>
          <option value="F0.3">F0.3</option>
        </select>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.outletId} />
    </div>
  );
}
