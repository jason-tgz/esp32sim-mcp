import { describe, it, expect } from 'vitest';
import { normalizeChip } from '../src/core/types.js';
import { getBoardsByChip, getBoardById, SUPPORTED_BOARDS } from '../src/core/boards.js';
import { serializeScriptEvents } from '../src/core/script.js';
import { checkExpectations } from '../src/core/expect.js';
import { runDoctor } from '../src/core/binary.js';

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
    expect(c6Boards.some((b) => b.id === 'waveshare-c6-lcd-1.47')).toBe(true);
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
