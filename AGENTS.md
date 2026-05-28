# AGENTS.md

- UI phải dùng tiếng Việt.
- Không gom tuyến theo quận/huyện lớn.
- Luôn dùng cụm nhỏ phường/xã/cụm đường làm đơn vị lập tuyến.
- Logic route phải nằm trong `src/lib/route-logic.ts`.
- Sau khi sửa logic phải chạy `npm run test`.
- Không để Planner trống; luôn có dữ liệu seed hoặc dữ liệu import hợp lệ.
- Không dùng API trả phí trong MVP.
