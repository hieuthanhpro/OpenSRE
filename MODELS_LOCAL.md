# Tài liệu mô hình LLM nội bộ

Tài liệu mô tả hai mô hình **thinking model** (hỗ trợ suy luận nội bộ) triển khai qua API tương thích OpenAI (vLLM). Cả hai hỗ trợ text và ảnh (VLM).

---

## Tổng quan

| Thuộc tính | Gemma 4 E4B (mini) | Qwen 3.6 35B (full) |
|---|---|---|
| **Tên model (deploy)** | `gemma-4-E4B-it-qat-w4a16-ct` | `Nvidia-Qwen3.6-35B-A3B-NVFP4` |
| **Tên gọi API** | `mic-llm-mini` | `mic-llm` |
| **Base URL** | `http://10.36.36.155:8200/v1` | `http://10.36.36.155:8201/v1` |
| **API Key** | `EMPTY` | `EMPTY` |
| **Max model length** | 8 192 tokens | 16 384 tokens |
| **Max concurrency** | 32 request | 64 request |
| **Loại** | Thinking model (VLM) | Thinking model (VLM) |
| **Quantization** | QAT W4A16-CT | NVFP4 |
| **Kích thước** | ~4B (E4B) | 35B total / 3B active (MoE A3B) |

**Gợi ý chọn model:**

- **`mic-llm-mini` (Gemma)**: nhẹ hơn, nhanh hơn, phù hợp tác vụ đơn giản hoặc batch lớn.
- **`mic-llm` (Qwen)**: context dài hơn, phù hợp prompt dài hoặc tác vụ phức tạp hơn.

---

## 1. Gemma 4 E4B — `mic-llm-mini`

```
Model deploy : gemma-4-E4B-it-qat-w4a16-ct
API model    : mic-llm-mini
Endpoint     : http://10.36.36.155:8200/v1
Max length   : 8192
Concurrency  : 32
```

| Tham số | Giá trị gợi ý |
|---|---|
| `temperature` | `0.6` – `1.0` |
| `top_p` | `0.95` |
| `top_k` | `20` (qua `extra_body`) |
| `min_p` | `0.0` (qua `extra_body`) |
| `presence_penalty` | `1.5` |
| `repetition_penalty` | `1.0` (qua `extra_body`) |
| `thinking_token_budget` | tùy chọn (xem bên dưới) |

Bật thinking mode: `extra_body.chat_template_kwargs.enable_thinking = true`

---

## 2. Qwen 3.6 35B — `mic-llm`

```
Model deploy : Nvidia-Qwen3.6-35B-A3B-NVFP4
API model    : mic-llm
Endpoint     : http://10.36.36.155:8201/v1
Max length   : 16384
Concurrency  : 64
```

| Tham số | Giá trị khuyến nghị (thinking mode) |
|---|---|
| `temperature` | `1.0` |
| `top_p` | `0.95` |
| `top_k` | `20` (qua `extra_body`) |
| `min_p` | `0.0` (qua `extra_body`) |
| `presence_penalty` | `1.5` |
| `repetition_penalty` | `1.0` (qua `extra_body`) |
| `thinking_token_budget` | tùy chọn (xem bên dưới) |

Bật thinking mode: `extra_body.chat_template_kwargs.enable_thinking = true`

---

## Giới hạn thinking budget (tùy chọn)

Tham số `thinking_token_budget` giới hạn số token tối đa model dùng cho phần suy luận nội bộ (`reasoning`), trước khi sinh `content`.

| Thuộc tính | Chi tiết |
|---|---|
| **Tên** | `thinking_token_budget` |
| **Bắt buộc** | Không — bỏ qua thì server dùng mặc định (không giới hạn cứng) |
| **Cách truyền** | Trong `extra_body` của request |
| **Kiểu** | Số nguyên dương (token) |
| **Gợi ý** | `512` – `2048` tùy độ phức tạp tác vụ |

```python
extra_body={
    "thinking_token_budget": 1024,          # tùy chọn
    "chat_template_kwargs": {"enable_thinking": True},
}
```

**Khi nào nên set:**

- Tác vụ đơn giản → `512` – `1024` để giảm latency và chi phí token.
- Tác vụ phức tạp (nhiều bước suy luận) → `2048` trở lên, hoặc bỏ tham số.
- Gặp `finish_reason=length` và `content` rỗng → tăng `thinking_token_budget` hoặc tăng `max_tokens`.

> `thinking_token_budget` + token `content` + token input không được vượt `max_model_len` của từng model.

---

## Cài đặt

```bash
pip install openai
```

> Khi dev local qua port-forward, thay `10.36.36.155` bằng `localhost`.

---

## Sample code

### 1. Chat text (Python)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://10.36.36.155:8201/v1",  # Qwen
    api_key="EMPTY",
)

response = client.chat.completions.create(
    model="mic-llm",
    messages=[{"role": "user", "content": "Xin chào, bạn là ai?"}],
    temperature=1.0,
    top_p=0.95,
    extra_body={
        "thinking_token_budget": 1024,  # tùy chọn — bỏ dòng này nếu không cần giới hạn
        "chat_template_kwargs": {"enable_thinking": True},
    },
)

msg = response.choices[0].message
print(msg.content)                              # câu trả lời
print(getattr(msg, "reasoning", None))          # suy luận nội bộ (nếu có)
```

Đổi sang Gemma: `base_url="http://10.36.36.155:8200/v1"`, `model="mic-llm-mini"`.

### 2. Gửi ảnh (Python)

```python
import base64
from openai import OpenAI

def image_to_data_url(path: str) -> str:
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:image/jpeg;base64,{b64}"

client = OpenAI(base_url="http://10.36.36.155:8201/v1", api_key="EMPTY")

response = client.chat.completions.create(
    model="mic-llm",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Mô tả ngắn nội dung ảnh."},
            {"type": "image_url", "image_url": {"url": image_to_data_url("photo.jpg")}},
        ],
    }],
    extra_body={
        "thinking_token_budget": 1024,  # tùy chọn
        "chat_template_kwargs": {"enable_thinking": True},
    },
)

print(response.choices[0].message.content)
```

### 3. cURL

```bash
curl http://10.36.36.155:8201/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer EMPTY" \
  -d '{
    "model": "mic-llm",
    "messages": [{"role": "user", "content": "Xin chào"}],
    "temperature": 1.0,
    "thinking_token_budget": 1024,
    "chat_template_kwargs": {"enable_thinking": true}
  }'
```

### 4. Kiểm tra server

```bash
curl http://10.36.36.155:8201/v1/models   # Qwen
curl http://10.36.36.155:8200/v1/models   # Gemma
```

---

## Response thinking model

| Trường | Mô tả |
|---|---|
| `message.content` | Đầu ra cuối — dùng cho logic nghiệp vụ |
| `message.reasoning` | Suy luận nội bộ — chỉ dùng debug/log |

Nếu `content` rỗng và `finish_reason=length`, model hết token ở phần reasoning → tăng `max_tokens`, giảm `thinking_token_budget`, hoặc rút gọn prompt.

---

## Lưu ý vận hành

1. API key luôn là `EMPTY`.
2. Không vượt quá 32 (Gemma) / 64 (Qwen) request đồng thời.
3. Tổng input + output + reasoning không vượt `max_model_len`.
4. Endpoint `10.36.36.155` chỉ truy cập được trong mạng nội bộ.
