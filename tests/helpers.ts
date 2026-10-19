import * as fs from 'fs';
import * as path from 'path';
import { resolveEsp32SimBinary, resolveRomPath } from '../src/core/binary.js';

export const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/demo-firmware');

export const HELLO_S3 = {
  chip: 's3' as const,
  appBin: path.join(FIXTURES_DIR, 'hello_world.bin'),
  bootloaderBin: path.join(FIXTURES_DIR, 'hello-bootloader.bin'),
  ptableBin: path.join(FIXTURES_DIR, 'hello-ptable.bin'),
};

// Real-emulator tests need the esp32sim binary and the S3 mask ROM; CI without them skips.
export const HAS_EMULATOR =
  fs.existsSync(HELLO_S3.appBin) && resolveEsp32SimBinary() !== null && resolveRomPath('s3') !== undefined;
