import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

const steps = [
  {
    title: "1. Kiểm tra dữ liệu điểm bán",
    href: "/outlets",
    body: "Vào Điểm bán để xem outlet, sale phụ trách, cụm nhỏ, điểm doanh số, điểm đơn hàng, tổng điểm và F dùng tuyến. Nếu file import có ghiNhanF thì app dùng F đó; nếu không có thì app tự tính.",
  },
  {
    title: "2. Setup cụm tuyến nhỏ",
    href: "/clusters",
    body: "Cụm tuyến phải là phường/xã/cụm đường nhỏ như Q1-A, BT-A, PN-A. Không gom tuyến theo cả quận lớn vì sale dễ chạy ziczac.",
  },
  {
    title: "3. Setup sale và khu vực",
    href: "/territories",
    body: "Vào Phân vùng sale để gán sale theo khu vực/cụm, chỉnh min/max điểm mỗi ngày và chọn cụm sale đi theo từng thứ. Lịch cố định nằm theo sale, không cứng theo cụm.",
  },
  {
    title: "4. Chỉnh công thức và capacity",
    href: "/settings",
    body: "Vào Cài đặt để chỉnh trọng số doanh số, số đơn, tiềm năng, khoảng cách, rủi ro, capacity điểm/ngày và số ngày làm việc/tháng. Tổng trọng số nên bằng 100%.",
  },
  {
    title: "5. Xem lịch tuyến tháng/ngày",
    href: "/planner",
    body: "Vào Planner để xem lịch theo ngày hoặc bảng chi tiết. Lịch có ngày dự kiến, sale, cụm nhỏ, STT đi, F, điểm tổng và cảnh báo min/max.",
  },
  {
    title: "6. Nhập thực hiện",
    href: "/planner",
    body: "Trong Planner, cập nhật trạng thái thực hiện, ngày đi thực tế, doanh số phát sinh, ghi chú và tick Cần bù nếu muốn ưu tiên tháng sau.",
  },
  {
    title: "7. Import/Export CSV",
    href: "/import-export",
    body: "Dùng Import/Export để tải file mẫu, import điểm bán, export lịch tuyến, import cộng dồn lịch sử thực hiện và export backup toàn bộ lịch sử.",
  },
  {
    title: "8. Xem bản đồ tuyến",
    href: "/route-map",
    body: "Vào Bản đồ tuyến để xem marker trên Leaflet + OpenStreetMap. Không cần Google API key. Có thể chọn START mặc định theo sale hoặc START riêng cho từng ngày.",
  },
  {
    title: "9. Xem báo cáo",
    href: "/reports",
    body: "Vào Báo cáo để xem kết quả theo tháng và theo sale: đi đủ, đi thiếu, cần bù, doanh số thực tế và các điểm lâu chưa ghé.",
  },
];

const frequencyRules = [
  ["F8", "8 lần/tháng, khách rất trọng điểm hoặc cần bám sát cao."],
  ["F4", "4 lần/tháng, ghé hằng tuần."],
  ["F2", "2 lần/tháng, chia W1-W3 hoặc W2-W4."],
  ["F1", "1 lần/tháng, lấp vào tuyến cùng cụm."],
  ["F0.5", "Khoảng 2 tháng ghé 1 lần, cần lưu lịch sử nhiều tháng để ưu tiên lại."],
  ["F0.3", "Khoảng 3 tháng ghé 1 lần hoặc CS từ xa, cần theo dõi điểm lâu chưa ghé."],
];

const practicalNotes = [
  "Nếu sale ở văn phòng/kho/nghỉ/nhận chỉ đạo khác, vào Planner thêm ngày sale không đi tuyến. App sẽ dời điểm sang ngày làm việc kế tiếp nếu còn ngày.",
  "Nếu mỗi ngày sale xuất phát khác nhau, vào Bản đồ tuyến chọn Riêng cho ngày, nhập START cho sale và ngày đó.",
  "Nếu import lịch sử thực hiện nhiều lần, app cộng dồn theo visitId. Trùng visitId thì cập nhật, tháng cũ không bị xóa.",
  "Nên bấm Export toàn bộ lịch sử định kỳ để backup vì MVP đang lưu dữ liệu trên trình duyệt.",
  "Khi gửi cho sale, nên export lịch theo sale rồi sale điền actualStatus, actualVisitDate, actualRevenue, note và gửi lại để import.",
];

export default function GuidePage() {
  return (
    <div>
      <PageHeader
        title="Hướng dẫn sử dụng"
        description="Tóm tắt toàn bộ luồng dùng Route Planner DMS để người mới có thể tự setup dữ liệu, xem lịch tuyến, nhập thực hiện và xuất báo cáo."
      />

      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        Quy trình khuyến nghị: chuẩn hóa điểm bán - gán cụm nhỏ - gán sale/khu vực - tạo Planner - sale đi tuyến - nhập/import thực hiện - tháng sau bù điểm chưa đi.
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-3">
          {steps.map((step) => (
            <div key={step.title} className="rounded-lg border border-line bg-white p-4 shadow-soft">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-extrabold text-ink">{step.title}</h2>
                <Link className="rounded-md border border-line px-3 py-1 text-sm font-bold text-ink hover:bg-slate-50" href={step.href}>
                  Mở màn hình
                </Link>
              </div>
              <p className="text-sm leading-6 text-muted">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="grid content-start gap-4">
          <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <h2 className="mb-3 font-extrabold text-ink">Quy tắc tần suất F</h2>
            <div className="grid gap-2 text-sm">
              {frequencyRules.map(([frequency, description]) => (
                <div key={frequency} className="rounded-md bg-slate-50 p-3">
                  <span className="font-black text-ink">{frequency}</span>
                  <span className="text-muted"> · {description}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <h2 className="mb-3 font-extrabold text-ink">Ghi nhớ khi vận hành</h2>
            <div className="grid gap-2 text-sm leading-6 text-muted">
              {practicalNotes.map((note) => (
                <div key={note} className="rounded-md bg-slate-50 p-3">
                  {note}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Bản đồ dùng OpenStreetMap để xem vị trí và đường nối theo STT đi. Đây chưa phải Directions theo đường phố thật, nên chưa tính chính xác thời gian di chuyển ngoài thực tế.
          </div>
        </div>
      </div>
    </div>
  );
}
