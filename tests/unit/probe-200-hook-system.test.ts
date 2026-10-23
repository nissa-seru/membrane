// Probe for antra-tess/membrane#200, not part of any change: can a Membrane
// caller mark its system prompt through a beforeRequest hook under cm-owned?
import { describe, expect, it } from 'vitest';
import { NativeFormatter } from '../../src/formatters/native.js';
import { AnthropicXmlFormatter } from '../../src/formatters/anthropic-xml.js';
import { Membrane } from '../../src/membrane.js';
import { MockAdapter } from '../../src/providers/mock.js';
import type { NormalizedMessage } from '../../src/types/index.js';

function markedMessages(count: number): NormalizedMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    participant: index % 2 === 0 ? 'User' : 'Claude',
    content: [{ type: 'text', text: `message-${index}` }],
    cacheBreakpoint: true,
  }));
}

function countCacheControls(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countCacheControls(item), 0);
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  return (record.cache_control ? 1 : 0) +
    Object.entries(record)
      .filter(([key]) => key !== 'cache_control')
      .reduce((sum, [, item]) => sum + countCacheControls(item), 0);
}

/** Marks the provider request's system prompt: a string becomes one block, and the last block takes the marker. */
const markSystem = (_normalized: unknown, raw: unknown) => {
  const request = raw as Record<string, unknown>;
  const blocks = typeof request.system === 'string'
    ? [{ type: 'text', text: request.system }]
    : (request.system as Array<Record<string, unknown>>);
  return {
    ...request,
    system: blocks.map((block, index) => index === blocks.length - 1 ? { ...block, cache_control: { type: 'ephemeral' } } : block),
  };
};

const request = (messages: number, xml = false) => ({
  messages: markedMessages(messages),
  system: 'sys',
  config: { model: 'test-model', maxTokens: 10 },
  promptCaching: true,
  cacheMarkers: 'cm-owned' as const,
  assistantParticipant: 'Claude',
  ...(xml ? { toolMode: 'xml' as const } : {}),
});

describe('probe #200: a beforeRequest hook marks the system prompt', () => {
  it('P1 native: the hook marks the system, 4 markers sent', async () => {
    const adapter = new MockAdapter();
    const membrane = new Membrane(adapter, { formatter: new NativeFormatter(), hooks: { beforeRequest: markSystem } });
    await membrane.complete(request(3));
    const sent = adapter.getLastRequest() as unknown as { system?: unknown; messages?: unknown[] };
    console.log('P1 system', JSON.stringify(sent.system));
    expect(sent.system).toEqual([{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }]);
    expect(countCacheControls({ system: sent.system, messages: sent.messages })).toBe(4);
  });

  it('P2 xml: the hook marks the last system block, its text kept, 4 markers sent', async () => {
    const adapter = new MockAdapter();
    const membrane = new Membrane(adapter, { formatter: new AnthropicXmlFormatter(), hooks: { beforeRequest: markSystem } });
    await membrane.complete(request(3, true));
    const sent = adapter.getLastRequest() as unknown as { system?: unknown; messages?: unknown[] };
    console.log('P2 system', JSON.stringify(sent.system));
    expect(sent.messages?.at(-1)).toEqual({ role: 'assistant', content: 'Claude:' });
    const blocks = sent.system as Array<Record<string, unknown>>;
    expect(blocks.at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
    expect(JSON.stringify(blocks)).toContain('sys');
    expect(countCacheControls({ system: sent.system, messages: sent.messages })).toBe(4);
  });

  it('P3 control, native, no hook: system sent as the string, 3 markers', async () => {
    const adapter = new MockAdapter();
    const membrane = new Membrane(adapter, { formatter: new NativeFormatter() });
    await membrane.complete(request(3));
    const sent = adapter.getLastRequest() as unknown as { system?: unknown; messages?: unknown[] };
    console.log('P3 system', JSON.stringify(sent.system));
    expect(sent.system).toBe('sys');
    expect(countCacheControls({ system: sent.system, messages: sent.messages })).toBe(3);
  });

  it('P4 native, 4 marked messages plus the hook marker: refused', async () => {
    const adapter = new MockAdapter();
    const membrane = new Membrane(adapter, { formatter: new NativeFormatter(), hooks: { beforeRequest: markSystem } });
    await expect(membrane.complete(request(4))).rejects.toThrow(/maximum 4/);
  });
});
