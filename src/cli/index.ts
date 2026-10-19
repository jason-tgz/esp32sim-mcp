#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as os from 'os';
import * as path from 'path';
import { runDoctor } from '../core/binary.js';
import { AgentId, ALL_AGENTS, runInit } from '../core/init.js';
import { DEFAULT_ROM_DIR, fetchRoms, ROM_RELEASE } from '../core/roms.js';
import { getBoardsByChip, SUPPORTED_BOARDS } from '../core/boards.js';
import { runExpect } from '../core/expect.js';
import { runSimulation } from '../core/runner.js';
import { startMcpServer } from '../mcp/server.js';

const program = new Command();

program
  .name('esp32sim-mcp')
  .description('Run, test and debug ESP32 firmware in a local emulator via MCP, CLI and agent skill')
  .version('0.1.0');

// 1. MCP Server command
program
  .command('serve', { isDefault: true })
  .description('Start the stdio Model Context Protocol (MCP) server for AI coding agents')
  .action(async () => {
    try {
      await startMcpServer();
    } catch (err: any) {
      console.error(chalk.red('Failed to start MCP server:'), err?.message || err);
      process.exit(1);
    }
  });

// 2. Run simulation command
program
  .command('run')
  .description('Run ESP32 firmware in the local emulator and stream UART output')
  .option('-p, --project-dir <path>', 'Path to ESP-IDF project root or build folder')
  .option('-a, --app <path>', 'Path to application .bin')
  .option('-b, --bootloader <path>', 'Path to bootloader .bin')
  .option('-t, --ptable <path>', 'Path to partition-table .bin')
  .option('-c, --chip <chip>', 'Chip: esp32, s3, c3, c6 (default: from build, else s3)')
  .option('--board <board>', 'Board model to emulate (e.g. atech14)')
  .option('-s, --max-seconds <n>', 'Maximum emulated seconds', parseFloat, 10)
  .option('--stop-after-exceptions <n>', 'Stop after N exceptions', parseInt)
  .option('--console <source>', 'Console source: uart0, usb, both (default), all, none')
  .option('--wifi <spec>', "Virtual access point: 'ssid=demo,psk=secret' or a bare SSID (open network)")
  .option('--tft-png <path>', 'Save LCD screenshot to PNG')
  .option('--script <path>', 'Path to interaction script')
  .action(async (opts) => {
    try {
      console.log(chalk.cyan(`🚀 Starting ESP32 simulation${opts.chip ? ` (${opts.chip})` : ''}...`));
      const res = await runSimulation({
        projectDir: opts.projectDir,
        appBin: opts.app,
        bootloaderBin: opts.bootloader,
        ptableBin: opts.ptable,
        chip: opts.chip,
        board: opts.board,
        maxSeconds: opts.maxSeconds,
        stopAfterExceptions: opts.stopAfterExceptions,
        console: opts.console,
        wifi: opts.wifi,
        tftPng: opts.tftPng,
        script: opts.script,
      });

      console.log(res.uartLogs);
      console.log(chalk.gray('----------------------------------------'));
      console.log(`Stop reason: ${chalk.yellow(res.stopReason)} | Duration: ${res.wallClockTimeMs} ms`);

      if (res.hasCrashed) {
        console.error(chalk.bold.red('❌ Firmware crashed:'));
        for (const exc of res.exceptions) {
          console.error(chalk.red(`  • ${exc}`));
        }
        process.exit(1);
      }

      if (!res.success) {
        process.exit(res.exitCode || 1);
      }
    } catch (err: any) {
      console.error(chalk.red('Error running simulation:'), err?.message || err);
      process.exit(1);
    }
  });

// 3. Expect assertion command (for CI and automated testing)
program
  .command('expect')
  .description('Run firmware and assert expected patterns on UART output (exits 0 on pass, 1 on fail)')
  .requiredOption('--pattern <pattern...>', 'Expected strings or regexes on UART')
  .option('-p, --project-dir <path>', 'Path to ESP-IDF project or build folder')
  .option('-a, --app <path>', 'Path to application .bin')
  .option('-b, --bootloader <path>', 'Path to bootloader .bin')
  .option('-t, --ptable <path>', 'Path to partition-table .bin')
  .option('-c, --chip <chip>', 'Chip: esp32, s3, c3, c6 (default: from build, else s3)')
  .option('--board <board>', 'Board model')
  .option('-s, --max-seconds <n>', 'Maximum emulated seconds', parseFloat, 10)
  .option('--wifi <spec>', "Virtual access point: 'ssid=demo,psk=secret' or a bare SSID (open network)")
  .option('--unordered', 'Allow patterns to appear in any order')
  .option('--script <path>', 'Path to interaction script')
  .action(async (opts) => {
    try {
      const patterns: string[] = Array.isArray(opts.pattern) ? opts.pattern : [opts.pattern];
      const ordered = !opts.unordered;

      console.log(chalk.cyan(`🧪 Testing UART output for ${patterns.length} pattern(s)...`));

      const res = await runExpect({
        patterns,
        ordered,
        projectDir: opts.projectDir,
        appBin: opts.app,
        bootloaderBin: opts.bootloader,
        ptableBin: opts.ptable,
        chip: opts.chip,
        board: opts.board,
        maxSeconds: opts.maxSeconds,
        wifi: opts.wifi,
        script: opts.script,
      });

      if (res.passed) {
        console.log(chalk.bold.green(`✅ ALL PATTERNS MATCHED (${res.matchedCount}/${res.totalPatterns}):`));
        for (const p of res.patternResults) {
          console.log(chalk.green(`  ✔ [L${p.lineNumber}] ${p.pattern} -> "${p.matchedLine}"`));
        }
        process.exit(0);
      } else {
        console.error(chalk.bold.red(`❌ EXPECTATION FAILED (${res.matchedCount}/${res.totalPatterns} matched):`));
        for (const p of res.patternResults) {
          if (p.matched) {
            console.error(chalk.green(`  ✔ [L${p.lineNumber}] ${p.pattern}`));
          } else {
            console.error(chalk.red(`  ✖ MISSING: "${p.pattern}"`));
          }
        }
        if (res.diffSummary) {
          console.error(chalk.yellow(`\n${res.diffSummary}`));
        }
        process.exit(1);
      }
    } catch (err: any) {
      console.error(chalk.red('Expect test failed with error:'), err?.message || err);
      process.exit(1);
    }
  });

// 4. List boards
program
  .command('list')
  .description('List supported ESP32 chips, boards and virtual peripherals')
  .option('-c, --chip <chip>', 'Filter by chip (esp32, s3, c3, c6)')
  .action((opts) => {
    const boards = getBoardsByChip(opts.chip);
    console.log(chalk.bold.cyan('\n📋 Supported ESP32 Boards in esp32sim:\n'));
    for (const b of boards) {
      console.log(chalk.bold.white(`• ${b.name} (${chalk.yellow(b.id)})`));
      console.log(chalk.dim(`  Chip: ${b.chip.toUpperCase()} | CPU: ${b.cpu} | Status: ${b.status}`));
      console.log(chalk.dim(`  Display: ${b.hasDisplay ? b.displayResolution : 'None'} | WiFi: ${b.hasWifi ? 'Yes' : 'No'}`));
      if (b.buttons.length > 0) {
        console.log(chalk.dim(`  Buttons: ${b.buttons.join(', ')}`));
      }
      console.log(chalk.gray(`  ${b.description}\n`));
    }
  });

// 5. Doctor command
program
  .command('doctor')
  .description('Check system dependencies (esp32sim binary, Rust, ESP-IDF)')
  .action(() => {
    const doc = runDoctor();
    console.log(chalk.bold.cyan('\n🩺 esp32sim-mcp Doctor Check:\n'));
    console.log(`• esp32sim emulator: ${doc.esp32simFound ? chalk.green('✅ Installed') : chalk.red('❌ Not Found')}`);
    if (doc.binaryPath) console.log(chalk.dim(`  Path: ${doc.binaryPath}`));
    if (doc.version) console.log(chalk.dim(`  Version: ${doc.version}`));
    console.log(`• Rust / Cargo:      ${doc.rustInstalled ? chalk.green(`✅ ${doc.rustVersion}`) : chalk.yellow('⚠️ Not found in PATH')}`);
    console.log(`• Host Architecture: ${chalk.white(`${doc.platform} (${doc.arch})`)}`);

    console.log('');
    if (doc.recommendations.length > 0) {
      console.log(chalk.yellow('💡 Recommendations:'));
      for (const rec of doc.recommendations) {
        console.log(chalk.yellow(`  • ${rec}`));
      }
    } else {
      console.log(chalk.bold.green('✨ All requirements are met! Ready to simulate.'));
    }
    console.log('');
  });

// 6. Fetch mask ROMs
program
  .command('fetch-roms')
  .description(`Download Espressif's mask ROM ELFs (esp-rom-elfs ${ROM_RELEASE}, SHA-256 verified)`)
  .option('-d, --dir <path>', 'Target directory', DEFAULT_ROM_DIR)
  .action(async (opts) => {
    try {
      const res = await fetchRoms(opts.dir);
      console.log(
        res.downloaded
          ? chalk.green(`✅ Mask ROMs from esp-rom-elfs ${ROM_RELEASE} saved to ${res.dir}`)
          : chalk.gray(`· Mask ROMs already present in ${res.dir}`)
      );
    } catch (err: any) {
      console.error(chalk.red('Could not fetch mask ROMs:'), err?.message || err);
      process.exit(1);
    }
  });

// 7. Init command: writes MCP config and the agent skill for detected coding agents
program
  .command('init')
  .description('Detect coding agents (Claude Code, Codex, Cursor, Claude Desktop) and write MCP config + skill')
  .option('-g, --global', 'Configure user-level settings instead of this project')
  .option('--agent <agents...>', `Only configure these agents: ${ALL_AGENTS.join(', ')}`)
  .option('--no-skill', 'Do not install the esp32sim agent skill')
  .option('--dry-run', 'Show what would change without writing anything')
  .action((opts) => {
    const agents: AgentId[] | undefined = opts.agent;
    const unknown = agents?.filter((a) => !ALL_AGENTS.includes(a));
    if (unknown && unknown.length > 0) {
      console.error(chalk.red(`Unknown agent(s): ${unknown.join(', ')}. Choose from: ${ALL_AGENTS.join(', ')}`));
      process.exit(2);
    }

    const scope = opts.global ? 'user' : `project (${process.cwd()})`;
    console.log(chalk.bold.cyan(`\n🚀 esp32sim-mcp init: ${scope}${opts.dryRun ? ', dry run' : ''}\n`));

    const actions = runInit({
      cwd: process.cwd(),
      home: os.homedir(),
      platform: os.platform(),
      appData: process.env.APPDATA,
      global: opts.global,
      agents,
      skill: opts.skill,
      dryRun: opts.dryRun,
    });

    if (actions.length === 0) {
      console.log(chalk.yellow('No coding agent detected. Pick one explicitly, e.g.:'));
      console.log(chalk.yellow('  npx esp32sim-mcp init --agent claude-code'));
      process.exit(1);
    }

    const icon: Record<string, string> = {
      written: chalk.green('✅ written  '),
      unchanged: chalk.gray('·  unchanged'),
      'would-write': chalk.cyan('…  would write'),
      skipped: chalk.yellow('⚠️ skipped  '),
      error: chalk.red('❌ error    '),
    };
    for (const a of actions) {
      const shown = a.target.startsWith(process.cwd() + path.sep) ? path.relative(process.cwd(), a.target) : a.target;
      console.log(`  ${icon[a.status]} ${chalk.bold(a.agent)} ${a.kind}: ${shown}`);
      if (a.detail) console.log(chalk.dim(`       ${a.detail}`));
    }

    if (actions.some((a) => a.status === 'error')) process.exit(1);
    if (opts.dryRun) return;
    console.log(chalk.bold.green('\n🎉 Done. Restart your agent, then run `npx esp32sim-mcp doctor` to check the emulator.\n'));
  });

program.parse(process.argv);
