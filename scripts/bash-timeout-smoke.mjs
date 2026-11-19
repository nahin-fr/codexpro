import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadConfig } from '../dist/config.js';
import { createCodexProServer } from '../dist/server.js';

const config = loadConfig(['--root', process.cwd(), '--tool-mode', 'full', '--bash', 'full']);
const server = createCodexProServer(config);
const client = new Client({ name: 'bash-timeout-smoke', version: '1' });
const [caller, receiver] = InMemoryTransport.createLinkedPair();
await server.connect(receiver);
await client.connect(caller);
try {
  const { tools } = await client.listTools();
  const timeout = tools.find(t => t.name === 'bash').inputSchema.properties.timeout_ms;
  assert.equal(timeout.maximum, 1_800_000);
  assert.match(timeout.description, /Default: 600000/);
  let heartbeats = 0;
  const result = await client.callTool({
    name: 'codexpro',
    arguments: { action: 'bash', args: { command: 'sleep 31', session_id: config.bashSessionId } },
  }, undefined, { timeout: 45_000, onprogress: () => heartbeats++ });
  assert.ok(!result.isError, JSON.stringify(result));
  assert.equal(result.structuredContent.exitCode, 0, JSON.stringify(result));
  assert.ok(heartbeats >= 2, 'Wrapper must forward progress metadata to Bash');
  console.log('PASS: wrapped Bash survives 30 seconds and sends progress; schema permits 30 minutes.');
} finally {
  await client.close();
  await server.close();
}
