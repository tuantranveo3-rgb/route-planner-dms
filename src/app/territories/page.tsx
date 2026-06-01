"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OverloadWarning } from "@/components/OverloadWarning";
import { PageHeader } from "@/components/PageHeader";
import { loadOutlets } from "@/lib/outlet-storage";
import { clusters, salesTerritories, seedOutlets } from "@/lib/seed-data";
import { loadSalesConfig, saveSalesConfig } from "@/lib/sales-config";
import { findUnassignedClusters, summarizeTerritories } from "@/lib/territory-logic";
import type { SalesTerritory } from "@/types/territory";

const WEEK_DAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const ALL_SALES = "Tất cả sale";
const ALL_DISTRICTS = "Tất cả quận/huyện";

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function clusterLabel(clusterId: string) {
  const cluster = clusters.find((item) => item.maCum === clusterId);
  return cluster ? `${cluster.maCum} - ${cluster.tenCum}` : clusterId;
}

function sanitizeSchedule(schedule: SalesTerritory["lichTheoNgay"], allowedClusterIds: string[]) {
  return schedule
    .map((item) => ({
      dayName: item.dayName,
      clusterIds: item.clusterIds.filter((clusterId) => allowedClusterIds.includes(clusterId)),
    }))
    .filter((item) => item.clusterIds.length);
}

function filterHref(saleName: string, district: string) {
  const params = new URLSearchParams();
  if (saleName !== ALL_SALES) params.set("sale", saleName);
  if (district !== ALL_DISTRICTS) params.set("district", district);
  const query = params.toString();
  return query ? `/territories?${query}` : "/territories";
}

function checkedClass(active: boolean, tone: "blue" | "green" | "dark") {
  if (tone === "dark") return active ? "border-ink bg-ink text-white" : "border-line bg-white text-muted";
  if (tone === "green") return active ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-line bg-white text-muted";
  return active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-line bg-white text-muted";
}

export default function TerritoriesPage() {
  return (
    <Suspense fallback={<div className="rounded-lg border border-line bg-white p-4 text-sm text-muted">Đang tải phân vùng sale...</div>}>
      <TerritoriesContent />
    </Suspense>
  );
}

function TerritoriesContent() {
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<SalesTerritory[]>(() => loadSalesConfig());
  const [outlets, setOutlets] = useState(seedOutlets);
  const saleFilter = searchParams.get("sale") || ALL_SALES;
  const districtFilter = searchParams.get("district") || ALL_DISTRICTS;

  useEffect(() => {
    setOutlets(loadOutlets());
    setConfig(loadSalesConfig());
  }, []);

  useEffect(() => {
    if (config.length) saveSalesConfig(config);
  }, [config]);

  const rows = useMemo(() => summarizeTerritories(config, outlets, clusters), [config, outlets]);
  const unassignedClusters = useMemo(() => findUnassignedClusters(config, clusters), [config]);
  const activeSaleNames = useMemo(() => new Set(outlets.map((outlet) => outlet.salePhuTrach).filter(Boolean)), [outlets]);
  const activeConfig = useMemo(() => config.filter((item) => activeSaleNames.has(item.salePhuTrach)), [activeSaleNames, config]);
  const saleOptions = useMemo(() => activeConfig.map((item) => item.salePhuTrach), [activeConfig]);
  const districtOptions = useMemo(() => Array.from(new Set(clusters.map((cluster) => cluster.quanHuyen))).sort(), []);

  const visibleConfig = useMemo(
    () =>
      activeConfig.filter((territory) => {
        const matchSale = saleFilter === ALL_SALES || territory.salePhuTrach === saleFilter;
        const matchDistrict = districtFilter === ALL_DISTRICTS || territory.khuVucPhuTrach.includes(districtFilter);
        return matchSale && matchDistrict;
      }),
    [activeConfig, districtFilter, saleFilter],
  );

  function updateSale(saleName: string, patch: Partial<SalesTerritory>) {
    setConfig((current) => current.map((item) => (item.salePhuTrach === saleName ? { ...item, ...patch } : item)));
  }

  function updateDistrict(territory: SalesTerritory, district: string) {
    const nextDistricts = toggleValue(territory.khuVucPhuTrach, district);
    const allowedClusterIds = clusters.filter((cluster) => nextDistricts.includes(cluster.quanHuyen)).map((cluster) => cluster.maCum);
    const nextClusterIds = territory.cumNhoPhuTrach.filter((clusterId) => allowedClusterIds.includes(clusterId));
    const nextSchedule = sanitizeSchedule(territory.lichTheoNgay, nextClusterIds);
    updateSale(territory.salePhuTrach, {
      khuVucPhuTrach: nextDistricts,
      cumNhoPhuTrach: nextClusterIds,
      lichTheoNgay: nextSchedule,
      ngayDiUuTien: nextSchedule.map((item) => item.dayName),
    });
  }

  function updateCluster(territory: SalesTerritory, clusterId: string) {
    const nextClusterIds = toggleValue(territory.cumNhoPhuTrach, clusterId);
    const nextSchedule = sanitizeSchedule(territory.lichTheoNgay, nextClusterIds);
    updateSale(territory.salePhuTrach, {
      cumNhoPhuTrach: nextClusterIds,
      lichTheoNgay: nextSchedule,
      ngayDiUuTien: nextSchedule.map((item) => item.dayName),
    });
  }

  function updateDayCluster(territory: SalesTerritory, dayName: string, clusterId: string) {
    const existing = territory.lichTheoNgay.find((item) => item.dayName === dayName);
    const nextForDay = toggleValue(existing?.clusterIds ?? [], clusterId);
    const withoutDay = territory.lichTheoNgay.filter((item) => item.dayName !== dayName);
    const nextSchedule = nextForDay.length ? [...withoutDay, { dayName, clusterIds: nextForDay }] : withoutDay;
    updateSale(territory.salePhuTrach, {
      lichTheoNgay: nextSchedule.sort((a, b) => WEEK_DAYS.indexOf(a.dayName) - WEEK_DAYS.indexOf(b.dayName)),
      ngayDiUuTien: nextSchedule.map((item) => item.dayName),
    });
  }

  function resetToSeed() {
    window.localStorage.removeItem("route-planner-dms-sales-config-v1");
    setConfig(salesTerritories);
  }

  return (
    <div>
      <PageHeader
        title="Setup khu vực và sale"
        description="Gán từng sale với quận/huyện, cụm nhỏ, backup và lịch đi theo ngày bằng danh sách chọn sẵn. Planner dùng cấu hình này để tự chia lịch theo từng sale."
      />

      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <div className="font-bold">Cách hiểu nhanh</div>
        <div>Quận/huyện chỉ là vùng phụ trách của sale. Lịch tuyến vẫn chạy theo cụm nhỏ như Q1-A, Q1-B, PN-A để không gom tuyến theo quận lớn.</div>
        <div>Ngày đi theo sale: cùng Thứ 2, sale A có thể đi Q1-A còn sale B đi Q3-A. Vì vậy lịch cố định nằm ở phần Phân vùng sale, không nằm cố định một kiểu cho mọi sale.</div>
      </div>

      <div className="mb-4 grid gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">
        <div>
          <div className="mb-2 text-sm font-bold text-muted">Lọc sale để xem nhanh</div>
          <div className="flex flex-wrap gap-2">
            {[ALL_SALES, ...saleOptions].map((saleName) => {
              const active = saleFilter === saleName;
              return (
                <a
                  key={saleName}
                  aria-current={active ? "true" : undefined}
                  href={filterHref(saleName, districtFilter)}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-bold ${active ? "border-ink bg-ink text-white" : "border-line bg-white text-muted"}`}
                >
                  {saleName}
                </a>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-bold text-muted">Lọc quận/huyện để xem nhanh</div>
          <div className="flex flex-wrap gap-2">
            {[ALL_DISTRICTS, ...districtOptions].map((district) => {
              const active = districtFilter === district;
              return (
                <a
                  key={district}
                  aria-current={active ? "true" : undefined}
                  href={filterHref(saleFilter, district)}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-bold ${active ? "border-blue-700 bg-blue-700 text-white" : "border-line bg-white text-muted"}`}
                >
                  {district}
                </a>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md bg-ink px-4 py-2 text-sm font-bold text-white" onClick={() => saveSalesConfig(config)}>
          Lưu cấu hình
          </button>
          <button className="rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-ink" onClick={resetToSeed}>
          Khôi phục mẫu
          </button>
        </div>
        <div className="text-xs leading-5 text-muted">
          Bộ lọc phía trên chỉ để tìm nhanh. Muốn chỉnh phân vùng, vào từng thẻ sale bên dưới rồi bấm các chip quận/cụm/ngày. Chip có màu là đang được chọn, bấm lại để bỏ chọn.
          Sau khi import file thật, màn này chỉ hiện các sale đang có điểm bán trong dữ liệu hiện tại.
        </div>
      </div>

      <OverloadWarning title="Cụm chưa gán sale" items={unassignedClusters.map((cluster) => `${cluster.maCum} - ${cluster.tenCum} chưa có sale phụ trách.`)} />

      <div className="mt-4 grid gap-4">
        {visibleConfig.map((territory) => {
          const row = rows.find((item) => item.salePhuTrach === territory.salePhuTrach);
          const assignedClusters = clusters.filter((cluster) => territory.cumNhoPhuTrach.includes(cluster.maCum));
          const availableClusters = clusters.filter((cluster) => territory.khuVucPhuTrach.includes(cluster.quanHuyen));

          return (
            <section key={territory.salePhuTrach} className="rounded-lg border border-line bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-muted">Sale phụ trách</div>
                  <h2 className="mt-1 text-xl font-bold text-ink">{territory.salePhuTrach}</h2>
                  <div className="mt-1 text-sm text-muted">
                    {row?.outletCount ?? 0} điểm bán · {row?.mismatchedOutletCount ? `${row.mismatchedOutletCount} điểm khác sale vùng` : "Đúng vùng"}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs font-bold uppercase text-muted">
                    Min/ngày
                    <input
                      className="h-10 w-24 rounded-md border border-line px-3 text-sm font-normal text-ink"
                      type="number"
                      min={0}
                      value={territory.minVisitsPerDay}
                      onChange={(event) => updateSale(territory.salePhuTrach, { minVisitsPerDay: Number(event.target.value) })}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-bold uppercase text-muted">
                    Max/ngày
                    <input
                      className="h-10 w-24 rounded-md border border-line px-3 text-sm font-normal text-ink"
                      type="number"
                      min={1}
                      value={territory.maxVisitsPerDay}
                      onChange={(event) => updateSale(territory.salePhuTrach, { maxVisitsPerDay: Number(event.target.value) })}
                    />
                  </label>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="grid gap-4">
                  <div>
                    <div className="mb-2 text-sm font-bold text-ink">Chọn quận/huyện phụ trách</div>
                    <div className="mb-2 text-xs text-muted">Bấm để thêm/bỏ quận cho sale này.</div>
                    <div className="flex flex-wrap gap-2">
                      {districtOptions.map((district) => {
                        const active = territory.khuVucPhuTrach.includes(district);
                        return (
                          <label
                            key={district}
                            className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold ${checkedClass(active, "blue")}`}
                          >
                            <input
                              checked={active}
                              className="h-4 w-4 accent-blue-700"
                              onChange={() => updateDistrict(territory, district)}
                              type="checkbox"
                            />
                            {district}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-bold text-ink">Chọn cụm nhỏ trong khu vực</div>
                    <div className="mb-2 text-xs text-muted">Chỉ các cụm được chọn mới xuất hiện trong lịch theo ngày.</div>
                    <div className="flex flex-wrap gap-2">
                      {availableClusters.map((cluster) => {
                        const active = territory.cumNhoPhuTrach.includes(cluster.maCum);
                        return (
                          <label
                            key={cluster.maCum}
                            className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold ${checkedClass(active, "green")}`}
                            title={cluster.tenCum}
                          >
                            <input
                              checked={active}
                              className="h-4 w-4 accent-emerald-700"
                              onChange={() => updateCluster(territory, cluster.maCum)}
                              type="checkbox"
                            />
                            {cluster.maCum}
                          </label>
                        );
                      })}
                    </div>
                    {!availableClusters.length ? <div className="mt-2 text-sm text-amber-700">Chọn quận/huyện trước để hiện danh sách cụm.</div> : null}
                  </div>

                  <label className="grid max-w-sm gap-1 text-sm font-bold text-ink">
                    Sale backup
                    <select
                      className="h-10 rounded-md border border-line px-3 text-sm font-normal"
                      value={territory.saleBackup}
                      onChange={(event) => updateSale(territory.salePhuTrach, { saleBackup: event.target.value })}
                    >
                      <option value="">Chưa chọn backup</option>
                      {saleOptions
                        .filter((saleName) => saleName !== territory.salePhuTrach)
                        .map((saleName) => (
                          <option key={saleName} value={saleName}>
                            {saleName}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <div>
                  <div className="mb-2 text-sm font-bold text-ink">Lịch sale theo ngày</div>
                  <div className="mb-2 text-xs text-muted">Không cố định cứng. Bấm cụm ở từng thứ để chọn ngày sale đi cụm đó. Chip đen là đang chọn.</div>
                  <div className="grid gap-2">
                    {WEEK_DAYS.map((dayName) => {
                      const selected = territory.lichTheoNgay.find((item) => item.dayName === dayName)?.clusterIds ?? [];
                      return (
                        <div key={dayName} className="rounded-md border border-line bg-slate-50 p-3">
                          <div className="mb-2 text-sm font-bold text-ink">{dayName}</div>
                          <div className="flex flex-wrap gap-2">
                            {assignedClusters.map((cluster) => {
                              const active = selected.includes(cluster.maCum);
                              return (
                                <label
                                  key={`${dayName}-${cluster.maCum}`}
                                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${checkedClass(active, "dark")}`}
                                  title={clusterLabel(cluster.maCum)}
                                >
                                  <input
                                    checked={active}
                                    className="h-3.5 w-3.5 accent-slate-950"
                                    onChange={() => updateDayCluster(territory, dayName, cluster.maCum)}
                                    type="checkbox"
                                  />
                                  {cluster.maCum}
                                </label>
                              );
                            })}
                            {!assignedClusters.length ? <span className="text-sm text-muted">Chưa có cụm để chọn.</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
