import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SimEvent } from './types.js';

/**
 * Serializes structured simulation events into esp32sim script format
 */
export function serializeScriptEvents(events: SimEvent[]): string {
  // Sort events chronologically
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const lines: string[] = [];

  for (const ev of sorted) {
    const t = ev.time.toFixed(3).replace(/\.?0+$/, ''); // clean seconds representation
    switch (ev.action) {
      case 'press': {
        const duration = ev.durationMs ? ` ${ev.durationMs}` : '';
        lines.push(`${t} press ${ev.target}${duration}`);
        break;
      }
      case 'release': {
        lines.push(`${t} release ${ev.target}`);
        break;
      }
      case 'gpio': {
        lines.push(`${t} gpio ${ev.pin} ${ev.level}`);
        break;
      }
      case 'knob': {
        const dir = ev.direction || 'cw';
        const steps = ev.steps || 1;
        lines.push(`${t} knob ${dir} ${steps}`);
        break;
      }
      case 'serial': {
        lines.push(`${t} serial ${ev.data}`);
        break;
      }
      case 'uart': {
        lines.push(`${t} uart${ev.port ?? 0} ${ev.data}`);
        break;
      }
      case 'touch': {
        lines.push(`${t} touch ${ev.x} ${ev.y} ${ev.down === false ? 0 : 1}`);
        break;
      }
      case 'stop': {
        lines.push(`${t} stop`);
        break;
      }
      default:
        break;
    }
  }

  return lines.join('\n');
}

/**
 * Creates a temporary script file on disk for esp32sim execution
 */
export function writeTempScript(eventsOrText: SimEvent[] | string): { filePath: string; cleanup: () => void } {
  const content = typeof eventsOrText === 'string'
    ? eventsOrText
    : serializeScriptEvents(eventsOrText);

  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `esp32sim_script_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.txt`);
  fs.writeFileSync(filePath, content, 'utf-8');

  return {
    filePath,
    cleanup: () => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // Ignore temporary cleanup errors
      }
    },
  };
}
