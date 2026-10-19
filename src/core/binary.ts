import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DoctorResult } from './types.js';

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
      version = '0.1.0 (mikroverk/esp32sim)';
    } else {
      recommendations.push(`Found esp32sim at ${binaryPath} but failed to run: ${check.error}`);
    }
  } else {
    recommendations.push(
      'esp32sim emulator is not installed. Run `cargo install --git https://github.com/mikroverk/esp32sim esp32sim` or download precompiled binary to ~/.esp32sim/bin/'
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
    recommendations.push('Rust/Cargo is not installed in PATH. Installing Rust lets you build esp32sim locally with `cargo install esp32sim`.');
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

  if (!esp32simFound && rustInstalled) {
    recommendations.push('Quick setup: run `cargo install --git https://github.com/mikroverk/esp32sim esp32sim` to compile and install the simulator.');
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
