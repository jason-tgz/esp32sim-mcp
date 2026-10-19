import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Espressif's mask ROM ELFs (Apache-2.0, espressif/esp-rom-elfs), pinned by release and SHA-256
// like esp32sim's tools/fetch-rom-elfs.sh, so every machine boots the same bytes.
export const ROM_RELEASE = '20260528';
const TARBALL_SHA256 = 'caa463d3cbef2430a5a35847c1d9f2f152403b17a802050927ff60c8da54fe46';
export const ROM_FILES: Record<string, string> = {
  'esp32_rev300_rom.elf': '920b70635440517866aab2230964a570d2cf2b676658d93c52fbac108c1cca31',
  'esp32s3_rev0_rom.elf': 'c0ce0f338d1de1bdc6efbef1591779a2a42c1ab7d759d3c6ae8ae63a7dd34cfd',
  'esp32c3_rev3_rom.elf': '19ac22e08707df926fb0cf4c54795d4067b983fae8635f396ded173a6d78fc3c',
  'esp32c6_rev0_rom.elf': '788e1d38724aeb8fd974fa10c4a7b089c02627d35342ce84b9e0b12b239f3551',
};
const TARBALL_URL = `https://github.com/espressif/esp-rom-elfs/releases/download/${ROM_RELEASE}/esp-rom-elfs-${ROM_RELEASE}.tar.gz`;

export const DEFAULT_ROM_DIR = path.join(os.homedir(), '.esp32sim', 'roms');

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hasValidRom(dir: string, name: string): boolean {
  const file = path.join(dir, name);
  return fs.existsSync(file) && sha256(fs.readFileSync(file)) === ROM_FILES[name];
}

function findFile(dir: string, name: string): string | undefined {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(p, name);
      if (found) return found;
    } else if (entry.name === name) {
      return p;
    }
  }
  return undefined;
}

/**
 * Downloads and verifies the mask ROM ELFs into `dir`; ROMs already there with the right hash are kept
 */
export async function fetchRoms(dir: string = DEFAULT_ROM_DIR): Promise<{ dir: string; downloaded: boolean }> {
  const names = Object.keys(ROM_FILES);
  if (names.every((n) => hasValidRom(dir, n))) return { dir, downloaded: false };

  const res = await fetch(TARBALL_URL);
  if (!res.ok) throw new Error(`Download failed: ${TARBALL_URL} (HTTP ${res.status})`);
  const tarball = Buffer.from(await res.arrayBuffer());
  if (sha256(tarball) !== TARBALL_SHA256) throw new Error(`${TARBALL_URL}: SHA-256 mismatch`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'esp32sim-roms-'));
  try {
    const archive = path.join(tmp, 'roms.tar.gz');
    fs.writeFileSync(archive, tarball);
    execFileSync('tar', ['-xzf', archive, '-C', tmp]);

    fs.mkdirSync(dir, { recursive: true });
    for (const name of names) {
      const src = findFile(tmp, name);
      if (!src) throw new Error(`${name} is not in esp-rom-elfs ${ROM_RELEASE}`);
      if (sha256(fs.readFileSync(src)) !== ROM_FILES[name]) throw new Error(`${name}: SHA-256 mismatch`);
      fs.copyFileSync(src, path.join(dir, name));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { dir, downloaded: true };
}
