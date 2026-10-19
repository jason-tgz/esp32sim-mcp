import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DoctorResult } from './types.js';

// Hosts with a prebuilt esp32sim (see emulator.ts); kept here to avoid an import cycle
const PREBUILT_HOSTS = ['darwin-arm64', 'linux-x64', 'linux-arm64'];

// The esp32sim commit the prebuilt binaries come from and CI tests against
// (keep in sync with ESP32SIM_REF in .github/workflows/emulator.yml; a test checks it).
// esp32sim is not on crates.io and publishes no binaries, so it is built from git.
export const ESP32SIM_TESTED_REV = 'f535f3b42293a76ab64c231a0425f35857ab6cf1';
export const ESP32SIM_INSTALL_COMMAND =
  `cargo install --locked --git https://github.com/mikroverk/esp32sim --rev ${ESP32SIM_TESTED_REV} esp32sim`;

/**
 * Searches for the esp32sim binary in candidate locations
 */
export function resolveEsp32SimBinary(customPath?: string): string | null {
  if (customPath && fs.existsSync(customPath)) {
    return path.resolve(customPath);
  }

  if (process.env.ESP32SIM_PATH && fs.existsSync(process.env.ESP32SIM_PATH)) {
    return path.resolve(process.env.ESP32SIM_PATH);
  }

  // Check in user home directory ~/.esp32sim/bin/esp32sim
  const homeBin = path.join(os.homedir(), '.esp32sim', 'bin', os.platform() === 'win32' ? 'esp32sim.exe' : 'esp32sim');
  if (fs.existsSync(homeBin)) {
    return homeBin;
  }

  // Check in cargo bin directory ~/.cargo/bin/esp32sim
  const cargoBin = path.join(os.homedir(), '.cargo', 'bin', os.platform() === 'win32' ? 'esp32sim.exe' : 'esp32sim');
  if (fs.existsSync(cargoBin)) {
    return cargoBin;
  }

  // Check local project bin
  const localBin = path.resolve('bin', os.platform() === 'win32' ? 'esp32sim.exe' : 'esp32sim');
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  // Check in system PATH
  try {
    const whichCmd = os.platform() === 'win32' ? 'where esp32sim' : 'which esp32sim';
    const result = execSync(whichCmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result.split('\n')[0])) {
      return result.split('\n')[0].trim();
    }
  } catch {
    // Not found in PATH
  }

  return null;
}

/**
 * Searches for mask ROM ELF files for a given chip
 */
export function resolveRomPath(chip: string, customRom?: string): string | undefined {
  if (customRom && fs.existsSync(customRom)) {
    return path.resolve(customRom);
  }

  const norm = chip.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Same lookup order as esp32sim itself, plus our own ~/.esp32sim/roms
  const idfTools = process.env.IDF_TOOLS_PATH || path.join(os.homedir(), '.espressif');
  const espressifRoms = path.join(idfTools, 'tools', 'esp-rom-elfs');
  let espressifVersions: string[] = [];
  try {
    espressifVersions = fs.readdirSync(espressifRoms).sort().reverse().map((v) => path.join(espressifRoms, v));
  } catch {
    // ESP-IDF tools not installed
  }
  const candidateDirs = [
    process.env.ESP32SIM_ROM_DIR,
    path.join(os.homedir(), '.esp32sim', 'roms'),
    ...espressifVersions,
    path.resolve('roms'),
  ].filter(Boolean) as string[];

  const chipPrefix = norm === 's3' || norm === 'esp32s3' ? 'esp32s3'
    : norm === 'c3' || norm === 'esp32c3' ? 'esp32c3'
    : norm === 'c6' || norm === 'esp32c6' ? 'esp32c6'
    : 'esp32';

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      // Find matching rom, e.g. esp32s3_rev0_rom.elf
      const matched = files.find((f) => f.startsWith(chipPrefix) && f.endsWith('_rom.elf'));
      if (matched) {
        return path.join(dir, matched);
      }
    } catch {
      // ignore read error
    }
  }

  return undefined;
}

/**
 * Executes esp32sim --help to verify it works and get version info
 */
export function checkBinary(binaryPath?: string): { valid: boolean; output?: string; error?: string } {
  const resolved = resolveEsp32SimBinary(binaryPath);
  if (!resolved) {
    return { valid: false, error: 'esp32sim binary not found in PATH or ~/.esp32sim/bin' };
  }

  try {
    const res = spawnSync(resolved, ['--help'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    if (res.error) {
      return { valid: false, error: res.error.message };
    }
    const out = (res.stdout || '') + (res.stderr || '');
    if (out.includes('esp32sim') || out.includes('--chip') || out.includes('--boot')) {
      return { valid: true, output: out };
    }
    return { valid: true, output: out };
  } catch (err: any) {
    return { valid: false, error: err?.message || String(err) };
  }
}

/**
 * Runs a complete diagnostic of the development environment
 */
export function runDoctor(customPath?: string): DoctorResult {
  const platform = os.platform();
  const arch = os.arch();
  const recommendations: string[] = [];

  const binaryPath = resolveEsp32SimBinary(customPath) || undefined;
  let esp32simFound = false;
  let version: string | undefined;

  if (binaryPath) {
    const check = checkBinary(binaryPath);
    if (check.valid) {
      esp32simFound = true;
    } else {
      recommendations.push(`Found esp32sim at ${binaryPath} but failed to run: ${check.error}`);
    }
  } else {
    recommendations.push(
      PREBUILT_HOSTS.includes(`${platform}-${arch}`)
        ? 'esp32sim emulator is not installed. Run `npx esp32sim-mcp setup` (prebuilt binary + mask ROMs, SHA-256 verified).'
        : `esp32sim emulator is not installed and there is no prebuilt binary for ${platform}-${arch}. ` +
          `Build it with \`${ESP32SIM_INSTALL_COMMAND}\` (needs Rust: https://rustup.rs), or set ESP32SIM_PATH.`
    );
  }

  const missingRoms = ['esp32', 's3', 'c3', 'c6'].filter((c) => !resolveRomPath(c));
  if (missingRoms.length > 0) {
    recommendations.push(
      `Mask ROM ELF not found for: ${missingRoms.join(', ')}. Run \`npx esp32sim-mcp setup\` or \`fetch-roms\` ` +
      "(Espressif's esp-rom-elfs release into ~/.esp32sim/roms, SHA-256 verified), or install ESP-IDF."
    );
  }

  // Check Rust toolchain
  let rustInstalled = false;
  let rustVersion: string | undefined;
  try {
    const cargoOut = execSync('cargo --version', { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf-8' }).trim();
    rustInstalled = true;
    rustVersion = cargoOut;
  } catch {
    if (!esp32simFound && !PREBUILT_HOSTS.includes(`${platform}-${arch}`)) {
      recommendations.push('Rust/Cargo is not installed. Install it from https://rustup.rs, then build esp32sim as above.');
    }
  }

  // Check ESP-IDF environment (optional, for compiling from source)
  let idfTargetInstalled = false;
  if (process.env.IDF_PATH || process.env.IDF_TARGET) {
    idfTargetInstalled = true;
  } else {
    try {
      execSync('idf.py --version', { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf-8' });
      idfTargetInstalled = true;
    } catch {
      // idf.py not in PATH, which is normal if user tests pre-compiled .bin files
    }
  }


  return {
    esp32simFound,
    binaryPath,
    version,
    rustInstalled,
    rustVersion,
    idfTargetInstalled,
    platform,
    arch,
    recommendations,
  };
}
