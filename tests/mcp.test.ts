import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp/server.js';
import { HAS_EMULATOR, HELLO_S3 } from './helpers.js';

async function connectClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer().connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

function textOf(result: any): string {
  return result.content.map((c: any) => c.text ?? '').join('\n');
}

describe('MCP Server Implementation', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectClient();
  });

  it('lists the simulation tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['sim_doctor', 'sim_expect', 'sim_list_boards', 'sim_run', 'sim_screenshot', 'sim_script'].sort()
    );
  });

  it('lists boards filtered by chip', async () => {
    const res = await client.callTool({ name: 'sim_list_boards', arguments: { chip: 'c6' } });
    const text = textOf(res);
    expect(text).toContain('waveshare-c6-lcd147');
    expect(text).not.toContain('atech14');
  });

  it.skipIf(!HAS_EMULATOR)('sim_run with default arguments boots to app_main', async () => {
    const res = await client.callTool({ name: 'sim_run', arguments: { ...HELLO_S3, maxSeconds: 1 } });
    const text = textOf(res);
    expect(res.isError).toBe(false);
    expect(text).toContain('Hello world!');
  });

  it.skipIf(!HAS_EMULATOR)('sim_expect reports the missing pattern', async () => {
    const res = await client.callTool({
      name: 'sim_expect',
      arguments: { ...HELLO_S3, maxSeconds: 1, patterns: ['Hello world!', 'WiFi connected'] },
    });
    const text = textOf(res);
    expect(res.isError).toBe(true);
    expect(text).toContain('**Missing**: `WiFi connected`');
  });
});
