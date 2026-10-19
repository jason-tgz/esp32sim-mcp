# esp32sim-mcp

> **"Your agent writes ESP32 firmware, boots it and tests it. No board, no account."**

[![CI](https://github.com/stramanu/esp32sim-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/stramanu/esp32sim-mcp/actions)
[![npm version](https://img.shields.io/npm/v/esp32sim-mcp.svg)](https://www.npmjs.com/package/esp32sim-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**esp32sim-mcp** lets an AI coding agent (Claude Code, Codex, Cursor, or any MCP client) boot, drive and test the ESP32 firmware it builds with ESP-IDF, inside the local [esp32sim](https://github.com/mikroverk/esp32sim) emulator: real mask ROM, real bootloader, unmodified binaries.

No physical development board. No cloud account or token.

**Requirements:** Node.js 22+ and ESP-IDF to build firmware. `npx esp32sim-mcp setup` installs the emulator (prebuilt for macOS arm64, Linux x64 and Linux arm64) and the mask ROMs. Tested on macOS and Linux.

---

## ⚡ 1-Minute Quickstart

### 1. Install the emulator

```bash
npx -y esp32sim-mcp setup
```

This downloads a prebuilt [esp32sim](https://github.com/mikroverk/esp32sim) into `~/.esp32sim/bin` and Espressif's mask ROM ELFs into `~/.esp32sim/roms`, both pinned and SHA-256 verified. The binaries are built from source by this repo's [emulator workflow](.github/workflows/emulator.yml) with signed build provenance (`gh attestation verify <archive> -R stramanu/esp32sim-mcp`).

### 2. Configure your Agent
From your firmware project, detect installed agents (Claude Code, Codex, Cursor) and register the MCP server plus the `esp32sim` skill that teaches the write → build → simulate → verify loop:

```bash
npx -y esp32sim-mcp init              # this project: .mcp.json, .cursor/, .claude/skills, .agents/skills
npx -y esp32sim-mcp init --global     # user level, also Claude Desktop
npx -y esp32sim-mcp init --agent codex --dry-run
```

| Agent | MCP server (project / `--global`) | Skill (project / `--global`) |
| --- | --- | --- |
| Claude Code | `.mcp.json` / `claude mcp add --scope user` | `.claude/skills/` / `~/.claude/skills/` |
| Codex | `~/.codex/config.toml` (user only) | `.agents/skills/` / `~/.codex/skills/` |
| Cursor | `.cursor/mcp.json` / `~/.cursor/mcp.json` | `.cursor/skills/` / `~/.cursor/skills/` |
| Claude Desktop | `--global` only | — |

Existing entries are kept, reruns are no-ops, and a config file that does not parse is left untouched. `--no-skill` skips the skill.

Or add it manually to any `mcpServers` config:

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

### 3. Verify Your Environment
```bash
npx esp32sim-mcp doctor
```

#### Platforms without a prebuilt emulator

Build esp32sim with Cargo ([rustup](https://rustup.rs) installs Rust). It is not on crates.io, so it comes from git, pinned to the commit this release is tested against:
```bash
cargo install --locked --git https://github.com/mikroverk/esp32sim --rev f535f3b42293a76ab64c231a0425f35857ab6cf1 esp32sim
npx esp32sim-mcp fetch-roms
```
The binary lands in `~/.cargo/bin`, where it is found automatically. `ESP32SIM_PATH` points at a binary elsewhere and `ESP32SIM_ROM_DIR` at another ROM directory; ROMs in an ESP-IDF install are found automatically.

---

## 🛠️ MCP Tools for Agents

When connected, coding agents gain access to the following specialized tools:

| Tool | Input | Output | Description |
| --- | --- | --- | --- |
| `sim_run` | `projectDir`, `appBin`, `chip`, `board`, `maxSeconds` | UART console log, stop reason, exit code, panic details | Boots real mask ROM & bootloader, runs app, captures UART output and crash logs. |
| `sim_script` | `events` (array of `press`, `release`, `gpio`, `knob`, `uart`, `serial`, `touch`, `stop`) | Timed UART logs | Injects hardware events (button presses, rotary encoder, UART RX data) at emulated timestamps. |
| `sim_expect` | `patterns` (strings or regexes), `ordered` | Pass/Fail status, matched lines, diff of missing line | Asserts expected UART output for autonomous Red-Green-Refactor testing loops. |
| `sim_screenshot` | `board` (e.g. `atech14`), `timeSeconds` | PNG image & base64 data | Captures the virtual ST7735/ST7789/ST7701S/CO5300 display buffer at specific emulated moment. |
| `sim_list_boards` | `chip` (optional: `s3`, `c3`, `c6`, `esp32`) | Board specs & peripherals | Catalogs supported chips, CPU cores, displays, and peripheral buttons. |
| `sim_doctor` | none | Environment health report | Checks the `esp32sim` binary and mask ROMs, and says how to install what is missing. |

By default both UART0 and the USB-Serial/JTAG console are captured, so output shows up whichever console the project logs to; lines ESP-IDF mirrors on both are shown once. `wifi` (e.g. `ssid=demo,psk=secret`) attaches a virtual access point with DHCP, DNS and NAT.

---

## 💻 CLI Commands (Local & CI)

The same tools are available via CLI with stable exit codes (0 = pass, 1 = fail), making them drop-in ready for GitHub Actions CI:

```bash
# Run the ESP-IDF build in the current project for 5 emulated seconds
esp32sim-mcp run --max-seconds 5

# Assert UART output (patterns in order), on a virtual WiFi network
esp32sim-mcp expect --wifi "ssid=demo,psk=demo-pass" --pattern "app_main" "GOT_IP"

# Drive buttons from a timed action script
esp32sim-mcp expect --script ./test-button-script.txt --pattern "Button pressed"

# Supported boards, environment check, mask ROM download
esp32sim-mcp list
esp32sim-mcp doctor
esp32sim-mcp setup          # or install-emulator / fetch-roms separately
```

`examples/hello-esp32` is a small ESP-IDF project with a button script; CI builds it and runs it this way.

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
- With bootloader, partition table and app it boots through the real mask ROM (`--boot rom`); an app image alone is loaded directly (`--boot app`).

---

## 🎯 Supported Chips & Boards

Powered by [esp32sim](https://github.com/mikroverk/esp32sim). `sim_list_boards` / `esp32sim-mcp list` show the details.

| Chip | Boards (`board`) |
| --- | --- |
| ESP32-S3 | `atech14` (default: ST7735 TFT, buttons, rotary encoder, LED ring, audio), `waveshare-lcd4b` (480x480 touch), `waveshare-amoled18-v2` (368x448 AMOLED touch), `waveshare-cam` (OV5640 camera), `none` |
| ESP32-C3 | console only (no board models) |
| ESP32-C6 | `waveshare-c6-lcd147` (172x320 LCD), `none` |
| ESP32 (classic) | `ttgo-tdisplay` (135x240 TFT), `esp32dev-loopback`, `none` |

WiFi (virtual access point) works on all four chips. BLE is not exposed by this wrapper.

---

## 📊 Landscape & Comparison

| Solution | Emulates without physical board | Requires account or token | Supported in Coding Agents (MCP) |
| --- | :---: | :---: | :---: |
| **esp32sim-mcp** | ✅ Yes (Local) | ❌ **No (100% Free & Open Source)** | ✅ **Yes (stdio MCP + Agent Skill)** |
| **Wokwi CLI MCP** | ✅ Yes (Cloud/Local) | ⚠️ Yes (`WOKWI_CLI_TOKEN`) | ⚠️ Experimental |
| **esparagus (Espressif)** | ❌ No (Needs hardware) | ❌ No | ✅ Yes (Hardware flasher) |
| **esp32sim (Upstream)** | ✅ Yes | ❌ No | ❌ No MCP / No Skill |

---

## ⚠️ Limitations

- Prebuilt emulator binaries cover macOS arm64 and Linux x64/arm64; elsewhere build `esp32sim` with Cargo. `doctor` tells you what is missing.
- The agent builds firmware itself with ESP-IDF (`idf.py build`); there is no build tool in the MCP server.
- Windows is untested.
- An emulator is not silicon: peripherals esp32sim does not model, RF timing and BLE are out of reach. Confirm on hardware before you ship.

## 🤝 Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).

---

## 🙏 Acknowledgments & Credits

- [mikroverk/esp32sim](https://github.com/mikroverk/esp32sim): The blazing-fast, instruction-level ESP32 emulator in Rust that powers the local execution engine.
- [Espressif Systems](https://github.com/espressif): For ESP-IDF and official mask ROMs.
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/): The open standard for connecting AI models to tools and development environments.

---

## 📄 License

MIT © [Emanuele Strazzullo](https://github.com/stramanu)
