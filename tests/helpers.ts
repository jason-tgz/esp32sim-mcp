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

// Real-emulator tests need the esp32sim binary and the S3 mask ROM. They skip without them,
// unless ESP32SIM_REQUIRE_E2E=1 (the CI job that builds the emulator), where skipping would hide breakage.
export const HAS_EMULATOR =
  fs.existsSync(HELLO_S3.appBin) && resolveEsp32SimBinary() !== null && resolveRomPath('s3') !== undefined;

if (process.env.ESP32SIM_REQUIRE_E2E === '1' && !HAS_EMULATOR) {
  throw new Error('ESP32SIM_REQUIRE_E2E=1 but the esp32sim binary or the S3 mask ROM is missing');
}

// examples/hello-esp32 built with `idf.py build` (done by CI in the ESP-IDF container)
export const EXAMPLE_DIR = path.resolve(__dirname, '../examples/hello-esp32');
export const HAS_EXAMPLE_BUILD = fs.existsSync(path.join(EXAMPLE_DIR, 'build', 'flasher_args.json'));

if (process.env.ESP32SIM_REQUIRE_E2E === '1' && !HAS_EXAMPLE_BUILD) {
  throw new Error('ESP32SIM_REQUIRE_E2E=1 but examples/hello-esp32/build is missing');
}
