# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- Install instructions: esp32sim is not on crates.io; `doctor` and the docs now give a `cargo install --git` command pinned to the tested esp32sim commit.

### Changed
- Dropped unused dependencies; the version reported by the CLI and MCP server comes from `package.json`.

## [0.1.0] - 2026-10-19

First release.

- MCP server (stdio) with `sim_run`, `sim_expect`, `sim_script`, `sim_screenshot`, `sim_list_boards`, `sim_doctor`.
- CLI with the same commands (`run`, `expect`, `list`, `doctor`) and stable exit codes for CI.
- `init` registers the server and installs the agent skill for Claude Code, Codex, Cursor and Claude Desktop.
- `fetch-roms` downloads Espressif's mask ROM ELFs, pinned and SHA-256 verified.
- UART0 and USB-Serial/JTAG consoles captured by default, demultiplexed, mirrored lines shown once.
- Virtual WiFi access point, scripted buttons/encoder/GPIO/UART/touch, display screenshots.
