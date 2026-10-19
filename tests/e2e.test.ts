import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runSimulation } from '../src/core/runner.js';
import { runExpect } from '../src/core/expect.js';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/demo-firmware');
const HAS_FIXTURES = fs.existsSync(path.join(FIXTURES_DIR, 'hello_world.bin'));

describe.skipIf(!HAS_FIXTURES)('End-to-End Real esp32sim Simulation', () => {
  it('boots real ESP32-S3 firmware and captures UART output', async () => {
    const res = await runSimulation({
      chip: 's3',
      appBin: path.join(FIXTURES_DIR, 'hello_world.bin'),
      bootloaderBin: path.join(FIXTURES_DIR, 'hello-bootloader.bin'),
      ptableBin: path.join(FIXTURES_DIR, 'hello-ptable.bin'),
      maxSeconds: 1,
    });

    expect(res.success).toBe(true);
    expect(res.exitCode).toBe(0);
    expect(res.hasCrashed).toBe(false);
    expect(res.uartLogs).toContain('ESP-ROM:esp32s3');
    expect(res.uartLogs).toContain('Hello world!');
    expect(res.uartLogs).toContain('This is esp32s3 chip with 2 CPU core(s)');
  });

  it('runs sim_expect with assertions on real UART boot logs', async () => {
    const res = await runExpect({
      chip: 's3',
      appBin: path.join(FIXTURES_DIR, 'hello_world.bin'),
      bootloaderBin: path.join(FIXTURES_DIR, 'hello-bootloader.bin'),
      ptableBin: path.join(FIXTURES_DIR, 'hello-ptable.bin'),
      maxSeconds: 1,
      patterns: ['ESP-IDF', 'Hello world!', 'Restarting in 10 seconds...'],
      ordered: true,
    });

    expect(res.passed).toBe(true);
    expect(res.matchedCount).toBe(3);
    expect(res.totalPatterns).toBe(3);
    expect(res.missingPattern).toBeUndefined();
  });

  it('captures virtual LCD display screenshot to PNG', async () => {
    const tmpPng = path.join(os.tmpdir(), `vitest_screenshot_${Date.now()}.png`);

    const res = await runSimulation({
      chip: 's3',
      board: 'atech14',
      appBin: path.join(FIXTURES_DIR, 'atech-firmware.bin'),
      bootloaderBin: path.join(FIXTURES_DIR, 'atech-bootloader.bin'),
      ptableBin: path.join(FIXTURES_DIR, 'atech-ptable.bin'),
      maxSeconds: 1,
      tftPng: tmpPng,
    });

    expect(res.success).toBe(true);
    expect(fs.existsSync(tmpPng)).toBe(true);
    expect(res.screenshotBase64).toBeDefined();
    expect(res.screenshotBase64?.length).toBeGreaterThan(1000);

    // Clean up
    fs.unlinkSync(tmpPng);
  });
});
