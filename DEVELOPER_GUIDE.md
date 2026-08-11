# OpenSRE Developer Guide 🚀

Tài liệu này hướng dẫn chi tiết các câu lệnh thường dùng, cách vận hnh qua Docker và cách xem log gỡ lỗi (debug) dành cho lập trình viên phát triển dự án OpenSRE.

---

## 🐋 1. Các lệnh Docker Compose thường dùng

Dự án sử dụng Docker Compose để quản lý các service (`sre-agent`, `litellm`, `config-service`, `neo4j`, v.v.).

### Khởi động hệ thống
* **Khởi động tất cả các service (chạy ngầm)**:
  ```bash
  docker compose up -d
  ```
* **Khởi động kèm theo LiteLLM Proxy (sử dụng Profile)**:
  ```bash
  docker compose --profile litellm up -d
  ```
* **Build lại toàn bộ containers trước khi khởi động**:
  ```bash
  docker compose up -d --build
  ```

### Dừng hệ thống
* **Dừng tất cả containers (không mất dữ liu volume)**:
  ```bash
  docker compose down
  ```
* **Dừng và xóa sạch toàn bộ volumes (Neo4j, cache, sessions...)**:
  ```bash
  docker compose down -v
  ```

### Quản lý trạng thái
* **Xem danh sách các service đang chạy và port map**:
  ```bash
  docker compose ps
  ```
* **Restart một service cụ thể**:
  ```bash
  docker compose restart sre-agent
  ```
  *(Thay `sre-agent` bằng `litellm`, `config-service` nếu muốn).*

---

## 📝 2. Hướng dẫn xem logs gỡ lỗi (Debugging Logs)

Log của các container là nơi quan trọng nhất để điều tra khi Agent gặp lỗi xử lý hoặc LLM bị lỗi token.

### Xem log theo thời gian thực (Live Stream)
* **Theo dõi log của toàn bộ hệ thống**:
  ```bash
  docker compose logs -f
  ```
* **Theo dõi log của SRE Agent**:
  ```bash
  docker compose logs -f sre-agent
  ```
* **Theo dõi log của LiteLLM (kiểm tra token/request đi qua LLM)**:
  ```bash
  docker compose logs -f litellm
  ```

### Xem log ngắn gọn (N dòng cuối cùng)
* **Xem 50 dòng log cuối cùng của LiteLLM**:
  ```bash
  docker compose logs --tail 50 litellm
  ```
* **Xem log của Agent kèm theo lọc thnnnng tin**:
  ```bash
  docker compose logs sre-agent | grep -E "ERROR|WARN"
  ```

---

## 🛠️ 3. Kim tra và tương tác trực tiếp trong Container

Khi cần chạy lệnh bash trực tiếp hoặc kiểm tra các file cấu hình bên trong container.

* **Truy cập vào Bash shell của container SRE Agent**:
  ```bash
  docker compose exec sre-agent bash
  ```
* **Kiểm tra phiên bản các thư viện Python cài trong Agent**:
  ```bash
  docker compose exec sre-agent pip show fastapi httpx litellm
  ```
* **Xem danh sách các file phiên làm việc (Session cache) của Agent**:
  ```bash
  docker compose exec sre-agent ls -la /data/agent-sessions
  ```

---

## 🔑 4. Quản lý API Keys & Bảo mật (Secrets)

> [!WARNING]
> **TUYỆT ĐỐI KHÔNG** commit trực tiếp API Key của OpenRouter hoặc Anthropic vào Git (lịch sử commit). NOTICE u làm vậy, GitHub Push Protection sẽ lập tức chặn push.

### Cách cấu hình API Key an toàn:
1. Tạo file `.env` ở thư mục gốc dự án (nếu chưa có). File này đã nằm trong `.gitignore` nên an toàn.
2. Định nghĩa các key trong `.env`:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxx
   ANTHROPIC_API_KEY=sk-ant-v1-xxxxxxxxxxxxxxxxxxxxxxx
   ```
3. Docker Compose và các file cấu hình YAML (`local.yaml`, `docker-compose.yml`) sẽ tự động c biến qua cú pháp `${OPENROUTER_API_KEY}`.

---

## 💡 5. Xử lý một số lỗi thường gặp (Troubleshooting)

### 1. Lỗi phân quyền ghi tệp tin (`Permission denied / os error 13`)
* **Biểu hiện**: SRE Agent kết thúc phiên điều tra báo lỗi khi cố gắng l Memory hoặc tải mô hình nhúng ONNX.
* **Cách sửa**: Chạy lệnh phân quyền trên máy Host để cấp quyn ghi cho container:
  ```bash
  chmod -R 777 /root/RnD/OpenSRE
  ```

### 2. Lỗi giới hạn context của mô hình local (`ContextWindowExceededError`)
* **Biểu hiện**: LLM Local (vLLM) báo lỗi do yêu cầu vượt quá `16384` tokens (thường do Claude CLI tự động đính kèm system prompt mặc định 15k tokens).
* **Cách sửa**: 
  * Sử dụng API Key của OpenRouter và chuyển sang dòng model miễn phí có context r**Cáchng (như `ling-3.0-tiny:free` hoặc `gemini-2.5-flash:free`).
  * Hoặc nhờ quản trị viên hệ thống nâng tham số `--max-model-len 32768` trên Server vLLM Local.

### 3. Lỗi Rate Limit từ OpenRouter (`429 Too Many Requests`)
* **Biểu hiện**: LiteLLM logs ghi nhận lỗi code `429` do tài khoản miễn phí vượt hạn mức 50 requests/ngày.
* **Cách sửa**: Thay API key mới vào file `.env` hoặc `litellm_config.yaml` và chạy lệnh sau để xóa cache cooldown của LiteLLM:
  ```bash
  docker compose restart litellm
  ```

---
*Chúc các bạn develop vui vẻ! Mọi đóng gppp xin gửi pull request về nhánh phát triển tương ng.*


docker compose up -d sre-agent


docker compose up -d sre-agent
