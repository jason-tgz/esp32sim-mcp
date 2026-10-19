import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import stripAnsi from 'strip-ansi';
import { resolveEsp32SimBinary, resolveRomPath } from './binary.js';
import { getBoardById } from './boards.js';
import { resolveFirmware } from './firmware.js';
import { writeTempScript } from './script.js';
import { SimResult, SimRunOptions } from './types.js';

/**
 * Common panic and exception patterns produced by ESP-IDF and FreeRTOS
 */
const EXCEPTION_PATTERNS = [
  /Guru Meditation Error: Core \d+ panic'ed \(([^)]+)\)/i,
  /abort\(\) was called at PC/i,
  /assert failed: (.+)/i,
  /Stack overflow in task (.+)/i,
  /CORRUPT HEAP: (.+)/i,
  /IllegalInstruction/i,
  /StoreProhibited/i,
  /LoadProhibited/i,
  /DoubleException/i,
  /Unhandled exception: (.+)/i,
];

// Lines esp32sim prints on stderr when the run ends
const SCRIPT_STOP_PATTERN = /^\[script\] t=[\d.]+s stop\b/im;
const EXCEPTION_LIMIT_PATTERN = /^\[emu\] stop: Exceptions\(\d+\)/m;
const EMULATED_TIME_PATTERN = /^\[emu\] stop: .*?emulated ([\d.]+)s/m;

/**
 * esp32sim's `--wifi` takes `key=value` pairs; a bare word is treated as an open network's SSID
 */
export function normalizeWifiSpec(wifi: string): string {
  return wifi.includes('=') ? wifi : `ssid=${wifi}`;
}

/**
 * Runs esp32sim with the configured options and returns a structured result
 */
export async function runSimulation(options: SimRunOptions): Promise<SimResult> {
  const startTime = Date.now();
  const binaryPath = resolveEsp32SimBinary(options.esp32simPath);

  if (!binaryPath) {
    throw new Error(
      'esp32sim binary not found in PATH or ~/.esp32sim/bin. ' +
      'Run `esp32sim-mcp doctor` or `cargo install --git https://github.com/mikroverk/esp32sim esp32sim` to install it.'
    );
  }

  // Resolve firmware files
  const firmware = resolveFirmware({
    projectDir: options.projectDir,
    appBin: options.appBin,
    bootloaderBin: options.bootloaderBin,
    ptableBin: options.ptableBin,
    elfFile: options.elfFile,
    flashImage: options.flashImage,
    chip: options.chip,
  });

  const chip = options.chip || firmware.chip || 's3';
  const args: string[] = ['--chip', chip];

  // Configure boot & binaries
  if (firmware.flashImage) {
    args.push('--flash-image', firmware.flashImage);
  } else {
    if (firmware.bootloaderBin && firmware.ptableBin && firmware.appBin) {
      args.push('--boot', 'rom');
      const romPath = resolveRomPath(chip, options.romBin);
      if (romPath) {
        args.push('--rom', romPath);
      }
      args.push('--bootloader', firmware.bootloaderBin);
      args.push('--ptable', firmware.ptableBin);
      args.push('--app', firmware.appBin);
    } else if (firmware.appBin) {
      args.push('--boot', 'app');
      args.push('--app', firmware.appBin);
    }
  }

  if (firmware.elfPath) {
    args.push('--elf', firmware.elfPath);
  }

  // Board selection
  if (options.board) {
    args.push('--board', options.board);
    const spec = getBoardById(options.board);
    if (spec?.requiredArgs && !spec.requiredArgs.some((a) => options.customArgs?.includes(a))) {
      args.push(...spec.requiredArgs);
    }
  }

  // Emulation limits
  const maxSeconds = options.maxSeconds ?? 10;
  args.push('--max-seconds', maxSeconds.toString());

  if (options.stopAfterExceptions !== undefined) {
    args.push('--stop-after-exceptions', options.stopAfterExceptions.toString());
  }

  // Console output
  if (options.console) {
    args.push('--console', options.console);
  } else {
    args.push('--console', 'uart0');
  }

  // Networking / WiFi
  if (options.wifi) {
    args.push('--wifi', normalizeWifiSpec(options.wifi));
  }
  if (options.net) {
    args.push('--net', options.net);
  }

  // Screenshot capture
  let tempTftPng: string | undefined;
  if (options.tftPng) {
    args.push('--tft-png', options.tftPng);
  }

  // Serial input
  if (options.serialInput) {
    args.push('--serial', options.serialInput);
  }

  // Script setup
  let scriptCleanup: (() => void) | undefined;
  if (options.script) {
    if (typeof options.script === 'string' && fs.existsSync(options.script)) {
      args.push('--script', path.resolve(options.script));
    } else {
      const tempScript = writeTempScript(options.script);
      args.push('--script', tempScript.filePath);
      scriptCleanup = tempScript.cleanup;
    }
  }

  // Custom extra args
  if (options.customArgs && options.customArgs.length > 0) {
    args.push(...options.customArgs);
  }

  const timeoutMs = options.timeoutMs ?? 30000;

  return new Promise<SimResult>((resolve) => {
    let stdoutData = '';
    let stderrData = '';
    let timedOut = false;
    let proc: any;

    const timer = setTimeout(() => {
      timedOut = true;
      if (proc) {
        try {
          proc.kill('SIGTERM');
        } catch {
          // ignore
        }
      }
    }, timeoutMs);

    try {
      proc = spawn(binaryPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (scriptCleanup) scriptCleanup();
      return resolve({
        success: false,
        exitCode: 1,
        stopReason: 'error',
        uartLogs: '',
        rawStdout: '',
        rawStderr: err?.message || String(err),
        wallClockTimeMs: Date.now() - startTime,
        exceptions: [err?.message || String(err)],
        hasCrashed: true,
      });
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdoutData += chunk.toString('utf-8');
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrData += chunk.toString('utf-8');
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (scriptCleanup) scriptCleanup();

      const wallClock = Date.now() - startTime;
      const cleanStdout = options.stripAnsi !== false ? stripAnsi(stdoutData) : stdoutData;
      const cleanStderr = options.stripAnsi !== false ? stripAnsi(stderrData) : stderrData;
      const combinedLogs = cleanStdout + (cleanStderr ? '\n' + cleanStderr : '');

      // Exception detection
      const foundExceptions: string[] = [];
      let panicMessage: string | undefined;

      for (const line of combinedLogs.split('\n')) {
        for (const pattern of EXCEPTION_PATTERNS) {
          const match = line.match(pattern);
          if (match) {
            foundExceptions.push(line.trim());
            if (!panicMessage) panicMessage = line.trim();
          }
        }
      }

      const hasCrashed = foundExceptions.length > 0 || code === 2;
      let stopReason: SimResult['stopReason'] = 'completed';

      if (timedOut) {
        stopReason = 'timeout';
      } else if (foundExceptions.length > 0) {
        stopReason = 'exception';
      } else if (SCRIPT_STOP_PATTERN.test(cleanStderr)) {
        stopReason = 'script_stop';
      } else if (EXCEPTION_LIMIT_PATTERN.test(cleanStderr)) {
        stopReason = 'exception_limit';
      } else if (code !== 0 && code !== null) {
        stopReason = 'error';
      }

      const emulatedMatch = cleanStderr.match(EMULATED_TIME_PATTERN);
      const emulatedSeconds = emulatedMatch ? parseFloat(emulatedMatch[1]) : undefined;

      // Handle display screenshot if requested
      let screenshotBase64: string | undefined;
      const screenshotTarget = options.tftPng || tempTftPng;
      if (screenshotTarget && fs.existsSync(screenshotTarget)) {
        try {
          const buf = fs.readFileSync(screenshotTarget);
          screenshotBase64 = buf.toString('base64');
        } catch {
          // ignore screenshot read error
        }
      }

      resolve({
        success: !hasCrashed && !timedOut && (code === 0 || code === null),
        exitCode: code ?? (timedOut ? 124 : 0),
        stopReason,
        uartLogs: cleanStdout,
        rawStdout: stdoutData,
        rawStderr: stderrData,
        emulatedSeconds,
        wallClockTimeMs: wallClock,
        exceptions: foundExceptions,
        hasCrashed,
        panicMessage,
        screenshotPath: screenshotTarget && fs.existsSync(screenshotTarget) ? path.resolve(screenshotTarget) : undefined,
        screenshotBase64,
      });
    });

    proc.on('error', (err: any) => {
      clearTimeout(timer);
      if (scriptCleanup) scriptCleanup();
      resolve({
        success: false,
        exitCode: 1,
        stopReason: 'error',
        uartLogs: '',
        rawStdout: stdoutData,
        rawStderr: (stderrData ? stderrData + '\n' : '') + (err?.message || String(err)),
        wallClockTimeMs: Date.now() - startTime,
        exceptions: [err?.message || String(err)],
        hasCrashed: true,
      });
    });
  });
}
