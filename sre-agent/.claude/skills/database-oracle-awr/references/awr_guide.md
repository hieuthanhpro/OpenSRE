# Tài liệu Hướng dẫn Phân tích AWR Report & Tối ưu Oracle Database
*(Biên soạn dựa trên phương pháp Chuyên gia Oracle Master Trần Văn Bình)*

## I. NGUYÊN TẮC CƠ BẢN VÀ THU THẬP MẪU

1. **Thu thập 2 Báo cáo AWR**:
   - **Baseline AWR**: Báo cáo trong thời gian hệ thống hoạt động bình thường, mượt mà.
   - **Incident AWR**: Báo cáo trong khoảng thời gian hệ thống gặp sự cố / bị lag / CPU tăng vọt.
   - So sánh 2 báo cáo này để thấy sự biến động của Wait Events và SQL ID phát sinh.

2. **Chia nhỏ khoảng thời gian AWR**:
   - Tránh lấy AWR quá dài (vd: 12-24 tiếng). Nên chia nhỏ AWR ra khoảng **30 - 60 phút** đúng thời điểm xảy ra sự cố để số liệu không bị làm phẳng (average out).

3. **Đánh giá Tải CPU (Host Cores vs DB CPU)**:
   - Nếu `DB CPU (s) / Per Second` > **Số CPU Cores của máy Host** $\rightarrow$ Hệ thống đang bị quá tải CPU nghiêm trọng.

---

## II. QUY TRÌNH PHÂN TÍCH VÀ QUY TẮC VÀNG TỐI ƯU

### 1. Phân tích Top Timed Foreground Events (Wait Events)
- **Quy tắc**: Chỉ tập trung xử lý **Top 3 - 5 sự kiện chờ hàng đầu** chiếm `% DB Time` lớn nhất.
- **Thời gian I/O lý tưởng**:
  - Thời gian chờ đọc đĩa `Avg wait (ms)` lý tưởng là **< 2ms - 10ms**.
  - Nếu `Avg wait` lên tới **50ms - 300ms** $\rightarrow$ Ổ đĩa Storage bị nghẽn I/O nặng hoặc thiếu Index dẫn tới đĩa phải đọc quá nhiều.

### 2. Chiến lược Tối ưu SQL (Top SQL Statistics)

> **QUY TẮC VÀNG**: Không cần tối ưu hàng trăm câu SQL. Trong mỗi đợt bảo trì, **chỉ cần tối ưu 3 - 5 câu SQL đứng đầu** chiếm % Total lớn nhất là đã giải quyết được > 80% hiệu năng của toàn bộ hệ thống DB.

#### ⚠️ ĐẶC BIỆT LƯU Ý CÁC CÂU LỆNH `Executions = 0` (hoặc 1):
- Trong bảng *SQL ordered by Elapsed Time* hay *CPU Time*, nếu thấy câu SQL có **`Executions = 0`** nhưng `Elapsed Time` lại rất lớn (vài nghìn đến hàng vạn giây):
  - **Lý do**: Đây là câu lệnh **đang chạy dở chưa xong** trong suốt khoảng thời gian lấy mẫu AWR!
  - **Hành động**: **BẮT BUỘC PHẢI ƯU TIÊN KIỂM TRA VÀ TỐI ƯU ĐẦU TIÊN!**

#### Tiêu chí lọc Top SQL cần tối ưu:
- **SQL ordered by Elapsed Time**: Tối ưu **2 - 3 câu đầu tiên** chiếm `% Total` lớn nhất (thường 2 câu đầu đã chiếm 40-70% tổng thời gian DB).
- **SQL ordered by CPU Time**: Tối ưu **2 câu đầu tiên** chiếm `% Total` CPU lớn nhất.
- **SQL ordered by User I/O Wait Time**: Tối ưu **2 câu đầu tiên**.
- **SQL ordered by Gets (Buffer Gets)**: Tối ưu **2 câu đầu tiên** (giảm đọc logic trên RAM).
- **SQL ordered by Reads (Physical Reads)**: Tối ưu **Top 5 câu đầu tiên** (giảm đọc đĩa vật lý).
- **SQL ordered by Parse Calls**: Tối ưu **Top 3 câu đầu tiên** (kiểm tra việc thiếu Bind Variables làm cho DB phải Hard Parse liên tục).
- **SQL ordered by Sharable Memory / Version Count**: Tối ưu **câu đầu tiên** ngốn Shared Pool.

---

## III. PHÂN TÍCH SỨC KHỎE Ổ ĐĨA & BỘ NHỚ (I/O & ADVISORY)

### 1. Phân tích I/O (IOStat & Tablespace/File IO Stats)
- Kiểm tra cột `Avg Tm (ms)` hoặc `Av Rd(ms)` / `Av Writes(ms)`:
  - **< 2ms - 10ms**: Tốt, đĩa chạy mượt.
  - **> 50ms - 300ms**: Cực kỳ chậm. Cần kiểm tra hạ tầng SAN/SSD Storage hoặc xem câu lệnh SQL nào đang bị Full Table Scan.

### 2. Tư vấn Cấp phát RAM (SGA / PGA Advisory)
- **PGA Memory Advisory**: Nhìn vào cột `PGA Target Est` và `Est Physical Reads` để tìm **Điểm ngọt (Sweet Spot)**. Nếu nâng PGA lên nữa mà chỉ số đọc đĩa không giảm thì dừng ở mức GB tối ưu đó.
- **SGA Target Advisory**: Xem bảng gợi ý dung lượng `SGA Size` với `Est DB Time (s)` và `Est Physical Reads` để đưa ra khuyến nghị chính xác dung lượng RAM (GB) cần bổ sung cho Server.
