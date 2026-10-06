# Hướng Dẫn Sử Dụng Nền Tảng OpenSRE (AI SRE Platform)

Tài liệu này hướng dẫn chi tiết cách vận hành, khởi chạy và tương tác với hệ thống **OpenSRE** - Nền tảng AI SRE tự động điều tra sự cố vận hành, giám sát hạ tầng và cơ sở dữ liệu.

---

## 1. Tổng Quan Kiến Trúc Nền Tảng

OpenSRE kết hợp sức mạnh của các mô hình LLM (Agentic AI) cùng với hệ thống Bộ nhớ Sự cố (Episodic Memory) và Đồ thị Tri thức (Knowledge Graph trên Neo4j) để hỗ trợ kỹ sư SRE/DevOps tự động hóa quá trình xử lý sự cố.

```
Web UI (Console Cổng 3002) ──> sre-agent (Claude Agent SDK / Cổng 8001)
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
          Memory System      Skill Modules      Knowledge Graph
         (Neo4j Episodic)   (Oracle, Graylog)   (Topology Neo4j)
```

### Các Thành Phần Chính:
* **Web UI (`web_ui`)**: Giao diện điều khiển console (Next.js), mở tại cổng `3002`.
* **SRE Agent (`sre-agent`)**: Core AI engine điều phối công việc, chạy các skill điều tra sự cố, mở tại cổng `8001` (hoặc `8000`).
* **Config Service (`config_service`)**: Dịch vụ quản lý cấu hình tập trung (Org/Team hierarchy), mở tại cổng `8081`.
* **Neo4j (`opensre-neo4j`)**: Lưu trữ Knowledge Graph topology và bộ nhớ sự cố (Episodic Memory).
* **PostgreSQL (`opensre-postgres`)**: Lưu trữ dữ liệu hệ thống và cấu hình.

---

## 2. Khởi Chạy Nền Tảng

### 2.1 Kiểm tra trạng thái các dịch vụ Docker

Hệ thống được đóng gói hoàn toàn trong Docker Compose. Bạn có thể kiểm tra danh sách container đang chạy:

```bash
docker compose ps
```

Nếu các dịch vụ chưa khởi chạy, kích hoạt bằng lệnh:

```bash
docker compose up -d
```

Hoặc qua Makefile:

```bash
make dev
```

---

## 3. Hướng Dẫn Sử Dụng Giao Diện Web UI

1. Truy cập vào trình duyệt theo địa chỉ:
   `http://<IP_SERVER>:3002` (Ví dụ: `http://10.38.130.95:3002` hoặc `http://localhost:3002`).

2. **Tạo Cuộc Điều Trợ/Chat Mới (New Investigation)**:
   * Bấm vào nút **New Investigation** hoặc thanh nhập prompt bên dưới.
   * Nhập các yêu cầu điều tra bằng tiếng Việt hoặc tiếng Anh.

3. **Theo Dõi Tiến Trình Suy Luận Của AI**:
   * Giao diện sẽ hiển thị từng bước suy luận (Reasoning stream).
   * Các Skill/Tool được AI tự động gọi (ví dụ: truy vấn Oracle DB, tra cứu log Graylog, đọc file AWR) sẽ được hiển thị chi tiết theo thời gian thực.

---

## 4. Hướng Dẫn Tương Tác Giám Sát Oracle DB

Hệ thống tích hợp sẵn các Skill chuyên biệt dành cho Oracle Database.

### 4.1 Quy Tắc Định Danh Oracle DB
* Oracle DB được định danh dựa theo **octet cuối của địa chỉ IP**.
* *Ví dụ*: Oracle DB tại IP `10.38.130.91` hoặc `10.36.88.114` được gọi tên là **oracle 91** hoặc **oracle 114** (tham số tìm kiếm log: `log_ip: 10.38.130.91` hoặc `source: 10.38.130.91`).

### 4.2 Các Câu Prompt Mẫu Phổ Biến

#### A. Kiểm Tra Trạng Thái & Phiên Hoạt Động (Monitoring):
> *"Kiểm tra kết nối và trạng thái các active sessions trên Oracle DB 114 (10.38.130.91)"*  
> *"Kiểm tra tình trạng locks, slow SQL và tài nguyên tablespace trên Oracle DB"*

#### B. Phân Tích Báo Cáo AWR (AWR Analysis):
> *"Phân tích file AWR report mới nhất trong thư mục /app/awr/orcl/ và đưa ra đánh giá các câu lệnh SQL tốn tài nguyên nhất"*  
*(Lưu ý: Nếu không chỉ định đường dẫn file, AI sẽ tự động chọn file báo cáo `.html` mới nhất trong `/app/awr/orcl/`)*

#### C. Tra Cứu Log Database Trên Graylog:
> *"Tìm kiếm các log lỗi liên quan đến Oracle DB 114 trong Graylog với log_ip: 10.38.130.91 trong 1 giờ qua"*  
*(AI sẽ tự động truy vấn stream `Database Log stream` với giới hạn limit từ 20-50 dòng)*

---

## 5. Tương Tác Qua REST API (cURL / Programmatic)

Bạn cũng có thể gửi yêu cầu trực tiếp tới `sre-agent` qua API endpoint `/investigate` bằng cURL:

```bash
curl -N -X POST http://localhost:8001/investigate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Kiểm tra kết nối và trạng thái của Oracle DB 114 (10.38.130.91)",
    "thread_id": "session-test-01"
  }'
```

---

## 6. Các Quy Định & Best Practices

1. **Truy vấn Graylog**: Luôn giới hạn số lượng log thu thập (`--limit` từ 20 - 50 dòng) để tránh quá tải dữ liệu.
2. **Oracle Client Mode**: Môi trường `sre-agent` đã cài đặt sẵn Oracle Instant Client tại `/opt/oracle/instantclient_23_26` và kích hoạt **Thick Mode** hỗ trợ đầy đủ các phiên bản Oracle DB (bao gồm 11g, 12c, 19c...).
3. **Mở Rộng Skill**: Tất cả các skill xử lý sự cố nằm trong thư mục `sre-agent/.claude/skills/`. Bạn có thể bổ sung các script python hoặc file `SKILL.md` mới tại đây để mở rộng năng lực cho AI Agent.
