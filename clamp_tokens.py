import hashlib
import uuid
import litellm
from litellm.integrations.custom_logger import CustomLogger

class ClampTokensCallback(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
        if isinstance(data, dict):
            # 1. Strip 15.5k token Claude Code CLI preset from 'system' (Anthropic format)
            system = data.get("system")
            if system:
                if isinstance(system, list):
                    filtered_system = []
                    for block in system:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text = block.get("text", "")
                            if "Claude Code" in text or "official CLI" in text or "Anthropic's official" in text or (len(text) > 6000 and "Oracle" not in text):
                                print(f"✂️ [LITELLM] Stripped Claude Code CLI preset block ({len(text)} chars)")
                                continue
                            filtered_system.append(block)
                        elif isinstance(block, str):
                            if "Claude Code" in block or "official CLI" in block or "Anthropic's official" in block or (len(block) > 6000 and "Oracle" not in block):
                                print(f"✂️ [LITELLM] Stripped Claude Code CLI preset string ({len(block)} chars)")
                                continue
                            filtered_system.append(block)
                        else:
                            filtered_system.append(block)
                    data["system"] = filtered_system
                elif isinstance(system, str):
                    if "Claude Code" in system or "official CLI" in system or "Anthropic's official" in system:
                        print(f"✂️ [LITELLM] Stripped Claude Code CLI preset from system string ({len(system)} chars)")
                        blocks = system.split("\n\n")
                        clean_blocks = [b for b in blocks if "Claude Code" not in b and "official CLI" not in b and "Anthropic's official" not in b]
                        data["system"] = "\n\n".join(clean_blocks)

            # 2. Strip 15.5k token Claude Code CLI preset & system-reminders from 'messages' array
            messages = data.get("messages")
            first_user_text = ""
            if isinstance(messages, list):
                new_messages = []
                for msg in messages:
                    if isinstance(msg, dict):
                        role = msg.get("role")
                        content = msg.get("content")

                        # Capture real user prompt for session grouping (ignore <system-reminder> blocks)
                        if role == "user" and not first_user_text:
                            if isinstance(content, str) and not content.strip().startswith("<system-reminder>"):
                                first_user_text = content
                            elif isinstance(content, list):
                                for b in content:
                                    if isinstance(b, dict) and b.get("type") == "text":
                                        t = b.get("text", "")
                                        if not t.strip().startswith("<system-reminder>"):
                                            first_user_text = t
                                            break

                        # Strip system preset and <system-reminder> skill/agent list blocks
                        if role == "system":
                            if isinstance(content, str):
                                if "Claude Code" in content or "official CLI" in content or "Anthropic's official" in content:
                                    print(f"✂️ [LITELLM] Stripped Claude Code CLI preset from messages[system] ({len(content)} chars)")
                                    continue
                            elif isinstance(content, list):
                                filtered_content = []
                                for b in content:
                                    if isinstance(b, dict) and b.get("type") == "text":
                                        t = b.get("text", "")
                                        if "Claude Code" in t or "official CLI" in t or "Anthropic's official" in t:
                                            print(f"✂️ [LITELLM] Stripped Claude Code CLI preset block from messages[system] ({len(t)} chars)")
                                            continue
                                    filtered_content.append(b)
                                if not filtered_content:
                                    continue
                                msg["content"] = filtered_content
                        elif role == "user" and isinstance(content, list):
                            # Filter out <system-reminder> blocks from user messages
                            filtered_content = []
                            for b in content:
                                if isinstance(b, dict) and b.get("type") == "text":
                                    t = b.get("text", "")
                                    if "<system-reminder>" in t or "Available agent types for the Agent tool" in t or "The following skills are available" in t:
                                        print(f"✂️ [LITELLM] Stripped <system-reminder> block from messages[user] ({len(t)} chars)")
                                        continue
                                filtered_content.append(b)
                            msg["content"] = filtered_content

                    new_messages.append(msg)
                data["messages"] = new_messages

            # 2.3 Trim huge tool descriptions in data['tools'] (e.g. Agent tool schema, saves ~10,000 tokens)
            tools = data.get("tools")
            if isinstance(tools, list):
                for t in tools:
                    if isinstance(t, dict):
                        # Anthropic format: tool['description']
                        desc = t.get("description")
                        if isinstance(desc, str) and len(desc) > 500:
                            t["description"] = desc[:200] + " (Description shortened to save tokens)"
                            print(f"✂️ [LITELLM] Trimmed tool description for '{t.get('name')}' ({len(desc)} chars)")
                        # OpenAI format: tool['function']['description']
                        func = t.get("function")
                        if isinstance(func, dict):
                            fdesc = func.get("description")
                            if isinstance(fdesc, str) and len(fdesc) > 500:
                                func["description"] = fdesc[:200] + " (Description shortened to save tokens)"
                                print(f"✂️ [LITELLM] Trimmed function description for '{func.get('name')}' ({len(fdesc)} chars)")

            # 2.5 Compress OLD conversation history (tool results + old assistant tables older than last 6 messages)
            messages = data.get("messages")
            if isinstance(messages, list) and len(messages) > 6:
                recent_cutoff = len(messages) - 6
                pruned_count = 0
                for idx, msg in enumerate(messages[:recent_cutoff]):
                    if isinstance(msg, dict):
                        role = msg.get("role")
                        content = msg.get("content")
                        if isinstance(content, list):
                            for b in content:
                                if isinstance(b, dict):
                                    btype = b.get("type")
                                    # Compress old tool outputs
                                    if btype == "tool_result":
                                        val = b.get("content") or b.get("text") or ""
                                        if isinstance(val, str) and len(val) > 400:
                                            short_val = val[:150] + "\n...[Old tool output compressed]...\n"
                                            if "content" in b: b["content"] = short_val
                                            if "text" in b: b["text"] = short_val
                                            pruned_count += (len(val) - len(short_val))
                                    # Compress old assistant text & thinking blocks
                                    elif role == "assistant" and btype in ("text", "thinking"):
                                        val = b.get("text") or b.get("thinking") or ""
                                        if isinstance(val, str) and len(val) > 400:
                                            short_val = val[:150] + "\n...[Old response compressed]...\n"
                                            if "text" in b: b["text"] = short_val
                                            if "thinking" in b: b["thinking"] = short_val
                                            pruned_count += (len(val) - len(short_val))
                        elif isinstance(content, str) and len(content) > 500:
                            short_val = content[:200] + "\n...[Old message compressed]...\n"
                            msg["content"] = short_val
                            pruned_count += (len(content) - len(short_val))
                if pruned_count > 0:
                    print(f"✂️ [LITELLM] Compressed old conversation history (saved ~{pruned_count // 3} tokens)")

            # 3. Dynamic LangSmith Trace & Session metadata tree grouping
            if "metadata" not in data or not isinstance(data["metadata"], dict):
                data["metadata"] = {}

            if first_user_text:
                session_key = hashlib.md5(first_user_text.strip().encode("utf-8")).hexdigest()[:12]
                session_id = f"session-{session_key}"
                trace_name = f"Question: {first_user_text[:40]}"
            else:
                session_id = "session-default"
                trace_name = "Agent Investigation Run"

            data["metadata"]["session_id"] = session_id
            data["metadata"]["thread_id"] = session_id
            data["metadata"]["trace_name"] = trace_name
            data["metadata"]["project_name"] = "OpenSRE"

            # 4. Estimate input tokens & compute max output tokens
            messages = data.get("messages") or []
            input_text = str(messages) + str(data.get("system", "")) + str(data.get("tools", ""))
            
            est_input_tokens = int(len(input_text) / 2.8) + 200
            
            max_model_len = 32768
            headroom = 500
            
            avail_tokens = max(512, max_model_len - est_input_tokens - headroom)
            target_max = min(4096, avail_tokens)
            
            data["max_tokens"] = target_max
            if "max_completion_tokens" in data:
                data["max_completion_tokens"] = target_max
            if "max_output_tokens" in data:
                data["max_output_tokens"] = target_max

        return data

clamp_callback = ClampTokensCallback()
litellm.callbacks = [clamp_callback]
print("✅ [LITELLM] Safe ClampTokensCallback active (Dual-preset & <system-reminder> stripping + Tool schema trimming + Old history response compression)")
