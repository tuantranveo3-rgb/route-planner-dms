"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { OverloadWarning } from "@/components/OverloadWarning";
import { PageHeader } from "@/components/PageHeader";
import { clusters, seedOutlets } from "@/lib/seed-data";
import { loadSalesConfig, saveSalesConfig } from "@/lib/sales-config";
import { findUnassignedClusters, summarizeTerritories } from "@/lib/territory-logic";
import type { SalesTerritory } from "@/types/territory";

type TerritoryRow = ReturnType<typeof summarizeTerritories>[number];

export default function TerritoriesPage() {
  const [config, setConfig] = useState<SalesTerritory[]>([]);

  useEffect(() => {
    setConfig(loadSalesConfig());
  }, []);

  useEffect(() => {
    if (config.length) saveSalesConfig(config);
  }, [config]);

  const rows = useMemo(() => summarizeTerritories(config, seedOutlets, clusters), [config]);
  const unassignedClusters = useMemo(() => findUnassignedClusters(config, clusters), [config]);

  function updateSale(index: number, patch: Partial<SalesTerritory>) {
    setConfig((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function parseList(value: string) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

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
    {
      key: "districts",
      header: "Khu vực/quận",
      cell: (row) => {
        const index = config.findIndex((item) => item.salePhuTrach === row.salePhuTrach);
        return (
          <input
            className="h-9 min-w-56 rounded-md border border-line px-2 text-sm"
            value={row.khuVucPhuTrach.join(", ")}
            onChange={(event) => updateSale(index, { khuVucPhuTrach: parseList(event.target.value) })}
          />
        );
      },
    },
    {
      key: "clusters",
      header: "Cụm nhỏ phụ trách",
      cell: (row) => {
        const index = config.findIndex((item) => item.salePhuTrach === row.salePhuTrach);
        return (
          <input
            className="h-9 min-w-72 rounded-md border border-line px-2 text-sm"
            value={row.cumNhoPhuTrach.join(", ")}
            onChange={(event) => updateSale(index, { cumNhoPhuTrach: parseList(event.target.value) })}
          />
        );
      },
    },
    {
      key: "limits",
      header: "Min/Max ngày",
      cell: (row) => {
        const index = config.findIndex((item) => item.salePhuTrach === row.salePhuTrach);
        return (
          <div className="flex min-w-36 gap-2">
            <input
              className="h-9 w-16 rounded-md border border-line px-2 text-sm"
              type="number"
              min={0}
              value={row.minVisitsPerDay}
              onChange={(event) => updateSale(index, { minVisitsPerDay: Number(event.target.value) })}
            />
            <input
              className="h-9 w-16 rounded-md border border-line px-2 text-sm"
              type="number"
              min={1}
              value={row.maxVisitsPerDay}
              onChange={(event) => updateSale(index, { maxVisitsPerDay: Number(event.target.value) })}
            />
          </div>
        );
      },
    },
    {
      key: "backup",
      header: "Backup/Ngày ưu tiên",
      cell: (row) => {
        const index = config.findIndex((item) => item.salePhuTrach === row.salePhuTrach);
        return (
          <div className="grid min-w-52 gap-2">
            <input className="h-9 rounded-md border border-line px-2 text-sm" value={row.saleBackup} onChange={(event) => updateSale(index, { saleBackup: event.target.value })} />
            <input
              className="h-9 rounded-md border border-line px-2 text-sm"
              value={row.ngayDiUuTien.join(", ")}
              onChange={(event) => updateSale(index, { ngayDiUuTien: parseList(event.target.value) })}
            />
          </div>
        );
      },
    },
    { key: "outlets", header: "Số điểm bán", cell: (row) => <span className="font-bold">{row.outletCount}</span> },
    {
      key: "actual",
      header: "Kiểm tra",
      cell: (row) =>
        row.mismatchedOutletCount ? <span className="text-amber-700">{row.mismatchedOutletCount} điểm khác sale vùng</span> : <span className="text-emerald-700">Đúng vùng</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Setup khu vực và sale"
        description="Thiết lập khu vực bán hàng, danh sách sale, cụm tuyến phụ trách, sale backup và min/max số điểm mỗi ngày cho từng sale."
      />

      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <div className="font-bold">Nguyên tắc</div>
        <div>Sale có thể quản theo quận/khu vực, nhưng Planner vẫn lập tuyến theo cụm nhỏ trong quận để tránh đi ziczac.</div>
        <div>Các thay đổi ở đây lưu trên trình duyệt và Planner dùng ngay cho cảnh báo min/max riêng từng sale.</div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-bold text-white" onClick={() => saveSalesConfig(config)}>
          Lưu cấu hình sale
        </button>
        <button className="rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-ink" onClick={() => setConfig(loadSalesConfig())}>
          Tải lại cấu hình
        </button>
      </div>

      <OverloadWarning title="Cụm chưa gán sale" items={unassignedClusters.map((cluster) => `${cluster.maCum} - ${cluster.tenCum} chưa có sale phụ trách.`)} />

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.salePhuTrach} />
      </div>
    </div>
  );
}
