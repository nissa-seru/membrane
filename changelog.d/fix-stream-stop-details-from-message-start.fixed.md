- **Streamed refusals:** `AnthropicAdapter.stream()` and
  `BedrockAdapter.stream()` take a refusal's `stop_details` from the stream's
  `message_start` when no `message_delta` carries one, so `refusalCategory`,
  the raw response's `stop_details` and a refusal re-issue's
  `RetryingEvent.category` name its category. Anthropic's API has sent a
  refusal's `stop_details` only in `message_start`, and those fields then left
  the category out. A `message_delta`'s `stop_details`, when it carries one,
  still takes precedence. A `message_delta` whose `stop_details` is `null`
  carries none, so `BedrockAdapter.stream()` no longer puts
  `stop_details: null` into the raw response for one.
