# Security

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/stramanu/esp32sim-mcp/security/advisories/new) rather than public issues.

Note on scope: the MCP server runs the `esp32sim` emulator on firmware paths the agent provides, and the emulator's virtual network forwards guest TCP/UDP to the host network by default (`--net nat`). Treat firmware you simulate like code you run.
