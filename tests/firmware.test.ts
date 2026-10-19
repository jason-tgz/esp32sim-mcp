import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveFirmware } from '../src/core/firmware.js';

describe('Firmware Discovery & Resolver', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esp32_fw_test_'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('resolves explicit paths directly', () => {
    const fw = resolveFirmware({
      appBin: '/tmp/app.bin',
      bootloaderBin: '/tmp/boot.bin',
      ptableBin: '/tmp/ptable.bin',
      chip: 's3',
    });

    expect(fw.source).toBe('explicit');
    expect(fw.appBin).toBe(path.resolve('/tmp/app.bin'));
    expect(fw.bootloaderBin).toBe(path.resolve('/tmp/boot.bin'));
    expect(fw.ptableBin).toBe(path.resolve('/tmp/ptable.bin'));
    expect(fw.chip).toBe('s3');
  });

  it('discovers firmware from ESP-IDF flasher_args.json', () => {
    const buildDir = path.join(tmpDir, 'build');
    fs.mkdirSync(buildDir, { recursive: true });

    const flasherArgs = {
      target: 'esp32s3',
      flash_files: {
        '0x0': 'bootloader/bootloader.bin',
        '0x8000': 'partition_table/partition-table.bin',
        '0x10000': 'my_test_app.bin',
      },
      app: {
        elf: 'my_test_app.elf',
      },
    };

    fs.writeFileSync(path.join(buildDir, 'flasher_args.json'), JSON.stringify(flasherArgs, null, 2));

    const fw = resolveFirmware({ projectDir: tmpDir });

    expect(fw.source).toBe('flasher_args');
    expect(fw.chip).toBe('s3');
    expect(fw.appBin).toBe(path.join(buildDir, 'my_test_app.bin'));
    expect(fw.bootloaderBin).toBe(path.join(buildDir, 'bootloader/bootloader.bin'));
    expect(fw.ptableBin).toBe(path.join(buildDir, 'partition_table/partition-table.bin'));
    expect(fw.elfPath).toBe(path.join(buildDir, 'my_test_app.elf'));
  });

  it('throws an informative error when no build artifacts exist', () => {
    expect(() => {
      resolveFirmware({ projectDir: tmpDir });
    }).toThrow(/No ESP32 firmware binaries/);
  });
});
