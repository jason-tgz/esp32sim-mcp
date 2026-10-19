# esp32sim-mcp

> **"Your agent writes ESP32 firmware, boots it and tests it. No board, no account."**

[![CI](https://github.com/stramanu/esp32sim-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/stramanu/esp32sim-mcp/actions)
[![npm version](https://img.shields.io/npm/v/esp32sim-mcp.svg)](https://www.npmjs.com/package/esp32sim-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**esp32sim-mcp** gives any AI coding agent (Claude Code, Cursor, Codex, Antigravity) the superpower to compile, boot, interact with, and test ESP32 firmware in a local instruction-level emulator.

No physical development board. No cloud tokens. Unmodified binaries.

---

## ⚡ 1-Minute Quickstart

### 1. Configure your Agent
Run the automatic setup wizard to detect installed agents (Claude Desktop, Cursor, Cline, Windsurf) and register the MCP server:

```bash
npx -y esp32sim-mcp init
```

Or add it manually to your `claude_desktop_config.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "esp32sim": {
      "command": "npx",
      "args": ["-y", "esp32sim-mcp", "serve"]
    }
  }
}
```

### 2. Verify Your Environment
```bash
npx esp32sim-mcp doctor
```

If you don't have the `esp32sim` emulator binary installed yet, compile it directly with Cargo:
```bash
cargo install --git https://github.com/mikroverk/esp32sim esp32sim
```

---

## 🛠️ MCP Tools for Agents

When connected, coding agents gain access to the following specialized tools:

| Tool | Input | Output | Description |
| --- | --- | --- | --- |
| `sim_run` | `projectDir`, `appBin`, `chip`, `board`, `maxSeconds` | UART console log, stop reason, exit code, panic details | Boots real mask ROM & bootloader, runs app, captures UART output and crash logs. |
| `sim_script` | `events` (array of `press`, `knob`, `serial`, `stop`) | Timed UART logs | Injects hardware events (button presses, rotary encoder, UART RX data) at emulated timestamps. |
| `sim_expect` | `patterns` (strings or regexes), `ordered` | Pass/Fail status, matched lines, diff of missing line | Asserts expected UART output for autonomous Red-Green-Refactor testing loops. |
| `sim_screenshot` | `board` (e.g. `atech14`), `timeSeconds` | PNG image & base64 data | Captures virtual ST7789/ST7701S LCD/TFT display buffer at specific emulated moment. |
| `sim_list_boards` | `chip` (optional: `s3`, `c3`, `c6`, `esp32`) | Board specs & peripherals | Catalogs supported chips, CPU cores, displays, and peripheral buttons. |
| `sim_doctor` | none | Environment health report | Checks `esp32sim` binary, Rust toolchain, and host architecture. |

---

## 💻 CLI Commands (Local & CI)

The same tools are available via CLI with stable exit codes (0 = pass, 1 = fail), making them drop-in ready for GitHub Actions CI:

```bash
# Run simulation for 5 emulated seconds
esp32sim-mcp run --chip s3 --max-seconds 5

# Automated test asserting UART output
esp32sim-mcp expect --pattern "Loading app..." "WiFi connected" "HTTP Server listening"

# Run with interactive button press script
esp32sim-mcp run --script ./test-script.txt

# Inspect supported chips and boards
esp32sim-mcp list

# Check environment health
esp32sim-mcp doctor
```

---

## 🔄 The Autonomous Agent Loop

`esp32sim-mcp` ships with a standardized **Agent Skill** (`skills/esp32sim/SKILL.md`) that guides agents through embedded Test-Driven Development:

```
┌───────────────────────────────────────────┐
│ 1. Agent writes ESP-IDF C/C++ firmware    │
└─────────────────────┬─────────────────────┘
                      ▼
┌───────────────────────────────────────────┐
│ 2. Compile: `idf.py build`                │
└─────────────────────┬─────────────────────┘
                      ▼
┌───────────────────────────────────────────┐
│ 3. Agent calls `sim_expect` with patterns │
└─────────────────────┬─────────────────────┘
                      ▼
┌───────────────────────────────────────────┐
│ 4. Simulator returns UART logs / Panic    │
│    (Guru Meditation, Stack Overflow, etc.)│
└─────────────────────┬─────────────────────┘
                      ▼
┌───────────────────────────────────────────┐
│ 5. Agent inspects trace, fixes bug, reruns│
└───────────────────────────────────────────┘
```

### Auto-Discovery of Firmware
`esp32sim-mcp` automatically detects ESP-IDF build artifacts:
- Parses `build/flasher_args.json` to extract precise bootloader, partition table, and application binaries without manual path configuration.
- Supports both multi-binary ROM boot (`--boot rom`) and single application ELF/binary boot (`--boot app`).

---

## 🎯 Supported Chips & Boards

Powered by [esp32sim](https://github.com/mikroverk/esp32sim) by mikroverk:

- **ESP32-S3 (Dual Xtensa LX7 @ 240MHz):** Mature. Emulates JIT execution (~30x faster than real-time), ST7701S RGB display (480x480), audio SID player, camera sensor, buttons, rotary encoder, and Wi-Fi.
- **ESP32-C3 (RISC-V RV32IMC @ 160MHz):** Mature console & Wi-Fi emulation.
- **ESP32-C6 (RISC-V RV32IMAC @ 160MHz):** Draft. Waveshare 1.47" LCD with 802.15.4 Zigbee/Thread radio model.
- **Classic ESP32 (Dual Xtensa LX6 @ 240MHz):** Early. LilyGO TTGO T-Display model.

---

## 📊 Landscape & Comparison

| Solution | Emulates without physical board | Requires account or token | Supported in Coding Agents (MCP) |
| --- | :---: | :---: | :---: |
| **esp32sim-mcp** | ✅ Yes (Local) | ❌ **No (100% Free & Open Source)** | ✅ **Yes (stdio MCP + Agent Skill)** |
| **Wokwi CLI MCP** | ✅ Yes (Cloud/Local) | ⚠️ Yes (`WOKWI_CLI_TOKEN`) | ⚠️ Experimental |
| **esparagus (Espressif)** | ❌ No (Needs hardware) | ❌ No | ✅ Yes (Hardware flasher) |
| **esp32sim (Upstream)** | ✅ Yes | ❌ No | ❌ No MCP / No Skill |

---

## 🙏 Acknowledgments & Credits

- [mikroverk/esp32sim](https://github.com/mikroverk/esp32sim): The blazing-fast, instruction-level ESP32 emulator in Rust that powers the local execution engine.
- [Espressif Systems](https://github.com/espressif): For ESP-IDF and official mask ROMs.
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/): The open standard for connecting AI models to tools and development environments.

---

## 📄 License

MIT © [Emanuele Strazzullo](https://github.com/stramanu)
