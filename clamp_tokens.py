import litellm
from litellm.integrations.custom_logger import CustomLogger

class ClampTokensCallback(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
        if isinstance(data, dict):
            # 1. Prune conversation history to save tokens if turns > 6
            messages = data.get("messages")
            if isinstance(messages, list) and len(messages) > 6:
                first_msg = messages[0]
                last_msgs = messages[-4:]
                pruned_messages = [first_msg] + last_msgs
                data["messages"] = pruned_messages

            # 2. Estimate input tokens from messages + system + tools
            messages = data.get("messages") or []
            input_text = str(messages) + str(data.get("system", "")) + str(data.get("tools", ""))
            
            est_input_tokens = int(len(input_text) / 2.8) + 200
            
            # Model max context length (32768 for OpenRouter models)
            max_model_len = 32768
            headroom = 500
            
            # Dynamically compute max output tokens so input + output <= 32768
            avail_tokens = max(256, max_model_len - est_input_tokens - headroom)
            target_max = min(2048, avail_tokens)
            
            data["max_tokens"] = target_max
            if "max_completion_tokens" in data:
                data["max_completion_tokens"] = target_max
            if "max_output_tokens" in data:
                data["max_output_tokens"] = target_max

        return data

clamp_callback = ClampTokensCallback()
litellm.callbacks = [clamp_callback]
print("✅ [LITELLM] Dynamic ClampTokensCallback loaded — dynamic max_tokens active")
