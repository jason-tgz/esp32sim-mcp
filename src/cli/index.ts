#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runDoctor } from '../core/binary.js';
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
  .option('-c, --chip <chip>', 'Chip architecture: esp32, s3, c3, c6', 's3')
  .option('--board <board>', 'Board model to emulate (e.g. atech14)')
  .option('-s, --max-seconds <n>', 'Maximum emulated seconds', parseFloat, 10)
  .option('--stop-after-exceptions <n>', 'Stop after N exceptions', parseInt)
  .option('--console <source>', 'Console source (uart0, usb, both, all, none)', 'uart0')
  .option('--wifi <ssid>', 'Virtual WiFi network')
  .option('--tft-png <path>', 'Save LCD screenshot to PNG')
  .option('--script <path>', 'Path to interaction script')
  .action(async (opts) => {
    try {
      console.log(chalk.cyan(`🚀 Starting ESP32 simulation (${opts.chip})...`));
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
  .option('-c, --chip <chip>', 'Target chip: esp32, s3, c3, c6', 's3')
  .option('--board <board>', 'Board model')
  .option('-s, --max-seconds <n>', 'Maximum emulated seconds', parseFloat, 10)
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

// 6. Init command (auto-configures Claude Desktop, Cursor, Cline, etc.)
program
  .command('init')
  .description('Automatically detect coding agents (Claude Desktop, Cursor, Windsurf) and write MCP configuration')
  .action(() => {
    console.log(chalk.bold.cyan('\n🚀 esp32sim-mcp: Initializing Agent Configuration\n'));
    const home = os.homedir();
    const platform = os.platform();

    interface TargetConfig {
      name: string;
      configPath: string;
    }

    const targets: TargetConfig[] = [];

    // Claude Desktop
    if (platform === 'darwin') {
      targets.push({
        name: 'Claude Desktop',
        configPath: path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      });
    } else if (platform === 'win32') {
      targets.push({
        name: 'Claude Desktop',
        configPath: path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
      });
    } else {
      targets.push({
        name: 'Claude Desktop',
        configPath: path.join(home, '.config', 'Claude', 'claude_desktop_config.json'),
      });
    }

    // Cursor
    targets.push({
      name: 'Cursor (Workspace)',
      configPath: path.resolve('.cursor', 'mcp.json'),
    });
    targets.push({
      name: 'Cursor (Global)',
      configPath: path.join(home, '.cursor', 'mcp.json'),
    });

    let modifiedCount = 0;

    for (const t of targets) {
      const exists = fs.existsSync(t.configPath);
      const dirExists = fs.existsSync(path.dirname(t.configPath));

      if (exists || dirExists) {
        try {
          let json: any = { mcpServers: {} };
          if (exists) {
            const raw = fs.readFileSync(t.configPath, 'utf-8');
            try {
              json = JSON.parse(raw);
            } catch {
              json = { mcpServers: {} };
            }
          }
          if (!json.mcpServers) json.mcpServers = {};

          json.mcpServers['esp32sim'] = {
            command: 'npx',
            args: ['-y', 'esp32sim-mcp', 'serve'],
          };

          fs.mkdirSync(path.dirname(t.configPath), { recursive: true });
          fs.writeFileSync(t.configPath, JSON.stringify(json, null, 2), 'utf-8');
          console.log(chalk.green(`  ✅ Configured ${t.name} at: ${t.configPath}`));
          modifiedCount++;
        } catch (err: any) {
          console.log(chalk.yellow(`  ⚠️ Could not write ${t.name}: ${err?.message}`));
        }
      }
    }

    if (modifiedCount === 0) {
      // Default to workspace .cursor/mcp.json
      const wsConfig = path.resolve('.cursor', 'mcp.json');
      fs.mkdirSync(path.dirname(wsConfig), { recursive: true });
      fs.writeFileSync(
        wsConfig,
        JSON.stringify(
          {
            mcpServers: {
              esp32sim: {
                command: 'npx',
                args: ['-y', 'esp32sim-mcp', 'serve'],
              },
            },
          },
          null,
          2
        ),
        'utf-8'
      );
      console.log(chalk.green(`  ✅ Created workspace MCP configuration at ${wsConfig}`));
    }

    console.log(chalk.bold.green('\n🎉 MCP server setup complete!\n'));
  });

program.parse(process.argv);
