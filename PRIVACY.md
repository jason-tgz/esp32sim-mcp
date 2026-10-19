# Privacy

esp32sim-mcp runs entirely on your machine and collects no data.

- The MCP server and CLI send nothing to the author or any third party: no telemetry, analytics or accounts.
- Firmware, build output and simulation logs stay on your machine. Tool results go only to the agent that called the tool.
- Network access happens only when you ask for it:
  - `setup`, `install-emulator` and `fetch-roms` download the emulator from this repository's GitHub releases and Espressif's mask ROMs from GitHub, and verify their SHA-256.
  - `npx` downloads the package from the npm registry.
  - A simulation run with `wifi` gives the emulated firmware a virtual network that, by default, forwards its TCP/UDP traffic to your host's network, like a device on your LAN would. Where it connects is up to the firmware you run.
- `init` writes agent configuration files on your machine only.

Questions: [open an issue](https://github.com/stramanu/esp32sim-mcp/issues).
