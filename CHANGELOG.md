# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.4] - 2026-10-19

### Fixed
- Regex patterns now work for agents and the CLI: write them as `/body/flags`. Before, every string was matched literally, so a pattern like `Counter: 1\b` could never match although the tool advertised regex support. Plain text still matches as a substring.

## [0.2.3] - 2026-10-19

### Fixed
- `sim_expect` called without patterns (or with an empty list) passed without checking anything; it is now an error that says what is missing. Found while recording the demo: the agent's first call had no arguments.

## [0.2.2] - 2026-10-19

### Changed
- README rewritten around a real demo session, with a CI recipe and an architecture diagram.
- `init` shows paths under your home directory as `~/...`.

## [0.2.1] - 2026-10-19

### Changed
- The agent skill now says how to build: local ESP-IDF if present, otherwise Espressif's `espressif/idf` Docker image (with the Linux user mapping and version matching), and not to start a multi-GB ESP-IDF install unasked. Rerun `npx esp32sim-mcp init` to update an installed skill.

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
