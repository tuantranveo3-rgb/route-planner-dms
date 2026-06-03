# Route Planner DMS

MVP web app tối ưu tuyến bán hàng GT/MT theo cụm nhỏ phường/xã/cụm đường. App dùng Next.js, TypeScript, TailwindCSS, dữ liệu seed local và không cần login.

## Cài đặt

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Google Maps

Trang `Bản đồ tuyến` có thể hiển thị marker trên Google Maps nếu cấu hình API key:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

Ở Vercel, thêm biến này trong Project Settings -> Environment Variables rồi redeploy. App chỉ dùng Google Maps để hiển thị marker, START và polyline theo STT đi; không gọi Routes/Distance Matrix/Optimization nên chi phí thấp. Nếu chưa có API key, app tự dùng sơ đồ tọa độ nội bộ làm fallback.

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
- `F0.5`: 0.5 lần/tháng, khách nhỏ/xa, chỉ đi nếu còn capacity hoặc chuyển CS từ xa/Zalo/Telesales.
- `F0.3`: khoảng 0.3 lần/tháng, khách rất nhỏ/xa, ưu tiên CS từ xa nhưng vẫn ghi nhớ nếu chưa đi.

## Công thức chấm điểm

Logic nằm trong `src/lib/route-logic.ts`.

- Doanh số 3 tháng: 35%.
- Số đơn 3 tháng: 20%.
- Tiềm năng: 20%.
- Khoảng cách tâm cụm: 15%.
- Rủi ro mất khách/OOS/đối thủ: 10%.

Quy đổi F:

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
- `F1` rải 25% mỗi tuần.
- `F0.5` chỉ đưa vào nếu còn capacity, nếu không sẽ có trạng thái `CS từ xa`.
- `optimizeDailyRoute` sắp thứ tự trong ngày theo F, góc tuyến quanh tâm cụm và khoảng cách.

## Setup Khu Vực Và Sale

Màn `Phân vùng sale` cho phép setup trường hợp mỗi sale phụ trách một khu vực/quận:

- Sale có khu vực/quận phụ trách chính.
- Sale có danh sách cụm nhỏ phụ trách.
- Sale có backup khi nghỉ phép, họp hoặc nhận chỉ đạo khác.
- Sale có min/max số điểm đi mỗi ngày riêng.
- Planner vẫn lập tuyến theo cụm nhỏ trong khu vực, không gom cả quận thành một tuyến lớn.

Ví dụ: An Nguyễn phụ trách Quận 1, nhưng lịch vẫn tách `Q1-A` và `Q1-B`.

## Báo Cáo

Màn `Báo cáo` hỗ trợ:

- Báo cáo theo tháng.
- Lọc theo sale.
- Số lượt cần đi, hoàn tất, đi thiếu.
- Tỷ lệ hoàn thành.
- Số tuyến bù.
- Mix tần suất F8/F4/F2/F1/F0.5/F0.3.
- Theo dõi riêng F0.5/F0.3 chưa đi từ tháng trước được gợi ý sang tháng này.

## Theo dõi thực hiện tuyến và bù tháng sau

Trong màn hình Planner, mỗi lượt ghé có thể cập nhật thực tế:

- Trạng thái: `Chưa đi`, `Đã đi`, `Có đơn`, `Không có đơn`, `Không gặp khách`, `Dời lịch`, `CS từ xa`.
- Ngày sale thực ghé.
- Doanh số phát sinh.
- Ghi chú lý do chưa đi hoặc kết quả ghé.
- Tick `Cần bù` nếu muốn ép lượt đó vào danh sách bù tháng sau.

App tính KPI thực hiện:

- Lượt cần đi.
- Lượt đã hoàn tất.
- Lượt đi thiếu.
- Tỷ lệ hoàn thành.
- Bảng đủ/thiếu theo sale.

Khi chuyển sang tháng sau, các lượt tháng trước có record thực tế bị thiếu hoặc được tick `Cần bù` sẽ được chèn vào lịch mới:

- F8/F4/F2 ưu tiên W1-W2.
- F1 ưu tiên W2-W3.
- F0.5/F0.3 nếu chưa đi sẽ được ghi nhớ để ưu tiên gợi ý tháng sau.
- Vẫn bù theo cụm nhỏ, không gom theo quận lớn.
- Nếu bù làm vượt capacity, app hiển thị cảnh báo quá tải bù tuyến.

MVP lưu dữ liệu thực hiện bằng `localStorage` trên trình duyệt.

Tiện ích demo trong Planner:

- `Reset dữ liệu demo`: xóa toàn bộ trạng thái thực hiện đang lưu local trên trình duyệt.
- `Export theo filter`: chỉ xuất các dòng đang hiển thị sau khi lọc tuần/sale/cụm/F/trạng thái/tuyến bù.
- `Export toàn bộ`: xuất toàn bộ lịch tuyến của tháng đang chọn.
- Filter nhanh: `Chỉ tuyến bù`, `Chỉ tuyến thiếu`, `F4/F2 bị miss`.
- Planner cảnh báo nếu một sale/ngày thấp hơn min hoặc vượt max trong Cài đặt.

## Cài Đặt Min/Max Sale

Màn Cài đặt cho phép chỉnh thêm:

- `Min điểm sale/ngày`: mặc định 6 điểm.
- `Max điểm sale/ngày`: mặc định 15 điểm.

Planner sẽ đọc cấu hình này từ `localStorage`. Nếu sale có tuyến quá mỏng hoặc quá tải trong một ngày, app hiển thị cảnh báo để ASM ghép thêm điểm, dời điểm hoặc chuyển F0.5 sang CS từ xa.

## Import lịch sử tháng trước

Màn Import/Export có thêm khu vực `Import lịch sử thực hiện tháng trước`. File này dùng để mô phỏng kết quả sale đã đi tháng trước và tạo tuyến bù cho tháng sau.

Cột bắt buộc:

- `month`: tháng thực hiện, ví dụ `5`.
- `year`: năm thực hiện, ví dụ `2026`.
- `week`: `W1`, `W2`, `W3`, hoặc `W4`.
- `outletId`: mã điểm bán trùng với planner.
- `salePhuTrach`: sale phụ trách.
- `actualStatus`: một trong các trạng thái `Chưa đi`, `Đã đi`, `Có đơn`, `Không có đơn`, `Không gặp khách`, `Dời lịch`, `CS từ xa`.
- `actualVisitDate`: ngày ghé thực tế, ví dụ `2026-05-05`, có thể để trống.
- `actualRevenue`: doanh số phát sinh, có thể để trống.
- `note`: ghi chú lý do/kết quả.
- `carryToNextMonth`: `true` hoặc `false`.

Sau khi import lịch sử, vào Planner và chọn tháng sau. Các điểm có `carryToNextMonth=true` hoặc trạng thái chưa hoàn tất sẽ xuất hiện dưới dạng tuyến bù.

## Import/Export CSV

Vào màn hình Import/Export:

- Tải file mẫu từ `public/sample_outlets.csv`.
- Trong app, nút `Tải file mẫu` xuất CSV UTF-8 BOM để Excel trên Windows đọc đúng tiếng Việt.
- Import CSV danh sách điểm bán. App validate cột bắt buộc và báo lỗi tiếng Việt nếu thiếu.
- Export CSV lịch tuyến từ Planner hoặc màn hình Import/Export.

Hai cột hay dùng:

- `doanhSo3Thang`: tổng doanh số 3 tháng gần nhất của điểm bán, nhập số VND không dấu phẩy. Ví dụ `285000000`.
- `soDon3Thang`: tổng số đơn hàng 3 tháng gần nhất. Ví dụ `34`.

## Xử lý cụm quá tải

Nếu một cụm vượt capacity/ngày, Planner hiển thị cảnh báo: `Quá tải, cần tách cụm hoặc hạ tần suất`.

Cách xử lý đề xuất:

- Tách cụm phường/xã thành cụm nhỏ hơn.
- Chuyển một phần `F0.5` sang CS từ xa.
- Rà lại `F1/F2` nếu điểm tổng sát ngưỡng.
- Tăng ngày đi cố định hoặc thêm sale phụ trách cho cụm.
