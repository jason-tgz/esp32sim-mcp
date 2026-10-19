import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export type AgentId = 'claude-code' | 'codex' | 'cursor' | 'claude-desktop';

export const ALL_AGENTS: AgentId[] = ['claude-code', 'codex', 'cursor', 'claude-desktop'];

export const SERVER_NAME = 'esp32sim';
export const SERVER_ENTRY = { command: 'npx', args: ['-y', 'esp32sim-mcp', 'serve'] };

// Ships next to dist/ and src/ in the package: <pkg>/skills/esp32sim
export const SKILL_SOURCE_DIR = fileURLToPath(new URL('../../skills/esp32sim', import.meta.url));

export interface InitOptions {
  cwd: string;
  home: string;
  platform: NodeJS.Platform;
  /** Write user-level config instead of project files */
  global?: boolean;
  /** Agents to configure; detected when omitted */
  agents?: AgentId[];
  /** Install the agent skill alongside the MCP server (default true) */
  skill?: boolean;
  dryRun?: boolean;
  /** Overridable for tests: whether a command is on PATH */
  hasCommand?: (cmd: string) => boolean;
  /** Overridable for tests: runs `claude mcp add` */
  runClaudeMcpAdd?: (args: string[]) => { ok: boolean; output: string };
  appData?: string;
}

export interface InitAction {
  agent: AgentId;
  kind: 'mcp' | 'skill';
  target: string;
  status: 'written' | 'unchanged' | 'would-write' | 'skipped' | 'error';
  detail?: string;
}

export function commandExists(cmd: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
}

function claudeMcpAdd(args: string[]): { ok: boolean; output: string } {
  try {
    const output = execFileSync('claude', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output };
  } catch (err: any) {
    return { ok: false, output: `${err?.stdout ?? ''}${err?.stderr ?? ''}` || String(err) };
  }
}

function claudeDesktopConfig(opts: InitOptions): string {
  if (opts.platform === 'darwin') {
    return path.join(opts.home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (opts.platform === 'win32') {
    return path.join(opts.appData ?? path.join(opts.home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  return path.join(opts.home, '.config', 'Claude', 'claude_desktop_config.json');
}

/**
 * Agents that look installed on this machine (or in this project)
 */
export function detectAgents(opts: InitOptions): AgentId[] {
  const has = opts.hasCommand ?? commandExists;
  const exists = (p: string) => fs.existsSync(p);
  const found: AgentId[] = [];

  if (has('claude') || exists(path.join(opts.home, '.claude'))) found.push('claude-code');
  if (has('codex') || exists(path.join(opts.home, '.codex'))) found.push('codex');
  if (has('cursor') || exists(path.join(opts.home, '.cursor')) || exists(path.join(opts.cwd, '.cursor'))) {
    found.push('cursor');
  }
  // Desktop has no project config, so it is only touched for --global
  if (opts.global && exists(path.dirname(claudeDesktopConfig(opts)))) found.push('claude-desktop');

  return found;
}

/**
 * Adds the server to an `mcpServers` JSON file without touching other entries.
 * A file that does not parse is left alone rather than replaced.
 */
export function upsertJsonMcpServer(file: string, dryRun: boolean): InitAction['status'] | { error: string } {
  let json: any = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf-8');
    if (raw.trim()) {
      try {
        json = JSON.parse(raw);
      } catch (err: any) {
        return { error: `not valid JSON, left untouched (${err?.message})` };
      }
    }
  }
  json.mcpServers ??= {};
  if (JSON.stringify(json.mcpServers[SERVER_NAME]) === JSON.stringify(SERVER_ENTRY)) return 'unchanged';
  if (dryRun) return 'would-write';

  json.mcpServers[SERVER_NAME] = SERVER_ENTRY;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf-8');
  return 'written';
}

/**
 * Adds or replaces the `[mcp_servers.esp32sim]` table in a Codex config.toml
 */
export function upsertCodexToml(file: string, dryRun: boolean): InitAction['status'] {
  const header = `[mcp_servers.${SERVER_NAME}]`;
  const block =
    `${header}\n` +
    `command = ${JSON.stringify(SERVER_ENTRY.command)}\n` +
    `args = [${SERVER_ENTRY.args.map((a) => JSON.stringify(a)).join(', ')}]\n`;

  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  const lines = current.split('\n');
  const start = lines.findIndex((l) => l.trim() === header);

  let next: string;
  if (start === -1) {
    next = current + (current && !current.endsWith('\n') ? '\n' : '') + (current ? '\n' : '') + block;
  } else {
    // The table runs until the next table header
    let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
    if (end === -1) end = lines.length;
    const existing = lines.slice(start, end).join('\n').trim() + '\n';
    if (existing === block) return 'unchanged';
    const tail = lines.slice(end).join('\n');
    next = [...lines.slice(0, start), block.trimEnd(), ...(tail ? ['', tail] : [''])].join('\n');
  }

  if (dryRun) return 'would-write';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next, 'utf-8');
  return 'written';
}

function sameTree(a: string, b: string): boolean {
  if (!fs.existsSync(b)) return false;
  for (const entry of fs.readdirSync(a, { withFileTypes: true })) {
    const pa = path.join(a, entry.name);
    const pb = path.join(b, entry.name);
    if (entry.isDirectory()) {
      if (!sameTree(pa, pb)) return false;
    } else if (!fs.existsSync(pb) || !fs.readFileSync(pa).equals(fs.readFileSync(pb))) {
      return false;
    }
  }
  return true;
}

export function installSkill(skillsDir: string, dryRun: boolean): InitAction['status'] {
  const target = path.join(skillsDir, SERVER_NAME);
  if (sameTree(SKILL_SOURCE_DIR, target)) return 'unchanged';
  if (dryRun) return 'would-write';
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.cpSync(SKILL_SOURCE_DIR, target, { recursive: true });
  return 'written';
}

/**
 * Writes MCP config (and the skill) for each requested or detected agent
 */
export function runInit(opts: InitOptions): InitAction[] {
  const dryRun = opts.dryRun ?? false;
  const withSkill = opts.skill !== false;
  const agents = opts.agents ?? detectAgents(opts);
  const actions: InitAction[] = [];
  const base = opts.global ? opts.home : opts.cwd;

  const jsonMcp = (agent: AgentId, file: string) => {
    const res = upsertJsonMcpServer(file, dryRun);
    actions.push(
      typeof res === 'string'
        ? { agent, kind: 'mcp', target: file, status: res }
        : { agent, kind: 'mcp', target: file, status: 'error', detail: res.error }
    );
  };
  const skill = (agent: AgentId, skillsDir: string) => {
    if (!withSkill) return;
    actions.push({ agent, kind: 'skill', target: path.join(skillsDir, SERVER_NAME), status: installSkill(skillsDir, dryRun) });
  };

  for (const agent of agents) {
    switch (agent) {
      case 'claude-code': {
        if (opts.global) {
          // User-scope servers live in ~/.claude.json, which only the claude CLI should edit
          const args = ['mcp', 'add', '--scope', 'user', SERVER_NAME, '--', SERVER_ENTRY.command, ...SERVER_ENTRY.args];
          const has = opts.hasCommand ?? commandExists;
          if (!has('claude')) {
            actions.push({
              agent, kind: 'mcp', target: '~/.claude.json', status: 'skipped',
              detail: `claude CLI not on PATH; run: claude ${args.join(' ')}`,
            });
          } else if (dryRun) {
            actions.push({ agent, kind: 'mcp', target: '~/.claude.json', status: 'would-write', detail: `claude ${args.join(' ')}` });
          } else {
            const res = (opts.runClaudeMcpAdd ?? claudeMcpAdd)(args);
            const already = /already exists/i.test(res.output);
            actions.push({
              agent, kind: 'mcp', target: '~/.claude.json',
              status: res.ok ? 'written' : already ? 'unchanged' : 'error',
              detail: res.ok || already ? undefined : res.output.trim(),
            });
          }
        } else {
          jsonMcp(agent, path.join(opts.cwd, '.mcp.json'));
        }
        skill(agent, path.join(base, '.claude', 'skills'));
        break;
      }
      case 'codex': {
        // Codex reads MCP servers from the user config only
        const file = path.join(opts.home, '.codex', 'config.toml');
        actions.push({ agent, kind: 'mcp', target: file, status: upsertCodexToml(file, dryRun) });
        skill(agent, opts.global ? path.join(opts.home, '.codex', 'skills') : path.join(opts.cwd, '.agents', 'skills'));
        break;
      }
      case 'cursor': {
        jsonMcp(agent, path.join(base, '.cursor', 'mcp.json'));
        skill(agent, path.join(base, '.cursor', 'skills'));
        break;
      }
      case 'claude-desktop': {
        jsonMcp(agent, claudeDesktopConfig(opts));
        break;
      }
    }
  }

  return actions;
}
