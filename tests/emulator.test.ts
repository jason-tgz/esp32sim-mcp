import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ESP32SIM_TESTED_REV } from '../src/core/binary.js';
import { EMULATOR_ASSETS, installEmulator, platformAsset } from '../src/core/emulator.js';

describe('prebuilt emulator', () => {
  it('maps supported hosts to an asset and leaves the rest to cargo', () => {
    expect(platformAsset('darwin', 'arm64')).toBe('darwin-arm64');
    expect(platformAsset('linux', 'x64')).toBe('linux-x64');
    expect(platformAsset('linux', 'arm64')).toBe('linux-arm64');
    expect(platformAsset('darwin', 'x64')).toBeUndefined();
    expect(platformAsset('win32', 'x64')).toBeUndefined();
  });

  it('ships a real SHA-256 for every asset', () => {
    for (const [asset, hash] of Object.entries(EMULATOR_ASSETS)) {
      expect(hash, asset).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('keeps an esp32sim it did not install', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esp32sim-bin-'));
    try {
      fs.writeFileSync(path.join(dir, 'esp32sim'), 'manual build');
      const res = await installEmulator(dir);
      expect(res).toMatchObject({ downloaded: false, kept: 'user-managed' });
      expect(fs.readFileSync(path.join(dir, 'esp32sim'), 'utf-8')).toBe('manual build');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!platformAsset())('is a no-op when the tested build is already installed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esp32sim-bin-'));
    try {
      fs.writeFileSync(path.join(dir, 'esp32sim'), 'x');
      fs.writeFileSync(path.join(dir, '.esp32sim-rev'), ESP32SIM_TESTED_REV + '\n');
      expect(await installEmulator(dir)).toMatchObject({ downloaded: false });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
