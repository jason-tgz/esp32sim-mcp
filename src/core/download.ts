import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Downloads a .tar.gz, checks its SHA-256 and extracts it into a temporary directory,
 * which `use` receives and which is removed afterwards
 */
export async function withVerifiedTarball<T>(url: string, expectedSha256: string, use: (dir: string) => T): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url} (HTTP ${res.status})`);
  const tarball = Buffer.from(await res.arrayBuffer());
  if (sha256(tarball) !== expectedSha256) throw new Error(`${url}: SHA-256 mismatch`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'esp32sim-mcp-'));
  try {
    const archive = path.join(tmp, 'download.tar.gz');
    fs.writeFileSync(archive, tarball);
    execFileSync('tar', ['-xzf', archive, '-C', tmp]);
    return use(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function findFile(dir: string, name: string): string | undefined {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(p, name);
      if (found) return found;
    } else if (entry.name === name) {
      return p;
    }
  }
  return undefined;
}
