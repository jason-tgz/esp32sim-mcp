import { describe, it, expect } from 'vitest';
import { normalizeChip } from '../src/core/types.js';
import { getBoardsByChip, getBoardById, SUPPORTED_BOARDS } from '../src/core/boards.js';
import { serializeScriptEvents } from '../src/core/script.js';
import { normalizeWifiSpec } from '../src/core/runner.js';
import { checkExpectations, parsePattern } from '../src/core/expect.js';
import { ESP32SIM_TESTED_REV, runDoctor } from '../src/core/binary.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Chip & Board Registry', () => {
  it('normalizes chip names correctly', () => {
    expect(normalizeChip('esp32s3')).toBe('s3');
    expect(normalizeChip('ESP32-S3')).toBe('s3');
    expect(normalizeChip('s3')).toBe('s3');
    expect(normalizeChip('esp32c3')).toBe('c3');
    expect(normalizeChip('C6')).toBe('c6');
    expect(normalizeChip('esp32')).toBe('esp32');
    expect(normalizeChip(undefined)).toBe('s3');
  });

  it('contains supported boards with proper hardware capabilities', () => {
    expect(SUPPORTED_BOARDS.length).toBeGreaterThan(3);
    const atech = getBoardById('atech14');
    expect(atech).toBeDefined();
    expect(atech?.chip).toBe('s3');
    expect(atech?.hasDisplay).toBe(true);
    expect(atech?.buttons).toContain('btn1');

    const c6Boards = getBoardsByChip('c6');
    expect(c6Boards.some((b) => b.id === 'waveshare-c6-lcd147')).toBe(true);
    // The C3 has no board models and refuses --board, even 'none'
    expect(getBoardsByChip('c3')).toEqual([]);
  });
});

describe('Simulation Script Generator', () => {
  it('serializes structured events into esp32sim script format in chronological order', () => {
    const events = [
      { time: 3.4, action: 'press' as const, target: 'btn2', durationMs: 120 },
      { time: 1.5, action: 'press' as const, target: 'btn1', durationMs: 150 },
      { time: 2.2, action: 'knob' as const, direction: 'cw' as const, steps: 2 },
      { time: 4.0, action: 'serial' as const, data: '{"status":"ok"}' },
      { time: 5.0, action: 'stop' as const },
    ];

    const script = serializeScriptEvents(events);
    const lines = script.trim().split('\n');

    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('1.5 press btn1 150');
    expect(lines[1]).toBe('2.2 knob cw 2');
    expect(lines[2]).toBe('3.4 press btn2 120');
    expect(lines[3]).toBe('4 serial {"status":"ok"}');
    expect(lines[4]).toBe('5 stop');
  });

  it('serializes release, gpio, uart and touch actions', () => {
    const script = serializeScriptEvents([
      { time: 1, action: 'release', target: '16' },
      { time: 2, action: 'gpio', pin: 17, level: 0 },
      { time: 3, action: 'uart', data: 'root' },
      { time: 4, action: 'uart', port: 1, data: 'AT' },
      { time: 5, action: 'touch', x: 450, y: 30 },
      { time: 6, action: 'touch', x: 450, y: 30, down: false },
    ]);

    expect(script.split('\n')).toEqual([
      '1 release 16',
      '2 gpio 17 0',
      '3 uart0 root',
      '4 uart1 AT',
      '5 touch 450 30 1',
      '6 touch 450 30 0',
    ]);
  });
});

describe('WiFi spec', () => {
  it('turns a bare SSID into an open-network spec and keeps full specs', () => {
    expect(normalizeWifiSpec('demo')).toBe('ssid=demo');
    expect(normalizeWifiSpec('ssid=demo,psk=secret')).toBe('ssid=demo,psk=secret');
  });
});

describe('Expect Assertion Engine', () => {
  const sampleLogs = `
I (28) boot: ESP-IDF v5.3-dev
I (31) boot: Chip: ESP32-S3
I (35) boot: Loading app...
I (100) main: System initialized
I (150) wifi: Connected to AP "VirtualNet"
I (200) http_server: Listening on port 80
I (250) test: Ready for requests
`;

  it('matches ordered patterns sequentially', () => {
    const patterns = ['Loading app', 'System initialized', 'Listening on port 80'];
    const res = checkExpectations(sampleLogs, patterns, { ordered: true });

    expect(res.passed).toBe(true);
    expect(res.matchedCount).toBe(3);
    expect(res.missingPattern).toBeUndefined();
  });

  it('fails when ordered patterns appear out of sequence', () => {
    const patterns = ['Listening on port 80', 'Loading app'];
    const res = checkExpectations(sampleLogs, patterns, { ordered: true });

    expect(res.passed).toBe(false);
    expect(res.matchedCount).toBe(1);
    expect(res.missingPattern).toBe('Loading app');
    expect(res.diffSummary).toContain('MISSING: "Loading app"');
  });

  it('supports regex patterns', () => {
    const patterns = [/ESP-IDF v\d+\.\d+/, /Listening on port \d+/];
    const res = checkExpectations(sampleLogs, patterns);

    expect(res.passed).toBe(true);
    expect(res.matchedCount).toBe(2);
  });

  it('detects missing pattern cleanly', () => {
    const patterns = ['Loading app', 'MQTT connected', 'Ready for requests'];
    const res = checkExpectations(sampleLogs, patterns);

    expect(res.passed).toBe(false);
    expect(res.missingPattern).toBe('MQTT connected');
    expect(res.diffSummary).toContain('MISSING: "MQTT connected"');
  });
});

describe('Doctor & Environment Check', () => {
  it('runs doctor without throwing and detects node/system environment', () => {
    const doc = runDoctor();
    expect(doc.platform).toBeDefined();
    expect(doc.arch).toBeDefined();
    expect(Array.isArray(doc.recommendations)).toBe(true);
  });
});

describe('Pinned emulator version', () => {
  it('builds the prebuilt emulator from the commit users are told to install', () => {
    for (const workflow of ['emulator.yml']) {
      const text = fs.readFileSync(path.resolve(__dirname, '../.github/workflows', workflow), 'utf-8');
      expect(text, workflow).toContain(`ESP32SIM_REF: ${ESP32SIM_TESTED_REV}`);
    }
  });
});

describe('Pattern syntax', () => {
  const logs = 'I (100) app: Counter: 12\nI (200) wifi: WiFi CONNECTED to demo\n';

  it('treats /body/flags as a regex and everything else as literal text', () => {
    expect(checkExpectations(logs, ['/Counter: \\d+$/', '/wifi connected/i']).passed).toBe(true);
    expect(checkExpectations(logs, ['Counter: \\d+']).passed).toBe(false);
    expect(checkExpectations(logs, ['Counter: 12']).passed).toBe(true);
  });

  it('rejects an invalid regex with a clear message', () => {
    expect(() => parsePattern('/Counter: (/')).toThrow(/Invalid regex pattern/);
  });
});

describe('Release manifests', () => {
  const root = path.resolve(__dirname, '..');
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8'));

  it('carry the package.json version and MCP registry name', () => {
    const pkg = read('package.json');
    const server = read('server.json');
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0]).toMatchObject({ identifier: pkg.name, version: pkg.version });
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(read('.claude-plugin/plugin.json').version).toBe(pkg.version);
  });
});
