#!/usr/bin/env python3
"""
anthropic_proxy. Thin Anthropic Messages -> OpenAI Chat Completions proxy.py 

Problem:
  Claude CLI binary sends POST /v1/messages with ~15,000 token Claude Code preset
  in the `system` field. Local vLLM has max_model_len=16,384. This causes
  ContextWindowExceededError (16,129 + 256 > 16,384).

Solution:
  This proxy intercepts /v1/messages, strips system blocks > MAX_SYSTEM_CHARS
  (keeping only the small Oracle DBA prompt ~1,200 chars), converts to OpenAI
  chat/completions format, and forwards to vLLM.
"""

import json
import logging
import os
import uuid
from typing import AsyncIterator

import httpx
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [PROXY] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Anthropic->OpenAI Proxy", version="1.0.0")

VLLM_BASE_URL = os.environ.get("VLLM_BASE_URL", "http://10.36.36.155:8201/v1")
VLLM_MODEL = os.environ.get("VLLM_MODEL", "mic-llm")
MAX_OUTPUT_TOKENS = int(os.environ.get("MAX_OUTPUT_TOKENS", "2048"))
# System blocks larger than this are Claude Code preset -- strip them
MAX_SYSTEM_CHARS = int(os.environ.get("MAX_SYSTEM_CHARS", "5000"))
PORT = int(os.environ.get("PROXY_PORT", "4050"))


def extract_system_prompt(system) -> str:
    """Extract only our custom system prompt, strip Claude Code 15k preset."""
    if not system:
        return ""
    if isinstance(system, str):
        return system if len(system) <= MAX_SYSTEM_CHARS else ""
    if isinstance(system, list):
        small = [
            b.get("text", "")
            for b in system
            if isinstance(b, dict)
            and b.get("type") == "text"
            and len(b.get("text", "")) <= MAX_SYSTEM_CHARS
        ]
        return "\n\n".join(small) if small else ""
    return ""


def anthropic_to_openai_messages(body: dict) -> list:
    """Convert Anthropic Messages format to OpenAI messages array."""
    messages = []

    system_text = extract_system_prompt(body.get("system"))
    if system_text:
        messages.append({"role": "system", "content": system_text})

    for msg in body.get("messages", []):
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "text":
                        parts.append(block.get("text", ""))
                    elif block.get("type") == "tool_result":
                        inner = block.get("content", "")
                        if isinstance(inner, list):
                            inner_text = " ".join(
                                b.get("text", "") for b in inner if b.get("type") == "text"
                            )
                        else:
                            inner_text = str(inner)
                        parts.append(f"[Tool result: {inner_text}]")
                    elif block.get("type") == "tool_use":
                        parts.append(
                            f"[Tool call: {block.get('name', '')}({json.dumps(block.get('input', {}))})]"
                        )
            content = "\n".join(parts)

        messages.append({"role": role, "content": content})

    return messages


async def stream_openai_to_anthropic(openai_stream, model: str, request_id: str):
    """Convert OpenAI SSE stream -> Anthropic SSE stream."""
    yield (
        "event: message_start\n"
        f"data: {json.dumps({'type': 'message_start', 'message': {'id': request_id, 'type': 'message', 'role': 'assistant', 'content': [], 'model': model, 'stop_reason': None, 'stop_sequence': None, 'usage': {'input_tokens': 0, 'output_tokens': 0}}})}\n\n"
    ).encode()

    yield (
        "event: content_block_start\n"
        f"data: {json.dumps({'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}})}\n\n"
    ).encode()

    total_output_tokens = 0
    buffer = b""

    async for chunk in openai_stream:
        buffer += chunk
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            line = line.decode("utf-8", errors="replace").strip()
            if not line.startswith("data: "):
                continue
            data_str = line[6:]
            if data_str == "[DONE]":
                break
            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                continue

            choices = data.get("choices", [])
            if choices:
                delta = choices[0].get("delta", {})
                text = delta.get("content", "")
                if text:
                    total_output_tokens += 1
                    yield (
                        "event: content_block_delta\n"
                        f"data: {json.dumps({'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': text}})}\n\n"
                    ).encode()

            usage = data.get("usage", {})
            if usage.get("completion_tokens"):
                total_output_tokens = usage["completion_tokens"]

    yield (
        "event: content_block_stop\n"
        f"data: {json.dumps({'type': 'content_block_stop', 'index': 0})}\n\n"
    ).encode()

    yield (
        "event: message_delta\n"
        f"data: {json.dumps({'type': 'message_delta', 'delta': {'stop_reason': 'end_turn', 'stop_sequence': None}, 'usage': {'output_tokens': total_output_tokens}})}\n\n"
    ).encode()

    yield (
        "event: message_stop\n"
        f"data: {json.dumps({'type': 'message_stop'})}\n\n"
    ).encode()


@app.post("/v1/messages")
async def handle_messages(request: Request):
    body = await request.json()
    request_id = f"msg_{uuid.uuid4().hex[:24]}"
    is_stream = body.get("stream", False)

    model = body.get("model", VLLM_MODEL)
    raw_max_tokens = body.get("max_tokens", MAX_OUTPUT_TOKENS)
    max_tokens = min(int(raw_max_tokens), MAX_OUTPUT_TOKENS)

    openai_messages = anthropic_to_openai_messages(body)
    system_chars = sum(len(m["content"]) for m in openai_messages if m["role"] == "system")

    logger.info(
        f"[{request_id}] model={model} stream={is_stream} "
        f"max_tokens={max_tokens} system_chars={system_chars} msgs={len(openai_messages)}"
    )

    openai_payload = {
        "model": VLLM_MODEL,
        "messages": openai_messages,
        "max_tokens": max_tokens,
        "stream": is_stream,
    }

    if is_stream:
        async def generate():
            async with httpx.AsyncClient(timeout=300) as client:
                async with client.stream(
                    "POST",
                    f"{VLLM_BASE_URL}/chat/completions",
                    json=openai_payload,
                    headers={"Authorization": "Bearer EMPTY", "Content-Type": "application/json"},
                ) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        logger.error(f"[{request_id}] vLLM error {resp.status_code}: {error_body}")
                        yield (
                            "event: error\n"
                            f"data: {json.dumps({'type': 'error', 'error': {'type': 'api_error', 'message': error_body.decode()}})}\n\n"
                        ).encode()
                        return
                    async for chunk in stream_openai_to_anthropic(resp.aiter_bytes(), model, request_id):
                        yield chunk

        return StreamingResponse(generate(), media_type="text/event-stream")

    else:
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(
                f"{VLLM_BASE_URL}/chat/completions",
                json=openai_payload,
                headers={"Authorization": "Bearer EMPTY", "Content-Type": "application/json"},
            )

        if resp.status_code != 200:
            logger.error(f"[{request_id}] vLLM error {resp.status_code}: {resp.text}")
            return Response(
                content=json.dumps({"type": "error", "error": {"type": "api_error", "message": resp.text}}),
                status_code=resp.status_code,
                media_type="application/json",
            )

        oai = resp.json()
        choice = oai["choices"][0]
        usage = oai.get("usage", {})

        anthropic_resp = {
            "id": request_id,
            "type": "message",
            "role": "assistant",
            "model": model,
            "content": [{"type": "text", "text": choice["message"].get("content", "")}],
            "stop_reason": "end_turn",
            "stop_sequence": None,
            "usage": {
                "input_tokens": usage.get("prompt_tokens", 0),
                "output_tokens": usage.get("completion_tokens", 0),
            },
        }

        logger.info(
            f"[{request_id}] OK input_tokens={anthropic_resp['usage']['input_tokens']} "
            f"output_tokens={anthropic_resp['usage']['output_tokens']}"
        )
        return Response(content=json.dumps(anthropic_resp), media_type="application/json")


@app.get("/health")
async def health():
    return {"status": "ok", "proxy": "anthropic->openai", "vllm": VLLM_BASE_URL}


if __name__ == "__main__":
    logger.info(f"Starting proxy on port {PORT}, vLLM={VLLM_BASE_URL}, model={VLLM_MODEL}")
    logger.info(f"MAX_OUTPUT_TOKENS={MAX_OUTPUT_TOKENS}, MAX_SYSTEM_CHARS={MAX_SYSTEM_CHARS}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
