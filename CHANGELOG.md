# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-19

### Added
- `setup` installs everything simulation needs in one command: a prebuilt esp32sim and the mask ROMs. `install-emulator` does the emulator alone.
- Prebuilt esp32sim binaries for macOS arm64, Linux x64 and Linux arm64 (static), built from the pinned esp32sim commit by this repo's emulator workflow, with signed build provenance, SHA-256 verified on install. A manually built esp32sim in `~/.esp32sim/bin` is kept unless `--force`.

### Changed
- `doctor` points to `setup`; Cargo is only needed on platforms without a prebuilt binary.
- CI's end-to-end job uses the prebuilt emulator, the same path users take, and a `release:` commit is no longer tested twice.

## [0.1.1] - 2026-10-19

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
