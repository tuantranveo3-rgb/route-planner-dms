"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { FrequencyBadge } from "@/components/FrequencyBadge";
import { PageHeader } from "@/components/PageHeader";
import { downloadCsv, executionHistoryToCsv, parseExecutionHistoryCsv, parseOutletCsv, plannerToCsv } from "@/lib/csv";
import { EXECUTION_STORAGE_KEY } from "@/lib/route-execution";
import { enrichOutlets, generateMonthlyRoutePlan } from "@/lib/route-logic";
import { sampleExecutionHistoryCsv, sampleOutletsCsv } from "@/lib/sample-csv";
import { clusters, saleStartPoints, seedOutlets } from "@/lib/seed-data";
import type { EnrichedOutlet } from "@/types/outlet";
import type { RouteExecutionRecord } from "@/types/route";

export default function ImportExportPage() {
  const [message, setMessage] = useState("Chưa import file nào. Bảng dưới đang dùng dữ liệu seed.");
  const [historyMessage, setHistoryMessage] = useState("Chưa import lịch sử thực hiện. Planner sẽ dùng lịch sử đang lưu trên trình duyệt nếu có.");
  const [historyCount, setHistoryCount] = useState(0);
  const [outlets, setOutlets] = useState(seedOutlets);
  const enriched = useMemo(() => enrichOutlets(outlets).slice(0, 12), [outlets]);
  const plan = useMemo(() => generateMonthlyRoutePlan(new Date().getMonth() + 1, new Date().getFullYear(), outlets, clusters, undefined, [], saleStartPoints), [outlets]);

  useEffect(() => {
    const raw = window.localStorage.getItem(EXECUTION_STORAGE_KEY);
    setHistoryCount(raw ? (JSON.parse(raw) as RouteExecutionRecord[]).length : 0);
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
    file.text().then((content) => {
      const parsed = parseOutletCsv(content);
      if (parsed.errors.length) {
        setMessage(parsed.errors.join(" "));
        return;
      }
      setOutlets(parsed.outlets);
      setMessage(`Import thành công ${parsed.outlets.length} điểm bán. Lịch tuyến được tạo lại từ file vừa import.`);
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
        description="Import danh sách điểm bán CSV có đủ cột bắt buộc, sau đó app tự chấm điểm, phân F và tạo lại planner. Nút tải file mẫu sẽ xuất CSV UTF-8 BOM để Excel đọc đúng tiếng Việt."
      />
      <div className="mb-4 grid gap-4 rounded-lg border border-line bg-white p-4 shadow-soft md:grid-cols-3">
        <label className="block">
          <span className="mb-2 block text-sm font-bold">Import CSV điểm bán</span>
          <input className="block w-full text-sm" type="file" accept=".csv" onChange={(event) => onFileChange(event.target.files?.[0])} />
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
          <span className="mb-2 block text-sm font-bold">Import cộng dồn lịch sử thực hiện</span>
          <input className="block w-full text-sm" type="file" accept=".csv" onChange={(event) => onHistoryFileChange(event.target.files?.[0])} />
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
        Lịch sử đang lưu: <span className="font-bold">{historyCount}</span> dòng. Mỗi lần import sẽ cộng thêm hoặc cập nhật theo <span className="font-bold">visitId</span>, không xóa dữ liệu tháng/năm cũ.
      </div>
      <div className={`mb-4 rounded-lg border p-4 text-sm ${historyMessage.includes("Thiếu") || historyMessage.includes("không hợp lệ") ? "border-red-200 bg-red-50 text-red-700" : "border-line bg-white text-muted"}`}>
        {historyMessage}
      </div>
      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <div className="font-bold">Giải thích cột dữ liệu</div>
        <div>
          <span className="font-semibold">doanhSo3Thang</span>: tổng doanh số của điểm bán trong 3 tháng gần nhất, nhập dạng số VND không dấu phẩy. Ví dụ: 285000000.
        </div>
        <div>
          <span className="font-semibold">soDon3Thang</span>: tổng số đơn hàng phát sinh trong 3 tháng gần nhất. Ví dụ: 34.
        </div>
        <div className="mt-2">
          <span className="font-semibold">visitId</span>: mã lượt đi duy nhất, nên lấy từ file export Planner để import thực hiện khớp đúng từng lượt, đặc biệt với F8 có 2 lượt trong cùng tuần.
        </div>
        <div>
          <span className="font-semibold">actualStatus</span>: trạng thái thực hiện tuyến trong file lịch sử. Giá trị hợp lệ: Chưa đi, Đã đi, Có đơn, Không có đơn, Không gặp khách, Dời lịch, CS từ xa.
        </div>
        <div>
          <span className="font-semibold">carryToNextMonth</span>: nhập true/false. Nếu true, Planner sẽ ưu tiên đưa outlet đó vào tuyến bù tháng sau.
        </div>
      </div>
      <DataTable columns={columns} rows={enriched} rowKey={(row) => row.outletId} />
    </div>
  );
}
