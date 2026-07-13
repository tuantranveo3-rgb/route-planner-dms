# Route Planner DMS

MVP web app lập tuyến bán hàng GT/MT theo cụm nhỏ phường/xã/cụm đường. App dùng Next.js, TypeScript, TailwindCSS, dữ liệu seed local và không cần login.

## Cài đặt

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Supabase Auth/DB

App hỗ trợ Supabase cho tài khoản đăng nhập thật. Nếu chưa cấu hình Supabase, app tự fallback về 3 user demo local.

Biến môi trường cần có:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Setup nhanh:

1. Tạo project Supabase.
2. Vào SQL Editor, chạy file `supabase/schema.sql`.
3. Vào Authentication > Users, tạo user email theo dạng:
   - `sep@route-planner-dms.local`
   - `sua@route-planner-dms.local`
   - `xem@route-planner-dms.local`
4. Copy `id` của từng user và insert vào bảng `user_profiles` theo mẫu cuối file `supabase/schema.sql`.
5. Thêm 3 biến môi trường trên vào Vercel rồi Redeploy.

Sau khi Supabase hoạt động, trang `User & quyền` có thể tạo user mới. App quy đổi username ngắn thành email nội bộ, ví dụ `gia-hung` thành `gia-hung@route-planner-dms.local`.

## Bản đồ tuyến

Trang `Bản đồ tuyến` dùng Leaflet.js + OpenStreetMap để hiển thị:

- Marker điểm bán theo tọa độ `toaDoX`/`toaDoY`.
- Marker START theo từng sale hoặc riêng từng ngày.
- Đường nối theo STT đi trong ngày.
- Màu marker theo F.

Không cần Google Maps API key, không cần billing. Đường nối hiện là đường thẳng theo thứ tự ghé dự kiến, chưa phải chỉ đường thực tế theo đường phố.

## Kiểm tra

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## F8/F4/F2/F1/F0.5/F0.3

- `F8`: 8 lần/tháng, khách cực trọng điểm, ghé khoảng 2 lần/tuần.
- `F4`: 4 lần/tháng, khách trọng điểm, ghé hằng tuần.
- `F2`: 2 lần/tháng, khách tăng trưởng, chia W1-W3 hoặc W2-W4.
- `F1`: 1 lần/tháng, khách duy trì, lấp vào tuyến cùng cụm.
- `F0.5`: 0.5 lần/tháng, khách nhỏ/xa, khoảng 2 tháng ghé 1 lần.
- `F0.3`: 0.3 lần/tháng, khách rất nhỏ/xa; mỗi tháng kéo khoảng 30% danh sách F0.3 của từng sale vào tuyến trực tiếp, phần còn lại CS/theo dõi chu kỳ.

Nếu file import có cột `ghiNhanF`, app dùng F đó để lập tuyến. Nếu thiếu `ghiNhanF`, app tự tính F theo điểm.

## Công thức chấm điểm

Logic nằm trong `src/lib/route-logic.ts`.

- Doanh số 3 tháng: 35%.
- Số đơn 3 tháng: 20%.
- Tiềm năng: 20%.
- Khoảng cách tâm cụm: 15%.
- Rủi ro mất khách/OOS/đối thủ: 10%.

Quy đổi F tự tính:

- Tổng điểm >= 92: `F8`.
- Tổng điểm >= 80: `F4`.
- Tổng điểm >= 60 và < 80: `F2`.
- Tổng điểm >= 40 và < 60: `F1`.
- Tổng điểm >= 25 và < 40: `F0.5`.
- Tổng điểm < 25: `F0.3`.

## Tạo lịch tuyến

`generateMonthlyRoutePlan(month, year, outlets, clusters, settings)` tạo lịch tháng theo cụm nhỏ:

- `F8` khóa 8 lượt/tháng, 2 lượt mỗi tuần.
- `F4` khóa trước ở W1, W2, W3, W4.
- `F2` chia đều W1-W3 hoặc W2-W4.
- `F1` rải đều trong tháng.
- `F0.5` kéo khoảng 50% danh sách/tháng; `F0.3` kéo khoảng 30% danh sách/tháng, tính riêng theo từng sale và từng F. Các điểm chưa tới quota tháng vẫn hiện CS/từ xa để theo dõi, còn điểm quá hạn/miss sẽ được ưu tiên bù.
- `optimizeDailyRoute` sắp thứ tự trong ngày theo F, góc tuyến quanh START/tâm cụm và khoảng cách.

Planner không gom tuyến theo quận lớn. Mọi tuyến phải đi theo cụm nhỏ như `Q1-A`, `BT-A`, `PN-A`.

## Setup sale và khu vực

Màn `Phân vùng sale` cho phép:

- Gán sale theo quận/khu vực phụ trách.
- Gán sale theo cụm nhỏ.
- Chỉnh min/max số điểm đi mỗi ngày riêng từng sale.
- Chọn cụm sale đi theo từng thứ trong tuần.
- Chọn sale backup khi nghỉ phép, họp, đi kho hoặc nhận chỉ đạo khác.

Ví dụ: hai sale đều có thể đi Thứ 2, nhưng mỗi sale đi cụm khác nhau. Lịch cố định nằm ở cấu hình sale, không nằm cứng ở cụm.

## Theo dõi thực hiện và bù tháng sau

Trong Planner, mỗi lượt ghé có thể cập nhật:

- Trạng thái: `Chưa đi`, `Đã đi`, `Có đơn`, `Không có đơn`, `Không gặp khách`, `Dời lịch`, `CS từ xa`.
- Ngày sale thực ghé.
- Doanh số phát sinh.
- Ghi chú lý do chưa đi hoặc kết quả ghé.
- Tick `Cần bù` nếu muốn ưu tiên tháng sau.

Import lịch sử thực hiện là cộng dồn. Trùng `visitId` thì cập nhật record đó, dữ liệu tháng/năm cũ không bị xóa.

## Import/Export CSV

Màn `Import/Export` hỗ trợ:

- Tải file mẫu điểm bán.
- Import CSV điểm bán.
- Import cộng dồn lịch sử thực hiện.
- Export lịch tuyến theo tháng/sale/filter.
- Export toàn bộ lịch sử để backup.

Cột hay dùng:

- `doanhSo3Thang`: tổng doanh số 3 tháng gần nhất, nhập số VND không dấu phẩy.
- `soDon3Thang`: tổng số đơn hàng 3 tháng gần nhất.
- `ghiNhanF`: F do công ty/chủ quản quy định, ví dụ `F4`, `F2`, `F0.5`.
- `toaDoX`: kinh độ nếu dùng bản đồ thật.
- `toaDoY`: vĩ độ nếu dùng bản đồ thật.

File CSV nên dùng UTF-8 BOM để Excel Windows đọc đúng tiếng Việt.

## Xử lý quá tải

Nếu một sale/ngày vượt max hoặc một cụm vượt capacity, Planner sẽ cảnh báo.

Cách xử lý đề xuất:

- Tách cụm phường/xã thành cụm nhỏ hơn.
- Chuyển một phần `F0.5`/`F0.3` sang CS từ xa.
- Dời điểm sang ngày khác trong cùng cụm.
- Thêm sale phụ trách hoặc sale backup.
- Rà lại F nếu điểm đã xuống thấp nhưng vẫn đang giữ F cao.

## Ghi chú MVP

Dữ liệu đang lưu trên trình duyệt bằng `localStorage`. Khi demo nhiều máy/người dùng, mỗi máy sẽ có dữ liệu riêng. Muốn dùng vận hành thật cho nhiều sale cần bổ sung database, login và phân quyền.
