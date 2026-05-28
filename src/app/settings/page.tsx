"use client";

import { useEffect, useMemo, useState } from "react";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { DEFAULT_SETTINGS } from "@/lib/route-logic";
import { loadPlannerSettings, savePlannerSettings } from "@/lib/settings-storage";

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const totalWeight = useMemo(() => Object.values(settings.weights).reduce((sum, value) => sum + value, 0), [settings]);

  useEffect(() => {
    setSettings(loadPlannerSettings());
  }, []);

  useEffect(() => {
    savePlannerSettings(settings);
  }, [settings]);

  function updateWeight(key: keyof typeof settings.weights, value: number) {
    setSettings((current) => ({ ...current, weights: { ...current.weights, [key]: value } }));
  }

  return (
    <div>
      <PageHeader
        title="Cài đặt"
        description="Điều chỉnh trọng số chấm điểm và capacity mặc định cho mô phỏng MVP. Tổng trọng số cần bằng 100% để điểm tổng dễ đọc."
      />
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <MetricCard label="Tổng trọng số" value={`${totalWeight}%`} hint={totalWeight === 100 ? "Hợp lệ" : "Cần chỉnh về 100%"} />
        <MetricCard label="Capacity điểm/ngày" value={settings.defaultDailyCapacity} />
        <MetricCard label="Min/Max sale/ngày" value={`${settings.minVisitsPerSaleDay}-${settings.maxVisitsPerSaleDay}`} />
        <MetricCard label="Ngày làm việc/tháng" value={settings.workingDaysPerMonth} />
      </div>
      {settings.minVisitsPerSaleDay > settings.maxVisitsPerSaleDay ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          Min điểm/ngày đang lớn hơn Max điểm/ngày. Vui lòng chỉnh lại để Planner cảnh báo đúng.
        </div>
      ) : null}
      {totalWeight !== 100 ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
          Tổng trọng số hiện là {totalWeight}%, vui lòng chỉnh về 100%.
        </div>
      ) : null}
      <div className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-soft lg:grid-cols-2">
        {[
          ["sales", "Trọng số doanh số"],
          ["orders", "Trọng số số đơn"],
          ["potential", "Trọng số tiềm năng"],
          ["distance", "Trọng số khoảng cách"],
          ["risk", "Trọng số rủi ro"],
        ].map(([key, label]) => (
          <label key={key} className="grid gap-2">
            <span className="text-sm font-bold">{label}</span>
            <input
              type="number"
              min={0}
              max={100}
              className="h-10 rounded-md border border-line px-3 text-sm"
              value={settings.weights[key as keyof typeof settings.weights]}
              onChange={(event) => updateWeight(key as keyof typeof settings.weights, Number(event.target.value))}
            />
          </label>
        ))}
        <label className="grid gap-2">
          <span className="text-sm font-bold">Capacity điểm/ngày</span>
          <input
            type="number"
            min={1}
            className="h-10 rounded-md border border-line px-3 text-sm"
            value={settings.defaultDailyCapacity}
            onChange={(event) => setSettings((current) => ({ ...current, defaultDailyCapacity: Number(event.target.value) }))}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-bold">Min điểm sale/ngày</span>
          <input
            type="number"
            min={0}
            className="h-10 rounded-md border border-line px-3 text-sm"
            value={settings.minVisitsPerSaleDay}
            onChange={(event) => setSettings((current) => ({ ...current, minVisitsPerSaleDay: Number(event.target.value) }))}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-bold">Max điểm sale/ngày</span>
          <input
            type="number"
            min={1}
            className="h-10 rounded-md border border-line px-3 text-sm"
            value={settings.maxVisitsPerSaleDay}
            onChange={(event) => setSettings((current) => ({ ...current, maxVisitsPerSaleDay: Number(event.target.value) }))}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-bold">Số ngày làm việc/tháng</span>
          <input
            type="number"
            min={1}
            className="h-10 rounded-md border border-line px-3 text-sm"
            value={settings.workingDaysPerMonth}
            onChange={(event) => setSettings((current) => ({ ...current, workingDaysPerMonth: Number(event.target.value) }))}
          />
        </label>
      </div>
    </div>
  );
}
