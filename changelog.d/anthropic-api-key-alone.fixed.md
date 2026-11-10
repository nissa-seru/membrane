- `AnthropicAdapter` given a non-empty `apiKey` sends it alone, as `X-Api-Key`,
  as an explicit `authToken` already went alone as `Authorization`. Before,
  with the `ANTHROPIC_AUTH_TOKEN` environment variable set, a request carried
  that token's bearer beside the key. Which of the two the API honours when
  both arrive wasn't checked: if it's the bearer, a host that passes a key with
  that variable set was billed to the token's account and is billed to the
  key's from this release. An empty `apiKey` changes nothing. With none of
  `apiKey`, `authToken` and `credentials` given, nothing changes either: the
  SDK reads `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` and sends each one
  that's set, both if both are, so pass one to choose.
