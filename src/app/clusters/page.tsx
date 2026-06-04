"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { canEdit, loadCurrentAccount, type AppRole } from "@/lib/auth";
import { loadClusters, resetClusters, saveClusters } from "@/lib/cluster-storage";
import { loadOutlets } from "@/lib/outlet-storage";
import { clusters as seedClusters, seedOutlets } from "@/lib/seed-data";
import type { RouteCluster } from "@/types/cluster";
import type { Outlet } from "@/types/outlet";

const dayOptions: RouteCluster["ngayDiCoDinh"][] = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

function parseWards(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ClustersPage() {
  const [rows, setRows] = useState<RouteCluster[]>(seedClusters);
  const [outlets, setOutlets] = useState<Outlet[]>(seedOutlets);
  const [role, setRole] = useState<AppRole>("boss");
  const editable = canEdit(role);

  useEffect(() => {
    setRows(loadClusters());
    setOutlets(loadOutlets());
    setRole(loadCurrentAccount().id);
    const listener = () => setRole(loadCurrentAccount().id);
    window.addEventListener("route-planner-account-change", listener);
    return () => window.removeEventListener("route-planner-account-change", listener);
  }, []);

  const outletCountByCluster = useMemo(() => {
    const counts = new Map<string, number>();
    outlets.forEach((outlet) => counts.set(outlet.cumNho, (counts.get(outlet.cumNho) ?? 0) + 1));
    return counts;
  }, [outlets]);

  function updateCluster(maCum: string, patch: Partial<RouteCluster>) {
    setRows((current) => current.map((cluster) => (cluster.maCum === maCum ? { ...cluster, ...patch } : cluster)));
  }

  function saveAll() {
    saveClusters(rows);
  }

  function resetAll() {
    resetClusters();
    setRows(seedClusters);
  }

  return (
    <div>
      <PageHeader
        title="Cụm tuyến"
        description="Chỉnh cụm nhỏ, capacity và tâm cụm. Planner dùng cụm nhỏ này để chia tuyến; không gom theo quận/huyện lớn."
      />

      <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-line bg-white p-4 shadow-soft">
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={!editable} onClick={saveAll}>
          Lưu cụm
        </button>
        <button className="rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-ink disabled:opacity-50" disabled={!editable} onClick={resetAll}>
          Khôi phục mẫu
        </button>
        {!editable ? <div className="text-sm text-amber-700">Account Người xem chỉ được xem, không được chỉnh cụm.</div> : null}
      </div>

      <div className="overflow-auto rounded-lg border border-line bg-white shadow-soft">
        <table className="min-w-[1180px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-3">Mã cụm</th>
              <th className="px-3 py-3">Tên cụm nhỏ</th>
              <th className="px-3 py-3">Quận/Huyện</th>
              <th className="px-3 py-3">Phường/Xã</th>
              <th className="px-3 py-3">Ngày gợi ý</th>
              <th className="px-3 py-3">Capacity</th>
              <th className="px-3 py-3">Tâm X</th>
              <th className="px-3 py-3">Tâm Y</th>
              <th className="px-3 py-3">Điểm bán</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cluster) => (
              <tr key={cluster.maCum} className="border-t border-line align-top">
                <td className="px-3 py-3 font-bold">{cluster.maCum}</td>
                <td className="px-3 py-3">
                  <input className="h-9 w-full rounded-md border border-line px-2 disabled:bg-slate-50" disabled={!editable} value={cluster.tenCum} onChange={(event) => updateCluster(cluster.maCum, { tenCum: event.target.value })} />
                </td>
                <td className="px-3 py-3">
                  <input className="h-9 w-full rounded-md border border-line px-2 disabled:bg-slate-50" disabled={!editable} value={cluster.quanHuyen} onChange={(event) => updateCluster(cluster.maCum, { quanHuyen: event.target.value })} />
                </td>
                <td className="px-3 py-3">
                  <input className="h-9 w-full rounded-md border border-line px-2 disabled:bg-slate-50" disabled={!editable} value={cluster.danhSachPhuongXa.join(", ")} onChange={(event) => updateCluster(cluster.maCum, { danhSachPhuongXa: parseWards(event.target.value) })} />
                </td>
                <td className="px-3 py-3">
                  <select className="h-9 rounded-md border border-line px-2 disabled:bg-slate-50" disabled={!editable} value={cluster.ngayDiCoDinh} onChange={(event) => updateCluster(cluster.maCum, { ngayDiCoDinh: event.target.value as RouteCluster["ngayDiCoDinh"] })}>
                    {dayOptions.map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <input className="h-9 w-20 rounded-md border border-line px-2 disabled:bg-slate-50" disabled={!editable} type="number" value={cluster.capacityNgay} onChange={(event) => updateCluster(cluster.maCum, { capacityNgay: Number(event.target.value) })} />
                </td>
                <td className="px-3 py-3">
                  <input className="h-9 w-24 rounded-md border border-line px-2 disabled:bg-slate-50" disabled={!editable} type="number" step="0.000001" value={cluster.toaDoTamX} onChange={(event) => updateCluster(cluster.maCum, { toaDoTamX: Number(event.target.value) })} />
                </td>
                <td className="px-3 py-3">
                  <input className="h-9 w-24 rounded-md border border-line px-2 disabled:bg-slate-50" disabled={!editable} type="number" step="0.000001" value={cluster.toaDoTamY} onChange={(event) => updateCluster(cluster.maCum, { toaDoTamY: Number(event.target.value) })} />
                </td>
                <td className="px-3 py-3 font-bold">{outletCountByCluster.get(cluster.maCum) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
