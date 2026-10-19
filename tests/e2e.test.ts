import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runSimulation } from '../src/core/runner.js';
import { runExpect } from '../src/core/expect.js';
import { spawnSync } from 'child_process';
import { resolveEsp32SimBinary, resolveRomPath } from '../src/core/binary.js';
import { SUPPORTED_BOARDS } from '../src/core/boards.js';
import { FIXTURES_DIR, HAS_EMULATOR, HELLO_S3 } from './helpers.js';

describe.skipIf(!HAS_EMULATOR)('End-to-End Real esp32sim Simulation', () => {
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
    // Default console is UART0 + USB-JTAG: the mirrored line comes back once and intact
    expect(res.uartLogs.split('\n').filter((l) => l === 'Hello world!')).toHaveLength(1);
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

  it('joins the virtual WiFi network with the default console (USB-JTAG logs)', async () => {
    const res = await runExpect({
      chip: 's3',
      appBin: path.join(FIXTURES_DIR, 's3-wifi_station.bin'),
      bootloaderBin: path.join(FIXTURES_DIR, 's3-wifi-bootloader.bin'),
      ptableBin: path.join(FIXTURES_DIR, 's3-wifi-ptable.bin'),
      wifi: 'ssid=esp32sim,psk=esp32sim-pass',
      maxSeconds: 8,
      patterns: ['station: CONNECTED', 'station: GOT_IP ip=10.0.2.15', 'station: PING seq=1'],
    });

    expect(res.diffSummary).toBeUndefined();
    expect(res.passed).toBe(true);
  });

  it('reports a script stop as script_stop with the emulated time', async () => {
    const res = await runSimulation({
      ...HELLO_S3,
      maxSeconds: 2,
      script: [{ time: 0.3, action: 'stop' }],
    });

    expect(res.stopReason).toBe('script_stop');
    expect(res.emulatedSeconds).toBeCloseTo(0.3, 2);
  });

  it('reports a hit exception limit as exception_limit, not a clean run', async () => {
    const res = await runSimulation({ ...HELLO_S3, maxSeconds: 1, stopAfterExceptions: 1 });

    expect(res.stopReason).toBe('exception_limit');
    expect(res.uartLogs).not.toContain('Hello world!');
  });

  it('every catalogued board id is accepted by esp32sim', () => {
    const bin = resolveEsp32SimBinary()!;
    for (const board of SUPPORTED_BOARDS) {
      const chip = board.id === 'none' ? 's3' : board.chip;
      const rom = resolveRomPath(chip);
      const args = ['--chip', chip, '--board', board.id, '--max-seconds', '0.001', '--no-dump'];
      if (rom) args.push('--rom', rom);
      args.push('--boot', 'rom', '--bootloader', HELLO_S3.bootloaderBin, '--ptable', HELLO_S3.ptableBin, '--app', HELLO_S3.appBin);
      args.push(...(board.requiredArgs ?? []));
      const out = spawnSync(bin, args, { encoding: 'utf-8', timeout: 20000 });
      expect(out.stderr + out.stdout, board.id).not.toMatch(/unknown board/i);
    }
  });
});
