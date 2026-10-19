import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as os from 'os';
import * as path from 'path';
import { runDoctor } from '../core/binary.js';
import { getBoardsByChip, SUPPORTED_BOARDS } from '../core/boards.js';
import { runExpect } from '../core/expect.js';
import { runSimulation } from '../core/runner.js';
import { SimEvent } from '../core/types.js';
import { VERSION } from '../version.js';

const CHIP_SCHEMA = {
  type: 'string',
  enum: ['esp32', 's3', 'c3', 'c6'],
  description: 'Target chip family. Default is s3 (ESP32-S3).',
};

const BOARD_SCHEMA = {
  type: 'string',
  description:
    "Board model: S3 'atech14' (default), 'waveshare-lcd4b', 'waveshare-amoled18-v2', 'waveshare-cam'; " +
    "C6 'waveshare-c6-lcd147'; ESP32 'ttgo-tdisplay', 'esp32dev-loopback'; 'none' for a bare module. " +
    'Omit on the C3, which has no boards. See sim_list_boards.',
};

const WIFI_SCHEMA = {
  type: 'string',
  description:
    "Attach a virtual access point with DHCP/DNS/NAT. Spec like 'ssid=demo,psk=secret' " +
    "(keys: ssid, psk, chan, bssid), or a bare SSID for an open network. Station gets 10.0.2.15.",
};

const FIRMWARE_PROPERTIES = {
  projectDir: {
    type: 'string',
    description: 'Path to the ESP-IDF project root or build folder. If omitted, uses current working directory.',
  },
  appBin: { type: 'string', description: 'Direct path to the application binary (.bin).' },
  bootloaderBin: { type: 'string', description: 'Direct path to bootloader.bin (needed with appBin for a real ROM boot).' },
  ptableBin: { type: 'string', description: 'Direct path to partition-table.bin (needed with appBin for a real ROM boot).' },
  chip: CHIP_SCHEMA,
  board: BOARD_SCHEMA,
};

const EVENTS_SCHEMA = {
  type: 'array',
  description: 'Host actions at emulated times.',
  items: {
    type: 'object',
    properties: {
      time: { type: 'number', description: 'Emulated second when the event fires (e.g. 1.5).' },
      action: { type: 'string', enum: ['press', 'release', 'gpio', 'knob', 'serial', 'uart', 'touch', 'stop'] },
      target: {
        type: 'string',
        description: "press/release: button name for the board ('btn1', 'btn2', 'sw', 'boot', 'right') or a GPIO number.",
      },
      durationMs: { type: 'number', description: 'press: how long the button is held (e.g. 150).' },
      pin: { type: 'number', description: 'gpio: pin number to drive.' },
      level: { type: 'number', enum: [0, 1], description: 'gpio: level to drive.' },
      direction: { type: 'string', enum: ['cw', 'ccw'], description: 'knob: encoder direction.' },
      steps: { type: 'number', description: 'knob: number of detents.' },
      data: {
        type: 'string',
        description: 'serial: text into the USB-Serial/JTAG console. uart: one line into the UART receive FIFO.',
      },
      port: { type: 'number', enum: [0, 1], description: 'uart: UART port (default 0).' },
      x: { type: 'number', description: 'touch: x coordinate.' },
      y: { type: 'number', description: 'touch: y coordinate.' },
      down: { type: 'boolean', description: 'touch: true presses (default), false releases.' },
    },
    required: ['time', 'action'],
  },
};

export function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'esp32sim-mcp',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // 1. List Available Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'sim_run',
          description:
            'Boots and simulates ESP32 firmware in a local emulator without hardware. ' +
            'Captures UART logs, FreeRTOS asserts, memory faults, and stop reason.',
          inputSchema: {
            type: 'object',
            properties: {
              ...FIRMWARE_PROPERTIES,
              maxSeconds: {
                type: 'number',
                description: 'Maximum emulated time in seconds (default: 10s). Emulation usually runs faster than real time.',
              },
              stopAfterExceptions: {
                type: 'number',
                description:
                  'Stop after N CPU exceptions (unset by default). Counts every exception, including the window ' +
                  'overflow/underflow ones Xtensa firmware takes constantly, so it is a debugging aid, not a crash detector. ' +
                  'Panics are detected from the log regardless.',
              },
              console: {
                type: 'string',
                enum: ['uart0', 'usb', 'both', 'all', 'none'],
                description: 'Console source to capture (default: both = UART0 + USB-Serial/JTAG). ' +
                  'Lines ESP-IDF mirrors on both consoles are shown once.',
              },
              wifi: WIFI_SCHEMA,
            },
          },
        },
        {
          name: 'sim_script',
          description:
            'Simulates hardware interactions (button presses, GPIO levels, rotary encoder turns, touch, ' +
            'UART/console input) at specific emulated timestamps, capturing interactive firmware behavior.',
          inputSchema: {
            type: 'object',
            properties: {
              ...FIRMWARE_PROPERTIES,
              maxSeconds: { type: 'number', description: 'Total simulation duration in seconds (default 15).' },
              wifi: WIFI_SCHEMA,
              events: EVENTS_SCHEMA,
              scriptContent: {
                type: 'string',
                description: 'Raw esp32sim script text instead of events (e.g. "1.5 press btn1 150\\n3.0 stop").',
              },
            },
          },
        },
        {
          name: 'sim_expect',
          description:
            'Runs firmware in simulation and asserts that specific text or regex patterns appear on UART. ' +
            'Ideal for automated unit & integration testing in a Red-Green-Refactor agent loop.',
          inputSchema: {
            type: 'object',
            properties: {
              patterns: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Expected console output. Plain text matches as a substring of a line ("Counter: 5"); ' +
                  'write a regular expression between slashes ("/Counter: \\\\d+/", "/wifi.*connected/i").',
              },
              ordered: {
                type: 'boolean',
                description: 'Whether patterns must appear in exact chronological sequence (default: true).',
              },
              ...FIRMWARE_PROPERTIES,
              maxSeconds: { type: 'number', description: 'Max emulated seconds to wait for patterns (default 10).' },
              wifi: WIFI_SCHEMA,
              events: { ...EVENTS_SCHEMA, description: 'Optional interaction events before checking patterns.' },
            },
            required: ['patterns'],
          },
        },
        {
          name: 'sim_screenshot',
          description:
            'Captures a snapshot image of the virtual LCD/TFT display buffer at a specified emulated time.',
          inputSchema: {
            type: 'object',
            properties: {
              ...FIRMWARE_PROPERTIES,
              board: {
                type: 'string',
                default: 'atech14',
                description:
                  "Board with a display: 'atech14', 'waveshare-lcd4b', 'waveshare-amoled18-v2' (S3), " +
                  "'waveshare-c6-lcd147' (C6), 'ttgo-tdisplay' (ESP32).",
              },
              timeSeconds: {
                type: 'number',
                default: 3,
                description: 'Emulated second at which to take the screenshot.',
              },
            },
          },
        },
        {
          name: 'sim_list_boards',
          description:
            'Returns the catalogue of all supported ESP32 chips, boards, displays, peripherals and capabilities.',
          inputSchema: {
            type: 'object',
            properties: {
              chip: { ...CHIP_SCHEMA, description: 'Filter boards by chip family.' },
            },
          },
        },
        {
          name: 'sim_doctor',
          description:
            'Validates local environment: checks if esp32sim binary is installed, checks Rust/Cargo, and provides setup instructions.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  // 2. Handle Tool Invocations
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'sim_run') {
        const result = await runSimulation({
          projectDir: args?.projectDir as string,
          appBin: args?.appBin as string,
          bootloaderBin: args?.bootloaderBin as string,
          ptableBin: args?.ptableBin as string,
          chip: args?.chip as any,
          board: args?.board as string,
          maxSeconds: (args?.maxSeconds as number) ?? 10,
          stopAfterExceptions: args?.stopAfterExceptions as number | undefined,
          console: args?.console as any,
          wifi: args?.wifi as string,
        });

        const statusEmoji = result.success ? '✅ PASSED' : '❌ FAILED';
        let summary = `### Simulation Result: ${statusEmoji}\n\n`;
        summary += `- **Exit Code:** ${result.exitCode}\n`;
        summary += `- **Stop Reason:** ${result.stopReason}\n`;
        if (result.emulatedSeconds !== undefined) {
          summary += `- **Emulated:** ${result.emulatedSeconds}s\n`;
        }
        summary += `- **Duration:** ${result.wallClockTimeMs} ms wall-clock\n`;

        if (result.hasCrashed) {
          summary += `\n> ⚠️ **CRASH DETECTED:**\n`;
          for (const exc of result.exceptions) {
            summary += `> - \`${exc}\`\n`;
          }
        }

        summary += `\n#### UART Console Output:\n\`\`\`text\n${result.uartLogs.trim() || '(No UART output captured)'}\n\`\`\``;

        return {
          content: [{ type: 'text', text: summary }],
          isError: !result.success,
        };
      }

      if (name === 'sim_script') {
        const events = (args?.events as SimEvent[]) || [];
        const scriptContent = args?.scriptContent as string;

        const result = await runSimulation({
          projectDir: args?.projectDir as string,
          appBin: args?.appBin as string,
          bootloaderBin: args?.bootloaderBin as string,
          ptableBin: args?.ptableBin as string,
          chip: args?.chip as any,
          board: args?.board as string,
          maxSeconds: (args?.maxSeconds as number) ?? 15,
          wifi: args?.wifi as string,
          script: scriptContent || events,
        });

        let text = `### Scripted Simulation Result: ${result.success ? '✅ COMPLETED' : '❌ FAILED'}\n\n`;
        text += `- **Stop Reason:** ${result.stopReason}\n`;
        if (result.hasCrashed) {
          text += `- **Crash:** \`${result.panicMessage}\`\n`;
        }
        text += `- **Wall-clock:** ${result.wallClockTimeMs} ms\n\n`;
        text += `#### UART Output:\n\`\`\`text\n${result.uartLogs.trim() || '(No output)'}\n\`\`\``;

        return {
          content: [{ type: 'text', text }],
          isError: !result.success,
        };
      }

      if (name === 'sim_expect') {
        const patterns = (args?.patterns as string[]) || [];
        const events = args?.events as SimEvent[] | undefined;

        const result = await runExpect({
          patterns,
          ordered: (args?.ordered as boolean) ?? true,
          projectDir: args?.projectDir as string,
          appBin: args?.appBin as string,
          bootloaderBin: args?.bootloaderBin as string,
          ptableBin: args?.ptableBin as string,
          chip: args?.chip as any,
          board: args?.board as string,
          maxSeconds: (args?.maxSeconds as number) ?? 10,
          wifi: args?.wifi as string,
          script: events,
        });

        let text = `### Expect Test: ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n\n`;
        text += `Matched **${result.matchedCount} / ${result.totalPatterns}** patterns.\n\n`;

        for (const pr of result.patternResults) {
          if (pr.matched) {
            text += `- ✅ **Matched** (line ${pr.lineNumber}): \`${pr.pattern}\`\n  *Output:* \`${pr.matchedLine}\`\n`;
          } else {
            text += `- ❌ **Missing**: \`${pr.pattern}\`\n`;
          }
        }

        if (result.diffSummary) {
          text += `\n#### Failure Details:\n\`\`\`text\n${result.diffSummary}\n\`\`\`\n`;
        }

        text += `\n#### Full UART Logs:\n\`\`\`text\n${result.simResult.uartLogs.trim()}\n\`\`\``;

        return {
          content: [{ type: 'text', text }],
          isError: !result.passed,
        };
      }

      if (name === 'sim_screenshot') {
        const timeSec = (args?.timeSeconds as number) ?? 3;
        const board = (args?.board as string) ?? 'atech14';
        const tmpScreenshot = path.join(os.tmpdir(), `esp32_screen_${Date.now()}.png`);

        const result = await runSimulation({
          projectDir: args?.projectDir as string,
          appBin: args?.appBin as string,
          bootloaderBin: args?.bootloaderBin as string,
          ptableBin: args?.ptableBin as string,
          chip: (args?.chip as any) ?? 's3',
          board,
          maxSeconds: timeSec,
          tftPng: tmpScreenshot,
        });

        const content: any[] = [];
        let summary = `### Display Snapshot: ${board} at t=${timeSec}s\n\n`;

        if (result.screenshotBase64) {
          summary += `Screenshot captured successfully!\n`;
          content.push({
            type: 'text',
            text: summary,
          });
          content.push({
            type: 'image',
            data: result.screenshotBase64,
            mimeType: 'image/png',
          });
        } else {
          summary += `⚠️ No display output was generated (does firmware initialize ST7789/ST7701S display driver?).\n\n`;
          summary += `#### UART Log:\n\`\`\`text\n${result.uartLogs.trim()}\n\`\`\``;
          content.push({
            type: 'text',
            text: summary,
          });
        }

        return {
          content,
          isError: !result.screenshotBase64,
        };
      }

      if (name === 'sim_list_boards') {
        const boards = getBoardsByChip(args?.chip as string);
        let markdown = `### Supported Boards in esp32sim\n\n`;
        markdown += `| Board ID | Name | Chip | CPU | Display | Buttons | Status |\n`;
        markdown += `| --- | --- | --- | --- | --- | --- | --- |\n`;

        for (const b of boards) {
          const disp = b.hasDisplay ? b.displayResolution || 'Yes' : 'No';
          const btns = b.buttons.length > 0 ? b.buttons.join(', ') : 'None';
          markdown += `| \`${b.id}\` | ${b.name} | ${b.chip.toUpperCase()} | ${b.cpu} | ${disp} | ${btns} | ${b.status} |\n`;
        }

        return {
          content: [{ type: 'text', text: markdown }],
        };
      }

      if (name === 'sim_doctor') {
        const doc = runDoctor();
        let markdown = `### esp32sim-mcp Diagnostic Report\n\n`;
        markdown += `- **esp32sim Installed:** ${doc.esp32simFound ? '✅ Yes' : '❌ Not Found'}\n`;
        if (doc.binaryPath) markdown += `- **Binary Path:** \`${doc.binaryPath}\`\n`;
        if (doc.version) markdown += `- **Version:** ${doc.version}\n`;
        markdown += `- **Rust/Cargo:** ${doc.rustInstalled ? `✅ ${doc.rustVersion}` : '❌ Not Found'}\n`;
        markdown += `- **Host Platform:** ${doc.platform} (${doc.arch})\n\n`;

        if (doc.recommendations.length > 0) {
          markdown += `#### Recommendations:\n`;
          for (const rec of doc.recommendations) {
            markdown += `- 💡 ${rec}\n`;
          }
        } else {
          markdown += `🎉 Everything is properly configured and ready for simulation!\n`;
        }

        return {
          content: [{ type: 'text', text: markdown }],
          isError: !doc.esp32simFound,
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error executing ${name}: ${err?.message || String(err)}` }],
        isError: true,
      };
    }
  });

  // 3. Resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'esp32sim://boards',
          name: 'Supported ESP32 Boards and Chips',
          mimeType: 'application/json',
          description: 'Full specifications of all hardware and peripherals modeled by esp32sim',
        },
        {
          uri: 'esp32sim://guide',
          name: 'Agent Guide for Simulated ESP32 Development',
          mimeType: 'text/markdown',
          description: 'Step-by-step TDD workflow for writing and testing firmware without hardware',
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === 'esp32sim://boards') {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(SUPPORTED_BOARDS, null, 2),
          },
        ],
      };
    }

    if (uri === 'esp32sim://guide') {
      const guideText = `# Simulated ESP32 Development Guide for Coding Agents

## The Golden Loop
1. **Write/Edit Firmware:** Modify C/C++ source code in your ESP-IDF project.
2. **Compile:** Run \`idf.py build\` to produce .bin and .elf files in \`build/\`.
3. **Simulate & Assert:** Call \`sim_expect\` with expected UART strings (e.g., "[APP] Startup..", "WiFi connected", "HTTP 200").
4. **Inspect Exceptions:** If it fails, examine the Guru Meditation backtrace or assert message returned in the tool response.
5. **Self-Correct:** Fix memory leaks, null pointers, or logic errors, recompile, and verify!
`;
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: guideText,
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  // 4. Prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'esp32-tdd-loop',
          description: 'Interactive TDD prompt for developing ESP32 firmware in simulation',
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name === 'esp32-tdd-loop') {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                'You are an expert embedded systems engineer using esp32sim-mcp. ' +
                'Follow test-driven development: first write expectations with `sim_expect`, ' +
                'run simulation, verify the UART log, and inspect any panic backtraces.',
            },
          },
        ],
      };
    }
    throw new Error(`Unknown prompt: ${request.params.name}`);
  });

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
