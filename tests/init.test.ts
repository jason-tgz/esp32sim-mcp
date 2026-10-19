import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectAgents, InitOptions, runInit, SERVER_ENTRY } from '../src/core/init.js';

let root: string;
let cwd: string;
let home: string;

function opts(extra: Partial<InitOptions> = {}): InitOptions {
  return { cwd, home, platform: 'darwin', hasCommand: () => false, ...extra };
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'esp32sim-init-'));
  cwd = path.join(root, 'project');
  home = path.join(root, 'home');
  fs.mkdirSync(cwd);
  fs.mkdirSync(home);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('agent detection', () => {
  it('finds agents from their home directories or commands', () => {
    fs.mkdirSync(path.join(home, '.codex'));
    expect(detectAgents(opts())).toEqual(['codex']);
    expect(detectAgents(opts({ hasCommand: (c) => c === 'claude' }))).toEqual(['claude-code', 'codex']);
  });

  it('only considers Claude Desktop for a global install', () => {
    fs.mkdirSync(path.join(home, 'Library', 'Application Support', 'Claude'), { recursive: true });
    expect(detectAgents(opts())).toEqual([]);
    expect(detectAgents(opts({ global: true }))).toEqual(['claude-desktop']);
  });
});

describe('project init', () => {
  it('writes .mcp.json and the skill for Claude Code', () => {
    const actions = runInit(opts({ agents: ['claude-code'] }));

    expect(actions.map((a) => a.status)).toEqual(['written', 'written']);
    expect(readJson(path.join(cwd, '.mcp.json')).mcpServers.esp32sim).toEqual(SERVER_ENTRY);
    expect(fs.existsSync(path.join(cwd, '.claude', 'skills', 'esp32sim', 'SKILL.md'))).toBe(true);
  });

  it('is idempotent and keeps other servers', () => {
    fs.writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
    runInit(opts({ agents: ['claude-code', 'cursor'] }));
    const second = runInit(opts({ agents: ['claude-code', 'cursor'] }));

    expect(second.every((a) => a.status === 'unchanged')).toBe(true);
    expect(Object.keys(readJson(path.join(cwd, '.mcp.json')).mcpServers)).toEqual(['other', 'esp32sim']);
    expect(readJson(path.join(cwd, '.cursor', 'mcp.json')).mcpServers.esp32sim).toEqual(SERVER_ENTRY);
    expect(fs.existsSync(path.join(cwd, '.cursor', 'skills', 'esp32sim', 'SKILL.md'))).toBe(true);
  });

  it('leaves an unparsable config untouched and reports it', () => {
    const file = path.join(cwd, '.mcp.json');
    fs.writeFileSync(file, '{ broken');
    const [mcp] = runInit(opts({ agents: ['claude-code'] }));

    expect(mcp.status).toBe('error');
    expect(fs.readFileSync(file, 'utf-8')).toBe('{ broken');
  });

  it('writes nothing on a dry run', () => {
    const actions = runInit(opts({ agents: ['claude-code', 'codex', 'cursor'], dryRun: true }));

    expect(actions.every((a) => a.status === 'would-write')).toBe(true);
    expect(fs.readdirSync(cwd)).toEqual([]);
    expect(fs.readdirSync(home)).toEqual([]);
  });

  it('skips the skill with skill: false', () => {
    const actions = runInit(opts({ agents: ['cursor'], skill: false }));
    expect(actions.map((a) => a.kind)).toEqual(['mcp']);
  });
});

describe('Codex', () => {
  const tomlFile = () => path.join(home, '.codex', 'config.toml');

  it('adds the server table to config.toml and the skill to .agents/skills', () => {
    fs.mkdirSync(path.join(home, '.codex'));
    fs.writeFileSync(tomlFile(), 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "x"\n');
    runInit(opts({ agents: ['codex'] }));

    const toml = fs.readFileSync(tomlFile(), 'utf-8');
    expect(toml).toContain('model = "gpt-5"');
    expect(toml).toContain('[mcp_servers.other]\ncommand = "x"');
    expect(toml).toContain('[mcp_servers.esp32sim]\ncommand = "npx"\nargs = ["-y", "esp32sim-mcp", "serve"]\n');
    expect(fs.existsSync(path.join(cwd, '.agents', 'skills', 'esp32sim', 'SKILL.md'))).toBe(true);
  });

  it('replaces a stale table in place without duplicating it', () => {
    fs.mkdirSync(path.join(home, '.codex'));
    fs.writeFileSync(tomlFile(), '[mcp_servers.esp32sim]\ncommand = "old"\n\n[profiles.x]\nmodel = "y"\n');
    runInit(opts({ agents: ['codex'], skill: false }));
    const again = runInit(opts({ agents: ['codex'], skill: false }));

    const toml = fs.readFileSync(tomlFile(), 'utf-8');
    expect(toml.match(/\[mcp_servers\.esp32sim\]/g)).toHaveLength(1);
    expect(toml).not.toContain('"old"');
    expect(toml).toContain('[profiles.x]\nmodel = "y"');
    expect(again[0].status).toBe('unchanged');
  });
});

describe('global init', () => {
  it('uses the claude CLI for user scope and installs skills under home', () => {
    let calledWith: string[] = [];
    const actions = runInit(
      opts({
        global: true,
        agents: ['claude-code', 'cursor'],
        hasCommand: (c) => c === 'claude',
        runClaudeMcpAdd: (args) => {
          calledWith = args;
          return { ok: true, output: '' };
        },
      })
    );

    expect(calledWith).toEqual(['mcp', 'add', '--scope', 'user', 'esp32sim', '--', 'npx', '-y', 'esp32sim-mcp', 'serve']);
    expect(actions.every((a) => a.status === 'written')).toBe(true);
    expect(fs.existsSync(path.join(home, '.claude', 'skills', 'esp32sim', 'SKILL.md'))).toBe(true);
    expect(readJson(path.join(home, '.cursor', 'mcp.json')).mcpServers.esp32sim).toEqual(SERVER_ENTRY);
  });

  it('treats an existing Claude Code server as unchanged', () => {
    const [mcp] = runInit(
      opts({
        global: true,
        agents: ['claude-code'],
        skill: false,
        hasCommand: () => true,
        runClaudeMcpAdd: () => ({ ok: false, output: 'MCP server esp32sim already exists in user config' }),
      })
    );
    expect(mcp.status).toBe('unchanged');
  });

  it('prints the command when the claude CLI is missing', () => {
    const [mcp] = runInit(opts({ global: true, agents: ['claude-code'], skill: false }));
    expect(mcp.status).toBe('skipped');
    expect(mcp.detail).toContain('claude mcp add --scope user esp32sim');
  });
});
