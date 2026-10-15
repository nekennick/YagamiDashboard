# Chốt tồn theo chu kỳ 17:00 đến 17:00

## Goal
Tính tồn đầu/cuối ngày Kiểm tồn từ snapshot gần 17:00 theo giờ Việt Nam, trong đó tồn cuối ngày trước chính là tồn đầu ngày sau.

## Tasks
- [x] Đổi phạm vi chứng từ ngày sang 17:00 hôm trước–17:00 hôm nay và dùng chung snapshot tại ranh giới hai ngày.
- [x] Giữ tồn tạm tính cho ngày hiện tại khi chưa có snapshot 17:00.
- [x] Thêm kiểm thử cho mốc vận hành và chạy test, lint, type-check, build.

## Done When
- [x] Tồn cuối ngày trước và tồn đầu ngày sau lấy từ cùng snapshot gần 17:00.
- [x] Giao dịch sau 17:00 được tính vào ngày vận hành kế tiếp.
