import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicAdapter } from '../../src/providers/anthropic.js';

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
  process.env.ANTHROPIC_AUTH_TOKEN = ORIGINAL_AUTH_TOKEN;
});

function getClient(adapter: AnthropicAdapter): Anthropic {
  return (adapter as unknown as { client: Anthropic }).client;
}

describe('AnthropicAdapter auth configuration', () => {
  it('uses explicit OAuth/Bearer auth without also sending an API key', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-from-env';

    const adapter = new AnthropicAdapter({ authToken: 'oauth-token' });
    const client = getClient(adapter);

    expect(client.authToken).toBe('oauth-token');
    expect(client.apiKey).toBeNull();
  });

  it('keeps explicit API-key auth available', () => {
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test' });
    const client = getClient(adapter);

    expect(client.apiKey).toBe('sk-test');
  });
});

async function recordedHeaders(make: (baseURL: string) => AnthropicAdapter): Promise<http.IncomingHttpHeaders> {
  let seen: http.IncomingHttpHeaders | undefined;
  const server = http.createServer((req, res) => {
    seen = req.headers;
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_zz', type: 'message', role: 'assistant', model: 'zz-model',
        content: [{ type: 'text', text: 'zz' }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    await make(`http://127.0.0.1:${port}`).complete({ model: 'zz-model', messages: [{ role: 'user', content: 'zz' }], maxTokens: 16 });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (!seen) throw new Error('the recorder saw no request');
  return seen;
}

describe('AnthropicAdapter auth headers on the wire, with ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN both set', () => {
  const bothSet = () => {
    process.env.ANTHROPIC_API_KEY = 'zz-env-key';
    process.env.ANTHROPIC_AUTH_TOKEN = 'zz-env-token';
  };

  it('an explicit apiKey sends X-Api-Key alone', async () => {
    bothSet();
    const headers = await recordedHeaders((baseURL) => new AnthropicAdapter({ apiKey: 'zz-key', baseURL, cacheKeepalive: { enabled: false } }));
    expect([headers['x-api-key'], headers.authorization]).toEqual(['zz-key', undefined]);
  });

  it('an explicit authToken sends its bearer alone', async () => {
    bothSet();
    const headers = await recordedHeaders((baseURL) => new AnthropicAdapter({ authToken: 'zz-token', baseURL, cacheKeepalive: { enabled: false } }));
    expect([headers['x-api-key'], headers.authorization]).toEqual([undefined, 'Bearer zz-token']);
  });

  it('an empty apiKey leaves the bearer the SDK reads from ANTHROPIC_AUTH_TOKEN', async () => {
    bothSet();
    const headers = await recordedHeaders((baseURL) => new AnthropicAdapter({ apiKey: '', baseURL, cacheKeepalive: { enabled: false } }));
    expect([headers['x-api-key'], headers.authorization]).toEqual(['', 'Bearer zz-env-token']);
  });

  it('with neither given, sends what the SDK reads from both variables', async () => {
    bothSet();
    const headers = await recordedHeaders((baseURL) => new AnthropicAdapter({ baseURL, cacheKeepalive: { enabled: false } }));
    expect([headers['x-api-key'], headers.authorization]).toEqual(['zz-env-key', 'Bearer zz-env-token']);
  });
});
