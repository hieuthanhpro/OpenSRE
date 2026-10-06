# Hướng dẫn Đóng góp vào OpenSRE (Contributing to OpenSRE)

Cảm ơn bạn đã quan tâm đóng góp cho OpenSRE! Chúng tôi đang xây dựng một nền tảng SRE ứng dụng trí tuệ nhân tạo (AI-powered SRE) để giúp các đội ngũ điều tra sự cố và tự động hóa các hoạt động vận hành hạ tầng.

## Mục lục

- [Quy tắc Ứng xử](#quy-tắc-ứng-xử)
- [Bản quyền](#bản-quyền)
- [Tôi có thể Đóng góp bằng Cách nào?](#tôi-có-thể-đóng-góp-bằng-cách-nào)
- [Bắt đầu Hướng dẫn](#bắt-đầu-hướng-dẫn)
- [Quy trình Phát triển](#quy-trình-phát-triển)
- [Quy trình gửi Pull Request](#quy-trình-gửi-pull-request)
- [Quy chuẩn Trình bày Code](#quy-chuẩn-trình-bày-code)
- [Cộng đồng](#cộng-đồng)

## Quy tắc Ứng xử

Khi tham gia vào dự án này, bạn đồng ý duy trì một môi trường tôn trọng, hòa nhập và hợp tác tốt đẹp. Chúng ta cùng ở đây để xây dựng những phần mềm tuyệt vời cùng nhau.

## Bản quyền

OpenSRE được cấp phép theo điều khoản của [Apache License 2.0](LICENSE). Bằng việc gửi Pull Request, bạn đồng ý rằng các đóng góp của bạn cũng sẽ được áp dụng cùng điều khoản cấp phép này.

## Tôi có thể Đóng góp bằng Cách nào?

### Báo cáo Lỗi (Bug)

Bạn phát hiện lỗi? Hãy giúp chúng tôi khắc phục nó:

1. **Kiểm tra các Issue hiện tại** để tránh gửi trùng lặp.
2. **Sử dụng mẫu báo cáo lỗi (bug report template)** khi tạo issue mới.
3. **Mô tả chi tiết:** Các bước để tái hiện lỗi, hành vi mong muốn so với hành vi thực tế xảy ra, log hệ thống, thông tin môi trường.
4. **Gán nhãn (labels)** nếu có thể (ví dụ: `bug`, `high-priority`, v.v.)

### Đề xuất Tính năng Mới (Feature)

Bạn có ý tưởng mới? Chúng tôi rất muốn lắng nghe:

1. **Kiểm tra các yêu cầu tính năng hiện tại** trong mục [Discussions](https://github.com/swapnildahiphale/OpenSRE/discussions).
2. **Mở một thảo luận mới** trong danh mục "Ideas" trước khi tạo issue chính thức.
3. **Giải thích rõ trường hợp sử dụng (use case)** và lý do tại sao tính năng này quan trọng đối với việc xử lý sự cố.
4. **Xem xét phạm vi (scope)** — tính năng này có phù hợp với sứ mệnh của OpenSRE hay không?

### Đóng góp Mã nguồn (Code)

Tìm các Issue được gán các nhãn sau:
- `good first issue` — các tác vụ thân thiện với người mới bắt đầu.
- `help wanted` — các phần chúng tôi đang rất cần sự đóng góp từ cộng đồng.
- `documentation` — giúp cải thiện tài liệu hướng dẫn.

## Bắt đầu Hướng dẫn

### Điều kiện Tiền đề (Prerequisites)

- **Python 3.11+** kèm theo `uv` (khuyên dùng) hoặc `pip`.
- **Docker & Docker Compose** để phát triển cục bộ.
- **Node.js 18+** cho giao diện web frontend.
- **PostgreSQL 16+** (hoặc chạy qua Docker).

### Thiết lập Môi trường Cục bộ (Local Setup)

1. **Clone repository:**

```bash
git clone https://github.com/swapnildahiphale/OpenSRE.git
cd OpenSRE
```

2. **Cấu hình môi trường:**

```bash
cp .env.example .env
# Thêm khóa ANTHROPIC_API_KEY của bạn (xem file .env.example để biết tất cả các tùy chọn cấu hình)
```

3. **Khởi động các dịch vụ cục bộ:**

```bash
make dev
# Lệnh này sẽ khởi động Postgres, config-service, Neo4j, sre-agent, web-ui
# Database migration sẽ tự động chạy
# Địa chỉ Web Console: http://localhost:3002
```

Tùy chọn khác:
- `make dev-teams` — khởi động thêm bot Microsoft Teams (cổng 3978).

4. **Phát triển giao diện web (Web UI) độc lập** (Tùy chọn — lệnh `make dev` đã chạy sẵn web-ui trong Docker):

```bash
# Dừng container Docker web-ui trước, sau đó:
cd web_ui && pnpm install && pnpm dev
# Trỏ kết nối về các backend Docker chạy trên cổng :8081 / :8001
```

5. **Chạy Unit Test:**

```bash
pytest                          # Chạy test cho Backend
cd web_ui && pnpm test         # Chạy test cho Frontend
```

Xem tài liệu chi tiết về kiến trúc tại [Architecture docs](https://www.opensre.in/docs/architecture).

## Quy trình Phát triển

### Chiến lược Quản lý Nhánh (Branching Strategy)

- `main` — nhánh ổn định, chứa mã nguồn sẵn sàng cho sản xuất (production-ready).
- `develop` — nhánh tích hợp để phát triển các tính năng mới.
- `feature/your-feature` — nhánh phát triển tính năng của riêng bạn.
- `fix/your-fix` — nhánh sửa lỗi của riêng bạn.

### Các Bước Thực hiện Thay đổi

1. **Tạo nhánh mới:**

```bash
git checkout -b feature/your-feature-name
```

2. **Thực hiện chỉnh sửa:**
   - Viết code sạch sẽ, dễ đọc.
   - Thêm unit test cho các tính năng mới.
   - Cập nhật tài liệu hướng dẫn tương ứng nếu cần.

3. **Chạy test kiểm tra cục bộ:**

```bash
pytest                                    # Chạy toàn bộ test
pytest tests/test_your_feature.py        # Chạy test cho một file cụ thể
ruff check .                              # Kiểm tra chất lượng code (Lint)
```

4. **Commit với thông điệp rõ ràng:**

```bash
git commit -m "feat: add alert correlation for Datadog"
```

Sử dụng định dạng [conventional commits](https://www.conventionalcommits.org/):
- `feat:` — thêm tính năng mới
- `fix:` — sửa lỗi
- `docs:` — thay đổi tài liệu
- `refactor:` — tái cấu trúc code
- `test:` — thêm hoặc cập nhật test
- `chore:` — các công việc bảo trì khác

## Quy trình gửi Pull Request (PR)

### Trước khi gửi PR

- [ ] Các bài test cục bộ đều vượt qua (`pytest`)
- [ ] Code đã được định dạng và kiểm tra (`black .` và `ruff check .`)
- [ ] Tài liệu đã được cập nhật
- [ ] Thông điệp commit tuân theo quy chuẩn conventional commits
- [ ] Nhánh của bạn đã cập nhật bản mới nhất từ nhánh `main`

### Gửi PR của bạn

1. **Push nhánh của bạn lên remote repository:**

```bash
git push origin feature/your-feature-name
```

2. **Tạo một Pull Request trên GitHub:**
   - Đặt tiêu đề rõ ràng, mang tính mô tả.
   - Điền đầy đủ thông tin vào mẫu PR template.
   - Gắn liên kết tới các issue liên quan (ví dụ: `Closes #123`).
   - Thêm ảnh chụp màn hình / video nếu có thay đổi về giao diện người dùng (UI).

3. **Phản hồi ý kiến đóng góp:**
   - Trả lời các bình luận review một cách nhanh chóng.
   - Tiếp tục push các thay đổi sửa đổi lên cùng nhánh đó.
   - Yêu cầu review lại (Re-request review) khi đã sẵn sàng.

### Quy trình Đánh giá (Review Process)

- Một PR cần **ít nhất một sự phê duyệt (approval)** từ điều phối viên dự án (maintainer) để được merge.
- Tất cả các kiểm tra CI phải vượt qua (tests, linting, type checking).
- Đối với những thay đổi lớn, có thể sẽ cần nhiều vòng đánh giá.
- Chúng tôi cố gắng phản hồi và đánh giá PR trong vòng 2-3 ngày làm việc.

## Quy chuẩn Trình bày Code

### Python

- **Định dạng (Formatting):** Sử dụng thư viện `black` (giới hạn độ dài dòng là 100 ký tự).
- **Kiểm tra tĩnh (Linting):** Sử dụng `ruff` theo cấu hình của dự án.
- **Gợi ý kiểu (Type hints):** Bắt buộc đối với các API public.
- **Mô tả hàm (Docstrings):** Sử dụng Google Style cho các hàm và lớp.

```python
def correlate_alerts(alerts: list[Alert], threshold: float = 0.8) -> list[AlertGroup]:
    """Correlate alerts using temporal and semantic similarity.

    Args:
        alerts: List of alerts to correlate
        threshold: Similarity threshold (0.0 to 1.0)

    Returns:
        List of correlated alert groups
    """
    pass
```

### TypeScript/React

- **Định dạng:** Sử dụng Prettier.
- **Kiểm tra tĩnh (Linting):** Sử dụng ESLint kèm cấu hình của dự án.
- **Components:** Viết Functional components kết hợp TypeScript.
- **Quản lý State:** Sử dụng React Hooks, tránh sử dụng Class components.

### Thông điệp Commit (Git Commit Messages)

- Bắt đầu với một tiền tố chuẩn (conventional commit type).
- Giới hạn dòng đầu tiên dưới 72 ký tự.
- Sử dụng thì hiện tại diễn tả hành động (ví dụ: "add feature" thay vì "added feature").
- Đề chiếu tới các issues/PRs liên quan ở phần nội dung.

```
feat: add Prometheus alert correlation

- Implement temporal correlation algorithm
- Add semantic similarity using embeddings
- Include tests for edge cases

Closes #123
```

## Cộng đồng

### Kênh Trợ giúp

- **GitHub Discussions** — đặt câu hỏi, chia sẻ ý tưởng mới.
- **Slack** — tham gia cộng đồng của chúng tôi tại [opensre.slack.com](https://join.slack.com/t/opensre/shared_invite/zt-3ojlxvs46-xuEJEplqBHPlymxtzQi8KQ).
- **Issues** — báo cáo lỗi hoặc yêu cầu thêm tính năng mới.

### Cập nhật Thông tin

- Đăng ký theo dõi repo này để nhận cập nhật.
- Theo dõi tài khoản [@opensre](https://twitter.com/opensre) trên Twitter.
- Đọc [blog](https://opensre.in/blog) để xem các bài viết chuyên sâu.

### Ghi nhận Đóng góp

Tất cả người đóng góp sẽ được vinh danh tại:
- Biểu đồ đóng góp trên GitHub (GitHub contributor graph).
- Release notes cho các đóng góp lớn và quan trọng.

## Bạn có câu hỏi?

Nếu bạn chưa rõ về bất cứ điều gì:
1. Đọc kỹ phần [tài liệu kỹ thuật](https://www.opensre.in/docs) để biết thêm thông tin chi tiết.
2. Đặt câu hỏi tại [GitHub Discussions](https://github.com/swapnildahiphale/OpenSRE/discussions).
3. Trao đổi trực tiếp với các maintainers trên kênh Slack.

**Cảm ơn bạn đã đồng hành làm cho OpenSRE ngày càng tuyệt vời hơn!** 🦊
