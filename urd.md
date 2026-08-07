# I. SƠ ĐỒ KIẾN TRÚC TWO-PLANE & HYBRID RAG ROUTING (MERMAID)

Ông có thể copy đoạn mã dưới đây vào bất kỳ trình đọc Mermaid nào (như Notion, GitHub, Mermaid Live Editor) để hiển thị sơ đồ trực quan:

```mermaid
graph TD
    %% 1. Ingestion Layer
    subgraph INGESTION["1. TẦNG THU THẬP & LIÊN KẾT (INGESTION & CORRELATION)"]
        MS["Microservices (Java/Golang)"] -->|Trace Data (OTLP)| OT["Kafka Broker"]
        MS -->|Logs (GELF TCP)| GL["Graylog"]
        
        GL -->|Heuristic Filter| CB["obs-aggregator (Golang Combiner)"]
        OT -->|SERVER Spans Only| CB
    end

    %% 2. Ingestion Storage & Cache
    CB -->|1. Realtime Metrics| PM["Prometheus"]
    CB -->|2. Span Cache (TTL p99)| DF[("Dragonfly (Redis-compatible)")]
    CB -->|3. Enriched/Final Logs| PG[("PostgreSQL (tb_error_log)")]

    %% 3. Hot Path (Alert Plane)
    subgraph HOT_PATH["2. MẶT PHẲNG CẢNH BÁO NHANH (METRIC PLANE)"]
        PM -->|Alert Rules (PromQL)| AM["Grafana Alertmanager"]
        AM -->|Webhook Alert + Route + sample_trace_id| SRE_HUB["OpenSRE Control Plane (config-service)"]
    end

    %% 4. Cold Path (AI SRE Plane)
    subgraph COLD_PATH["3. MẶT PHẲNG PHÂN TÍCH & TỰ ĐỘNG KHẮC PHỤC (AI SRE PLANE)"]
        SRE_HUB --> SRE_ENGINE["OpenSRE Agent Engine (sre-agent)"]
        
        USER_INTERACT["Người dùng / Engineer (Web Console / Slack / MS Teams)"] -->|Truy vấn trực tiếp / Giao tiếp| SRE_ENGINE

        SRE_ENGINE --> L1_ROUTER{"Level-1 Query Router (LogRouter)"}
        
        %% Deterministic Path
        L1_ROUTER -->|A. Alert tự động (Có sample_trace_id)| DET_PATH["Deterministic Path (Bypass RAG)"]
        DET_PATH -->|Truy vấn SQL Forensic| PG
        PG -->|Top Logs Cascade theo Trace ID| RCA_ENG["RCA Agent (Claude Agent SDK / DeepSeek-R1)"]

        %% Probabilistic Path (Hybrid RAG)
        L1_ROUTER -->|B. Câu hỏi mập mờ / Tra cứu Runbook| PROB_PATH["Probabilistic Path (Hybrid RAG)"]
        PROB_PATH -->|Tìm kiếm từ khóa BM25| DR["Apache Druid / Elasticsearch"]
        PROB_PATH -->|Tìm kiếm ngữ nghĩa pgvector| PG_VEC[("PostgreSQL + pgvector / Neo4j GraphRAG")]
        DR & PG_VEC --> RRF["RRF Fusion (k=60) & Cross-Encoder"]
        RRF -->|Top-10 Chunks + Runbook Tri thức| RCA_ENG
        
        %% Skills Integration
        RCA_ENG -->|51 Production Skills| SKILLS["Skills Integration (K8s, Grafana, Datadog, AWS, PagerDuty)"]
        
        %% UI / Chatbots Output
        RCA_ENG -->|Trả lời & Báo cáo chẩn đoán| USER_INTERACT
    end

    %% 5. Remediation & Governance
    subgraph GOVERNANCE["4. TẦNG QUẢN TRỊ & KHẮC PHỤC (GOVERNANCE LAYER)"]
        RCA_ENG -->|Sinh kịch bản tự động| REM_AGT["Remediation Agent"]
        REM_AGT -->|Model Context Protocol (MCP)| HITL{"Human-in-the-Loop Gate"}
        HITL -->|DevOps Approve| EXC["Ansible Playbook / Git Rollback / Vá Code"]
        EXC -->|Lưu vết episode mới| MEM[("Episodic Memory (Neo4j)")]
    end

    %% Style Configurations
    style INGESTION fill:#f5f7fa,stroke:#6c7a89,stroke-width:2px;
    style HOT_PATH fill:#fff3cd,stroke:#d39e00,stroke-width:2px;
    style COLD_PATH fill:#d1ecf1,stroke:#17a2b8,stroke-width:2px;
    style GOVERNANCE fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style L1_ROUTER fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    style USER_INTERACT fill:#e2e3e5,stroke:#383d41,stroke-width:2px;
```

---

## II. KỊCH BẢN ON-CALL THỰC TẾ LÚC 3 GIỜ SÁNG (SCENARIO)

**Bối cảnh sự cố:** Vào lúc 02:45 sáng, đội DevOps thực hiện deploy một phiên bản cập nhật cấu hình định tuyến mới cho `api-gateway`. Vào lúc 03:00 sáng, hệ thống thanh toán qua cổng VNPay đột ngột sụt giảm giao dịch thành công nghiêm trọng, khách hàng liên tục gặp lỗi timeout.

### 📌 Bước 1: Phát hiện và Cảnh báo Tức thời (Hot Path - Metric Plane)
* Golang Combiner (`obs-aggregator`) liên tục tiếp nhận luồng logs từ Graylog và traces từ Kafka. Nó xử lý bất đồng bộ ở tốc độ sub-millisecond, bóc tách các SERVER spans lỗi để tăng ngay các số liệu đếm số lượng lỗi `app_error_logs_total` và độ trễ `http_request_duration_seconds`.
* Vào lúc 03:00:00, Prometheus quét metrics và phát hiện:
  * Tỷ lệ lỗi HTTP 5xx của dịch vụ VNPay vượt quá 5% trong 3 phút liên tiếp.
  * Độ trễ p95 Latency của route `/v2/payment/checkout` vượt quá 15 giây.
* Prometheus nổ alert khẩn cấp. Alertmanager bốc một mẫu log lỗi gần nhất, trích xuất `sample_trace_id: "t_pay_998844_vnpay"` và bắn Webhook chứa thông tin lỗi cùng mã định danh này sang OpenSRE Agentic Hub (Config Service & SRE Agent).

---

### 📌 Bước 2: Kích hoạt OpenSRE và Chạy luồng Định tính (Deterministic Path)
* Vào lúc 03:00:05, OpenSRE nhận Webhook. Level-1 Router (LogRouter) quét payload và phát hiện sự hiện diện của `sample_trace_id` cứng cùng route: `"/v2/payment/checkout"`.
* L1 Router lập tức bẻ luồng sang **Deterministic Path**, bỏ qua hoàn toàn cơ chế Hybrid RAG (không chạy pgvector, không chạy BM25). Điều này giúp hệ thống của bên mình:
  * Tránh hoàn toàn sai số xấp xỉ của vector search.
  * Bypass các bước suy luận GPU đắt đỏ để đạt tốc độ xử lý sub-second.
* OpenSRE kích hoạt Custom PostgreSQL Skill thực thi câu lệnh SQL định tính trực tiếp vào PostgreSQL `tb_error_log` để bốc toàn bộ 45 dòng log cascade liên dịch vụ có chung `trace_id: "t_pay_998844_vnpay"` (từ API Gateway → Payment Service → VNPay Connector) theo mốc thời gian thực tế.
* Toàn bộ bối cảnh bao gồm cả HTTP payload `request_body` và `response_body` tại điểm sụp đổ của VNPay Connector được trích xuất đầy đủ và cực kỳ sạch sẽ (đã qua bộ lọc rác heuristic và che giấu PII của Graylog/Presidio từ trước).

---

### 📌 Bước 3: Suy luận Nhân quả bằng DeepSeek-R1 / Claude Agent SDK
* Vào lúc 03:00:15, OpenSRE đóng gói chuỗi logs cascade, metadata và kiến trúc microservices thanh toán nạp thẳng vào LLM Engine (DeepSeek-R1 Distilled 70B / Claude Agent SDK) running trong hệ thống.
* Mô hình R1 bắt đầu lập luận suy nghĩ từng bước bên trong thẻ `<think>`.
* Vào lúc 03:00:30, RCA Agent xuất ra báo cáo chẩn đoán bằng tiếng Việt rõ ràng, chỉ đích danh lỗi nằm ở bản cập nhật lúc 02:45 của `api-gateway` gây mất IP nguồn dẫn đến sai checksum gửi sang ngân hàng.

---

### 📌 Bước 4: Khắc phục & Rào chắn bảo vệ (Human-in-the-Loop)
* Remediation Agent tự động sinh ra kịch bản sửa lỗi ngắn hạn: Tạo tệp cấu hình Ansible để rollback dịch vụ `api-gateway` về phiên bản ổn định liền trước đó.
* Vì hành động rollback hệ thống thanh toán có tính chất không thể đảo ngược (irreversible) và ảnh hưởng trực tiếp đến dòng tiền, hệ thống kích hoạt rào chắn bảo vệ mức "Approved" (Human-in-the-loop).
* Hệ thống bắn một card tương tác lên kênh Slack On-call của đội DevOps với nội dung chẩn đoán chi tiết và nút bấm: **[Xác nhận Rollback API Gateway]**.
* Kỹ sư trực sự cố thức dậy, chỉ mất chưa đầy 15 giây để đọc hiểu toàn bộ nguyên nhân lỗi thay vì phải ngồi dò logs thủ công. Kỹ sư nhấn nút **[Xác nhận Rollback API Gateway]** ngay trên Slack.
* Model Context Protocol (MCP) Gateway nhận lệnh phê duyệt, gọi Ansible thực thi rollback an toàn. Hệ thống hoạt động bình thường trở lại vào lúc 03:02:15.
* Toàn bộ chuỗi sự cố, vết chẩn đoán và cách khắc phục được ghi nhận vào Episodic Memory trên Neo4j của OpenSRE để làm giàu runbook động cho các lần xử lý sau.

---

## III. CHUYÊN NGHỆP HÓA: KỊCH BẢN TẬP TRUNG GIÁM SÁT & CHẨN ĐOÁN DATABASE (HIGH DISK I/O)

Khi bạn bắt đầu tập trung vào **Monitor Database (Postgres / MySQL / Oracle)**, trường hợp thường gặp nhất là cảnh báo **High Disk I/O (I/O Read/Write Utilization > 90% hoặc High IOPS)**. Dưới đây là cách OpenSRE tự động tiếp nhận và chẩn đoán tận gốc:

### 1. Luồng Tự Động Chẩn Đoán Của OpenSRE Khi Nhận Alert High I/O

```
[Prometheus / Grafana Alert] 
  │ (Cảnh báo High Disk I/O trên DB Host)
  ▼
OpenSRE Agentic Hub 
  │
  ├── 1. Kích hoạt Database Diagnostics Skill
  │      ├── Truy vấn pg_stat_activity (Sessions active có wait_event_type = 'IO')
  │      ├── Truy vấn pg_stat_statements (Lấy Top câu Query tốn I/O Read/Write nhất)
  │      └── Truy vấn pg_statio_user_tables (Tìm bảng bị Sequential Scan liên tục)
  │
  ├── 2. Phân tích Nguyên nhân (RCA Engine)
  │      ├── Xác định chính xác câu SQL gây nghẽn đĩa
  │      └── Phát hiện lý do: Thiếu Index / Full Table Scan / Spilling Temp Disk File
  │
  └── 3. Xuất Báo cáo & Đề xuất Hướng Xử lý Khắc phục (Slack / Web UI)
```

---

### 2. Chi Tiết Kịch Bản Chẩn Đoán Thực Tế (Phân Tích & Chỉ Đích Danh Query)

#### **Bước 1: Prometheus Bắn Alert**
* **Metric Alert:** `PostgreSQLHighDiskIO` trên DB instance `db-payment-primary`.
* Prometheus gửi Webhook Alert chứa thông tin: `host: db-payment-primary`, `db_name: payment_db`, `severity: critical`.

#### **Bước 2: OpenSRE Gọi Postgres Skill Để Trích Xuất Telemetry DB**
AI Agent chạy các câu truy vấn chẩn đoán chuyên sâu (Database Diagnostic Queries):
1. **Bốc các câu lệnh đang bị nghẽn I/O (`wait_event_type = 'IO'`):**
   ```sql
   SELECT pid, usename, query, wait_event_type, wait_event, state, age(clock_timestamp(), query_start) as duration
   FROM pg_stat_activity
   WHERE state = 'active' AND wait_event_type = 'IO'
   ORDER BY duration DESC;
   ```
2. **Bốc Top câu SQL tiêu tốn Block Read nhiều nhất từ `pg_stat_statements`:**
   ```sql
   SELECT queryid, query, calls, total_exec_time, blk_read_time, blk_write_time,
          (shared_blks_read + local_blks_read) AS total_blocks_read
   FROM pg_stat_statements
   ORDER BY total_blocks_read DESC LIMIT 5;
   ```

#### **Bước 3: AI Phân Tích & Xác Định Nguyên Nhân Gốc Rễ**
OpenSRE đối chiếu kết quả và chỉ ra:
* **Câu SQL chính gây sụp đổ Disk I/O:**
  ```sql
  SELECT * FROM tb_transaction 
  WHERE status = 'PENDING' AND created_at >= '2026-08-04 00:00:00';
  ```
* **Nguyên nhân kỹ thuật:** Bảng `tb_transaction` chứa **18 triệu dòng dữ liệu**, nhưng cột `created_at` **chưa được đánh Index**. Hàng trăm request đồng thời gọi câu lệnh này khiến Database phải thực hiện **Full Sequential Scan (`seq_scan`)**, đọc hàng triệu block từ ổ cứng liên tục, làm trần Disk Read I/O lên **99%**.

---

### 3. Đề Xuất Hướng Giải Quyết Của OpenSRE (Action Plan)

OpenSRE xuất ra báo cáo hành động chi tiết 2 cấp độ cho kỹ sư DB / DevOps:

#### 🟢 **Giải pháp Khẩn cấp (Short-term Immediate Action):**
1. **Tạo Index Online không gây lock bảng (`CONCURRENTLY`):**
   ```sql
   CREATE INDEX CONCURRENTLY idx_tb_transaction_created_at_status 
   ON tb_transaction (created_at, status);
   ```
2. **Trường hợp Query bị kẹt gây nghẽn hàng đợi (If Blocking Sessions):**
   Đề xuất lệnh hủy nhẹ tiến trình đang treo:
   ```sql
   SELECT pg_cancel_backend(<PID>);
   ```

#### 🟡 **Giải pháp Dài hạn (Long-term Optimization):**
1. **Tối ưu cấu hình bộ nhớ bộ đệm DB:**
   * Tăng `work_mem` cho các câu lệnh JOIN/Sort phức tạp để tránh việc Postgres phải ghi file đệm tạm xuống đĩa cứng (`temp_bytes_written`).
   * Tăng `shared_buffers` phù hợp với RAM của DB Server để giữ dữ liệu nóng trên RAM thay vì đọc từ đĩa.
2. **Cấu hình Autovacuum & Partitioning:**
   * Áp dụng Partitioning theo tháng (`created_at`) cho bảng `tb_transaction` để giới hạn phạm vi quét dữ liệu.

---

## IV. KỊCH BẢN THỰC TẾ: CHẨN ĐOÁN CẢNH BÁO TRÀN ĐĨA `/var/log` (>90%) TRÊN MÁY CHỦ `10.36.141.11`

Giả sử hệ thống giám sát (Zabbix / Prometheus) bắn về một cảnh báo thực tế như sau:

```text
SRV_10.36.141.11    [ID 1066][10.36.141.11] /var/log: Disk space is critically low (used > 90%)    Space used: 15.54 GB of 18.16 GB (90.2378 %)    10h 16m 9s    Update        
type: monitor
component: storage
filesystem: /var/log
```

Dưới đây là cách OpenSRE tự động tiếp nhận, chẩn đoán file log gây phình to và đưa ra hướng xử lý:

### 1. Luồng Tiếp Nhận & Chẩn Đoán Tự Động Của OpenSRE

```
[Alert từ Zabbix / Grafana] 
  │ (Server: 10.36.141.11, Filesystem: /var/log, Used: 90.24%)
  ▼
OpenSRE Agentic Hub 
  │
  ├── 1. Kích hoạt Linux Host Diagnostics Skill (SSH / Agent Probe)
  │      ├── Chạy `du -ah /var/log | sort -rh | head -n 10` (Tìm file log lớn nhất)
  │      ├── Chạy `lsof +L1 /var/log` (Kiểm tra unlinked open files bị kẹt FD)
  │      └── Đọc 50 dòng log cuối của file phình to (Phân tích nguyên nhân ghi log rác)
  │
  ├── 2. Phân tích Nguyên nhân (RCA Engine)
  │      ├── Xác định chính xác tệp: `/var/log/postgres/postgresql-2026-08-04.log` (11.2 GB)
  │      └── Lý do: Bật log_statement='all' + logrotate bị lỗi permission không xoay log
  │
  └── 3. Báo cáo & Hướng giải quyết Khẩn cấp (Slack / Web UI)
         ├── Giải phóng an toàn: `truncate -s 0 /var/log/postgres/postgresql-2026-08-04.log`
         └── Sửa cấu hình: Tắt log_statement='all' & Cấu hình maxsize cho logrotate
```

---

### 2. Chi Tiết Kịch Bản Chẩn Đoán Thực Tế Trên Server `10.36.141.11`

#### **Bước 1: Tiếp nhận Alert**
Webhook chứa các thông tin:
* **Server Name:** `SRV_10.36.141.11`
* **IP:** `10.36.141.11`
* **Filesystem:** `/var/log`
* **Dung lượng dùng:** `15.54 GB / 18.16 GB (90.24%)`

#### **Bước 2: OpenSRE Gọi Linux Storage Skill Thực Thi Kiểm Tra**
OpenSRE kết nối tới server `10.36.141.11` qua SSH/Agent probe và thực thi các câu lệnh chẩn đoán:
1. **Tìm danh sách tệp phình to nhất trong `/var/log`:**
   ```bash
   du -ah /var/log | sort -rh | head -n 10
   ```
   *Kết quả tìm ra:* Tệp `/var/log/postgres/postgresql-2026-08-04.log` có dung lượng lên tới **11.2 GB** (chiếm hơn 70% tổng dung lượng toàn phân vùng `/var/log`).

2. **Kiểm tra tiến trình đang ghi vào tệp này:**
   ```bash
   lsof /var/log/postgres/postgresql-2026-08-04.log
   ```
   *Kết quả:* Tiến trình `postgres` (PID `21342`) đang mở file descriptor và liên tục ghi log với tốc độ ~5MB/s.

3. **Phân tích nội dung log bị tràn (Log Inspection):**
   OpenSRE đọc 30 dòng cuối tệp log:
   ```text
   2026-08-04 11:42:01.123 ICT [21342] LOG: statement: SELECT * FROM tb_error_log WHERE ...
   2026-08-04 11:42:01.124 ICT [21342] LOG: statement: SELECT * FROM tb_error_log WHERE ...
   ```
   *Kết luận nguyên nhân:* Cấu hình PostgreSQL trên máy chủ `10.36.141.11` bị bật nhầm `log_statement = 'all'` (ghi log TẤT CẢ mọi câu SQL query), kết hợp với việc tệp `/etc/logrotate.d/postgresql` bị lỗi quyền không thực hiện xoay log định kỳ.

---

### 3. Đề Xuất Hướng Giải Quyết Của OpenSRE (Action Plan)

OpenSRE xuất ra báo cáo xử lý 2 bước an toàn cho đội DevOps:

#### 🟢 **Giải pháp Khẩn cấp (Short-term Immediate Action):**
1. **Truncate giải phóng dung lượng đĩa an toàn (Không dùng `rm` để tránh kẹt File Descriptor):**
   ```bash
   truncate -s 0 /var/log/postgres/postgresql-2026-08-04.log
   ```
   *Kết quả:* Dung lượng `/var/log` lập tức giảm từ **90.2%** xuống **28.7%** (giải phóng ngay **11.2 GB** ổ đĩa mà không làm gián đoạn PostgreSQL).

2. **Ép chạy logrotate thủ công:**
   ```bash
   logrotate -f /etc/logrotate.d/postgresql
   ```

#### 🟡 **Giải pháp Dài hạn (Long-term Optimization):**
1. **Sửa cấu hình PostgreSQL (`postgresql.conf`):**
   Chuyển `log_statement = 'none'` (hoặc `'ddl'`) và chỉ ghi log câu SQL chậm:
   ```ini
   log_statement = 'ddl'
   log_min_duration_statement = 2000 # Chỉ ghi log câu SQL chạy > 2 giây
   ```
2. **Bổ sung policy giới hạn kích thước file trong Logrotate:**
   Cập nhật `/etc/logrotate.d/postgresql`:
   ```text
   /var/log/postgres/*.log {
       daily
       rotate 7
       maxsize 1G
       compress
       missingok
       notifempty
   }
   ```