import { FrequencyBadge } from "@/components/FrequencyBadge";
import { MetricCard } from "@/components/MetricCard";
import { OverloadWarning } from "@/components/OverloadWarning";
import { PageHeader } from "@/components/PageHeader";
import { clusters, salesTerritories, seedOutlets } from "@/lib/seed-data";
import { DEFAULT_SETTINGS, enrichOutlets, generateMonthlyRoutePlan, getOverloadedClusters } from "@/lib/route-logic";
import type { Frequency } from "@/types/outlet";

const month = new Date().getMonth() + 1;
const year = new Date().getFullYear();
const outlets = enrichOutlets(seedOutlets);
const plan = generateMonthlyRoutePlan(month, year, seedOutlets, clusters);
const counts = outlets.reduce<Record<Frequency, number>>(
  (acc, outlet) => {
    acc[outlet.frequency] += 1;
    return acc;
  },
  { F8: 0, F4: 0, F2: 0, F1: 0, "F0.5": 0, "F0.3": 0 },
);
const monthlyVisits = outlets.reduce((sum, outlet) => sum + outlet.monthlyVisits, 0);
const averageDailyVisits = Number((monthlyVisits / DEFAULT_SETTINGS.workingDaysPerMonth).toFixed(1));
const overloaded = getOverloadedClusters(plan, clusters);

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Tổng quan năng lực tuyến theo tần suất F và cụm nhỏ. MVP luôn gom theo phường/xã/cụm đường, không gom tuyến theo quận lớn."
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Tổng điểm bán" value={outlets.length} hint="Dữ liệu seed TP.HCM" />
        <MetricCard label="Tổng lượt ghé/tháng" value={monthlyVisits} hint="F8=8, F4=4, F2=2, F1=1, F0.5/F0.3 linh hoạt" />
        <MetricCard label="Lượt ghé/ngày bình quân" value={averageDailyVisits} hint={`${DEFAULT_SETTINGS.workingDaysPerMonth} ngày làm việc/tháng`} />
        <MetricCard label="Ngưỡng cảnh báo" value="25 điểm/ngày" hint={averageDailyVisits > 25 ? "Đang quá tải" : "Đang trong ngưỡng"} />
        <MetricCard label="Cụm quá tải" value={overloaded.length} hint="Theo capacity cụm/ngày" />
      </div>

      <div className="mb-6 rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Phân vùng sale theo khu vực</h2>
          <a className="rounded-md border border-line px-3 py-2 text-sm font-bold text-ink" href="/territories">
            Xem phân vùng
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {salesTerritories.map((territory) => (
            <div key={territory.salePhuTrach} className="rounded-md border border-line p-3">
              <div className="font-bold">{territory.salePhuTrach}</div>
              <div className="mt-1 text-sm text-muted">{territory.khuVucPhuTrach.join(", ")}</div>
              <div className="mt-2 text-sm">Cụm: {territory.cumNhoPhuTrach.join(", ")}</div>
              <div className="mt-1 text-xs text-muted">Backup: {territory.saleBackup}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {(Object.keys(counts) as Frequency[]).map((frequency) => (
          <div key={frequency} className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Điểm bán {frequency}</span>
              <FrequencyBadge frequency={frequency} />
            </div>
            <div className="text-3xl font-bold text-ink">{counts[frequency]}</div>
          </div>
        ))}
      </div>

      <OverloadWarning
        title={averageDailyVisits > 25 ? "Cảnh báo quá tải toàn đội" : "Theo dõi cụm vượt capacity"}
        items={[
          ...(averageDailyVisits > 25 ? [`Bình quân ${averageDailyVisits} điểm/ngày, vượt ngưỡng 25 điểm/ngày.`] : []),
          ...overloaded.map((item) => `${item.week} - ${item.clusterName}: ${item.visits}/${item.capacity} điểm. Quá tải, cần tách cụm hoặc hạ tần suất.`),
        ]}
      />

      <div className="mt-6 rounded-lg border border-line bg-white p-5 shadow-soft">
        <h2 className="mb-3 text-lg font-bold">Cụm tuyến cần chú ý</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {clusters.map((cluster) => {
            const clusterOutlets = outlets.filter((outlet) => outlet.cumNho === cluster.maCum);
            const clusterVisits = clusterOutlets.reduce((sum, outlet) => sum + outlet.monthlyVisits, 0);
            return (
              <div key={cluster.maCum} className="rounded-md border border-line p-3">
                <div className="font-bold">{cluster.maCum} - {cluster.tenCum}</div>
                <div className="mt-1 text-sm text-muted">{cluster.danhSachPhuongXa.join(", ")}</div>
                <div className="mt-2 text-sm">{clusterOutlets.length} điểm bán, {clusterVisits} lượt/tháng, ngày cố định {cluster.ngayDiCoDinh}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
