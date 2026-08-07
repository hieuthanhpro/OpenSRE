import litellm
from litellm.integrations.custom_logger import CustomLogger

class ClampTokensCallback(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
        if isinstance(data, dict):
            # 1. Prune conversation history to save tokens
            messages = data.get("messages")
            if isinstance(messages, list) and len(messages) > 6:
                # Keep the first user message (original request)
                first_msg = messages[0]
                # Keep the last 4 messages (recent interactions)
                last_msgs = messages[-4:]
                
                # Combine them: [first_msg, ...skipped..., last_msgs]
                pruned_messages = [first_msg] + last_msgs
                data["messages"] = pruned_messages
                print(f"✂️ [LITELLM] Pruned messages from {len(messages)} down to {len(pruned_messages)} turns")

            # 2. Estimate input tokens from pruned messages
            messages = data.get("messages") or []
            input_text = str(messages) + str(data.get("system", "")) + str(data.get("tools", ""))
            
            # Conservative token estimate: ~2.8 chars per token for code/JSON/Vietnamese + 200 buffer
            est_input_tokens = int(len(input_text) / 2.8) + 200
            
            # vLLM max_model_len is 16384
            max_model_len = 16384
            headroom = 300
            
            # Dynamically compute max output tokens so: input_tokens + output_tokens <= 16384
            avail_tokens = max(256, max_model_len - est_input_tokens - headroom)
            target_max = min(2048, avail_tokens)
            
            data["max_tokens"] = target_max
            data["max_output_tokens"] = target_max
            data["max_completion_tokens"] = target_max

        return data

clamp_callback = ClampTokensCallback()
litellm.callbacks = [clamp_callback]
print("✅ [LITELLM] Dynamic ClampTokensCallback loaded — dynamic max_tokens active")
