"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { PageHeader } from "@/components/PageHeader";
import { canEdit, loadCurrentAccount, type AppRole } from "@/lib/auth";
import { downloadCsv, executionHistoryToCsv, parseExecutionHistoryCsv, parseOutletCsv, plannerToCsv } from "@/lib/csv";
import { loadClusters } from "@/lib/cluster-storage";
import { loadOutlets, saveOutlets } from "@/lib/outlet-storage";
import { EXECUTION_STORAGE_KEY } from "@/lib/route-execution";
import { enrichOutlets, generateMonthlyRoutePlan } from "@/lib/route-logic";
import { sampleExecutionHistoryCsv, sampleOutletsCsv } from "@/lib/sample-csv";
import { clusters, saleStartPoints, seedOutlets } from "@/lib/seed-data";
import { loadSalesConfig, saveSalesConfig, syncSalesConfigWithOutlets } from "@/lib/sales-config";
import type { EnrichedOutlet } from "@/types/outlet";
import type { RouteCluster } from "@/types/cluster";
import type { RouteExecutionRecord } from "@/types/route";
import type { SalesTerritory } from "@/types/territory";

export default function ImportExportPage() {
  const [message, setMessage] = useState("Chưa import file nào. Bảng dưới đang dùng dữ liệu seed.");
  const [historyMessage, setHistoryMessage] = useState("Chưa import lịch sử thực hiện. Planner sẽ dùng lịch sử đang lưu trên trình duyệt nếu có.");
  const [historyCount, setHistoryCount] = useState(0);
  const [outlets, setOutlets] = useState(seedOutlets);
  const [routeClusters, setRouteClusters] = useState<RouteCluster[]>(clusters);
  const [salesConfig, setSalesConfig] = useState<SalesTerritory[]>([]);
  const [role, setRole] = useState<AppRole>("boss");
  const editable = canEdit(role);
  const enriched = useMemo(() => enrichOutlets(outlets).slice(0, 12), [outlets]);
  const plan = useMemo(() => generateMonthlyRoutePlan(new Date().getMonth() + 1, new Date().getFullYear(), outlets, routeClusters, undefined, [], saleStartPoints, salesConfig), [outlets, routeClusters, salesConfig]);

  useEffect(() => {
    setOutlets(loadOutlets());
    setRouteClusters(loadClusters());
    setSalesConfig(loadSalesConfig());
    setRole(loadCurrentAccount().id);
    const listener = () => setRole(loadCurrentAccount().id);
    window.addEventListener("route-planner-account-change", listener);
    const raw = window.localStorage.getItem(EXECUTION_STORAGE_KEY);
    setHistoryCount(raw ? (JSON.parse(raw) as RouteExecutionRecord[]).length : 0);
    return () => window.removeEventListener("route-planner-account-change", listener);
  }, []);

  const columns: Column<EnrichedOutlet>[] = [
    { key: "id", header: "Outlet", cell: (row) => <div><div className="font-bold">{row.outletId}</div><div className="text-xs text-muted">{row.tenDiemBan}</div></div> },
    { key: "area", header: "Cụm nhỏ", cell: (row) => <div>{row.cumNho}<div className="text-xs text-muted">{row.phuongXa}</div></div> },
    { key: "sale", header: "Sale", cell: (row) => row.salePhuTrach },
    { key: "score", header: "Tổng điểm", cell: (row) => row.totalScore },
    { key: "f", header: "F", cell: (row) => <FrequencyBadge frequency={row.frequency} /> },
  ];

  function onFileChange(file?: File) {
    if (!file) return;
    if (!editable) {
      setMessage("Account Người xem không được import dữ liệu.");
      return;
    }
    file.text().then((content) => {
      const parsed = parseOutletCsv(content, routeClusters);
      if (parsed.errors.length) {
        setMessage(parsed.errors.join(" "));
        return;
      }

      setOutlets(parsed.outlets);
      saveOutlets(parsed.outlets);

      const nextSalesConfig = syncSalesConfigWithOutlets(loadSalesConfig(), parsed.outlets, routeClusters);
      setSalesConfig(nextSalesConfig);
      saveSalesConfig(nextSalesConfig);

      const importedSales = new Set(parsed.outlets.map((outlet) => outlet.salePhuTrach).filter(Boolean));
      const importedClusters = new Set(parsed.outlets.map((outlet) => outlet.cumNho).filter(Boolean));
      setMessage(
        `Import thành công ${parsed.outlets.length} điểm bán, ghi nhận ${importedSales.size} sale và ${importedClusters.size} cụm. Phân vùng sale đã tự đồng bộ theo sale/quận/cụm trong file import; Planner sẽ dùng dữ liệu mới này.`,
      );
    });
  }

  function getStoredExecutionRecords() {
    const raw = window.localStorage.getItem(EXECUTION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RouteExecutionRecord[]) : [];
  }

  function mergeExecutionRecords(nextRecords: RouteExecutionRecord[]) {
    const existing = getStoredExecutionRecords();
    const byVisit = new Map(existing.map((record) => [record.visitId, record]));
    let added = 0;
    let updated = 0;

    nextRecords.forEach((record) => {
      if (byVisit.has(record.visitId)) updated += 1;
      else added += 1;
      byVisit.set(record.visitId, record);
    });

    const merged = [...byVisit.values()];
    window.localStorage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify(merged));
    setHistoryCount(merged.length);
    return { added, updated, total: merged.length };
  }

  function onHistoryFileChange(file?: File) {
    if (!file) return;
    if (!editable) {
      setHistoryMessage("Account Người xem không được import thực hiện.");
      return;
    }
    file.text().then((content) => {
      const parsed = parseExecutionHistoryCsv(content);
      if (parsed.errors.length) {
        setHistoryMessage(parsed.errors.join(" "));
        return;
      }
      const result = mergeExecutionRecords(parsed.records);
      setHistoryMessage(`Import cộng dồn thành công ${parsed.records.length} dòng: thêm mới ${result.added}, cập nhật ${result.updated}. Tổng lịch sử đang lưu: ${result.total} dòng. Dữ liệu tháng cũ không bị xóa.`);
    });
  }

  function exportStoredHistory() {
    const records = getStoredExecutionRecords();
    if (!records.length) {
      setHistoryMessage("Chưa có lịch sử thực hiện nào để export.");
      return;
    }
    downloadCsv("route-execution-history-all.csv", executionHistoryToCsv(records));
    setHistoryCount(records.length);
    setHistoryMessage(`Đã export ${records.length} dòng lịch sử thực hiện đang lưu trên trình duyệt.`);
  }

  return (
    <div>
      <PageHeader
        title="Import/Export CSV"
        description="Import danh sách điểm bán CSV. Nếu file có cột ghiNhanF thì Planner dùng F anh nhập để phân tuyến; nếu thiếu ghiNhanF thì app mới tự tính F theo điểm."
      />
      <div className="mb-4 grid gap-4 rounded-lg border border-line bg-white p-4 shadow-soft md:grid-cols-3">
        <label className="block">
          <span className="mb-2 block text-sm font-bold">Import CSV điểm bán</span>
          <input className="block w-full text-sm disabled:opacity-50" disabled={!editable} type="file" accept=".csv" onChange={(event) => onFileChange(event.target.files?.[0])} />
        </label>
        <button
          className="h-10 rounded-md border border-line bg-white px-4 text-sm font-bold text-ink"
          onClick={() => downloadCsv("sample_outlets_excel_utf8.csv", sampleOutletsCsv)}
        >
          Tải file mẫu
        </button>
        <button className="h-10 rounded-md bg-ink px-4 text-sm font-bold text-white" onClick={() => downloadCsv("route-plan-export.csv", plannerToCsv(plan))}>
          Export CSV lịch tuyến
        </button>
      </div>
      <div className={`mb-4 rounded-lg border p-4 text-sm ${message.includes("Thiếu") || message.includes("không hợp lệ") ? "border-red-200 bg-red-50 text-red-700" : "border-line bg-white text-muted"}`}>
        {message}
      </div>
      <div className="mb-4 grid gap-4 rounded-lg border border-line bg-white p-4 shadow-soft md:grid-cols-4">
        <label className="block">
          <span className="mb-2 block text-sm font-bold">Import Planner thực hiện</span>
          <input className="block w-full text-sm disabled:opacity-50" disabled={!editable} type="file" accept=".csv" onChange={(event) => onHistoryFileChange(event.target.files?.[0])} />
        </label>
        <button
          className="h-10 rounded-md border border-line bg-white px-4 text-sm font-bold text-ink"
          onClick={() => downloadCsv("sample_execution_history_excel_utf8.csv", sampleExecutionHistoryCsv)}
        >
          Tải mẫu lịch sử
        </button>
        <button className="h-10 rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700" onClick={exportStoredHistory}>
          Export toàn bộ lịch sử
        </button>
        <a className="flex h-10 items-center justify-center rounded-md bg-slate-100 px-4 text-sm font-bold text-ink" href="/planner">
          Mở Planner xem bù tuyến
        </a>
      </div>
      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        Lịch sử đang lưu: <span className="font-bold">{historyCount}</span> dòng. File import thực hiện nên lấy từ Export CSV lịch tuyến rồi điền actualStatus, actualRevenue, note. Mỗi lần import sẽ cộng thêm hoặc cập nhật theo <span className="font-bold">visitId</span>, không xóa dữ liệu tháng/năm cũ.
      </div>
      <div className={`mb-4 rounded-lg border p-4 text-sm ${historyMessage.includes("Thiếu") || historyMessage.includes("không hợp lệ") ? "border-red-200 bg-red-50 text-red-700" : "border-line bg-white text-muted"}`}>
        {historyMessage}
      </div>
      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <div className="font-bold">Giải thích cột dữ liệu</div>
        <div>
          <span className="font-semibold">salePhuTrach</span>: tên sale phụ trách điểm bán. Nếu file import có sale mới, app tự tạo thẻ sale đó trong Phân vùng sale và gợi ý quận/cụm theo file.
        </div>
        <div>
          <span className="font-semibold">khoangCachTamCumKm</span>: không bắt buộc. Nếu file không có cột này hoặc để trống, app tự tính từ <span className="font-semibold">toaDoX/toaDoY</span> của điểm bán so với tâm cụm trong <span className="font-semibold">cumNho</span>.
        </div>
        <div>
          <span className="font-semibold">doanhSo3Thang</span>: tổng doanh số của điểm bán trong 3 tháng gần nhất, nhập dạng số VND không dấu phẩy. Ví dụ: 285000000.
        </div>
        <div>
          <span className="font-semibold">soDon3Thang</span>: tổng số đơn hàng phát sinh trong 3 tháng gần nhất. Ví dụ: 34.
        </div>
        <div className="mt-2">
          <span className="font-semibold">visitId</span>: mã lượt đi duy nhất, nên lấy từ file export Planner để import thực hiện khớp đúng từng lượt.
        </div>
        <div>
          <span className="font-semibold">actualStatus</span>: trạng thái thực hiện tuyến. Giá trị hợp lệ: Chưa đi, Đã đi, Có đơn, Không có đơn, Không gặp khách, Dời lịch, CS từ xa.
        </div>
        <div>
          <span className="font-semibold">carryToNextMonth</span>: nhập true/false. Nếu true, Planner sẽ ưu tiên đưa outlet đó vào tuyến bù tháng sau.
        </div>
      </div>
      <DataTable columns={columns} rows={enriched} rowKey={(row) => row.outletId} />
    </div>
  );
}
