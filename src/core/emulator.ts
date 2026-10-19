import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ESP32SIM_TESTED_REV } from './binary.js';
import { withVerifiedTarball } from './download.js';

// Prebuilt esp32sim archives attached to this repo's release `esp32sim-<rev>` by
// .github/workflows/emulator.yml. Hashes come from that run's .sha256 files.
const RELEASES_URL = 'https://github.com/stramanu/esp32sim-mcp/releases/download';
const SHORT_REV = ESP32SIM_TESTED_REV.slice(0, 7);
export const EMULATOR_RELEASE_TAG = `esp32sim-${SHORT_REV}`;

export const EMULATOR_ASSETS: Record<string, string> = {
  'darwin-arm64': 'd96b796660fe46b848b5109fc7cb098e12ff49ba3fc37c3d80087886cd57bd14',
  'linux-x64': 'fa517318426f120d9298a8e80ffb04961fdfe8de55d36e68efd613be1c606e1c',
  'linux-arm64': '0f8327041be93aa9a610b01c7ab751f75fb95dc65027b2e1f748056af9ec1afa',
};

const BINARIES = ['esp32sim', 'esp32sim-c3', 'esp32sim-c6'];
export const DEFAULT_BIN_DIR = path.join(os.homedir(), '.esp32sim', 'bin');
// Records which esp32sim commit the binaries in the bin directory come from
const REV_FILE = '.esp32sim-rev';

/**
 * The prebuilt asset for this host, or undefined when it has to be built with cargo
 */
export function platformAsset(platform: string = os.platform(), arch: string = os.arch()): string | undefined {
  const key = `${platform}-${arch}`;
  return key in EMULATOR_ASSETS ? key : undefined;
}

/**
 * Downloads and verifies the prebuilt esp32sim into `dir`. A binary already there that this
 * installer did not put (e.g. a manual build) is only replaced with `force`.
 */
export async function installEmulator(
  dir: string = DEFAULT_BIN_DIR,
  force = false
): Promise<{ dir: string; binary: string; downloaded: boolean; kept?: 'user-managed' }> {
  const asset = platformAsset();
  if (!asset) {
    throw new Error(`No prebuilt esp32sim for ${os.platform()}-${os.arch()}; build it with cargo (see \`esp32sim-mcp doctor\`).`);
  }
  const binary = path.join(dir, 'esp32sim');
  const revFile = path.join(dir, REV_FILE);
  if (!force && fs.existsSync(binary)) {
    if (!fs.existsSync(revFile)) return { dir, binary, downloaded: false, kept: 'user-managed' };
    if (fs.readFileSync(revFile, 'utf-8').trim() === ESP32SIM_TESTED_REV) return { dir, binary, downloaded: false };
  }

  const name = `esp32sim-${SHORT_REV}-${asset}`;
  await withVerifiedTarball(`${RELEASES_URL}/${EMULATOR_RELEASE_TAG}/${name}.tar.gz`, EMULATOR_ASSETS[asset], (tmp) => {
    fs.mkdirSync(dir, { recursive: true });
    for (const file of [...BINARIES, 'LICENSE', 'SOURCE.txt']) {
      const src = path.join(tmp, name, file);
      if (!fs.existsSync(src)) throw new Error(`${file} missing from ${name}.tar.gz`);
      const dest = path.join(dir, file === 'LICENSE' ? 'esp32sim-LICENSE' : file === 'SOURCE.txt' ? 'esp32sim-SOURCE.txt' : file);
      fs.copyFileSync(src, dest);
      if (BINARIES.includes(file)) fs.chmodSync(dest, 0o755);
    }
    fs.writeFileSync(revFile, ESP32SIM_TESTED_REV + '\n');
  });
  return { dir, binary, downloaded: true };
}
