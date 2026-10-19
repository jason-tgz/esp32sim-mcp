/**
 * With several consoles selected (`--console both|all`), esp32sim writes each console's bytes as
 * they arrive, so two consoles interleave mid-line. With `--console-prefix` every piece it writes
 * starts with a fixed tag (esp-soc machine.rs), which lets us split the stream back per console.
 */
const TAG_PATTERN = /\[usb\] {2}|\[uart0\] |\[uart1\] |\[uart2\] /g;

export type ConsoleSource = 'usb' | 'uart0' | 'uart1' | 'uart2' | 'untagged';

export interface DemuxedConsoles {
  /** Lines in completion order, with lines mirrored on two consoles kept once */
  merged: string;
  /** Full text per console */
  bySource: Partial<Record<ConsoleSource, string>>;
}

// How far back a mirrored line may be matched on the other console
const MIRROR_WINDOW = 256;

function sourceOfTag(tag: string): ConsoleSource {
  return tag.slice(1, tag.indexOf(']')) as ConsoleSource;
}

export function demuxConsoles(raw: string): DemuxedConsoles {
  const segments: { source: ConsoleSource; text: string }[] = [];
  let cursor = 0;
  let source: ConsoleSource = 'untagged';
  for (const match of raw.matchAll(TAG_PATTERN)) {
    if (match.index! > cursor) segments.push({ source, text: raw.slice(cursor, match.index) });
    source = sourceOfTag(match[0]);
    cursor = match.index! + match[0].length;
  }
  if (cursor < raw.length) segments.push({ source, text: raw.slice(cursor) });

  const bySource: Partial<Record<ConsoleSource, string>> = {};
  const partial: Partial<Record<ConsoleSource, string>> = {};
  const completed: { source: ConsoleSource; line: string }[] = [];

  for (const { source: src, text } of segments) {
    bySource[src] = (bySource[src] ?? '') + text;
    const pieces = ((partial[src] ?? '') + text).split('\n');
    partial[src] = pieces.pop()!;
    for (const line of pieces) completed.push({ source: src, line: line.replace(/\r$/, '') });
  }
  for (const [src, rest] of Object.entries(partial)) {
    if (rest) completed.push({ source: src as ConsoleSource, line: rest.replace(/\r$/, '') });
  }

  // A line already printed by another console, not yet matched, is the same output mirrored
  const unmatched = new Map<ConsoleSource, string[]>();
  const merged: string[] = [];
  for (const { source: src, line } of completed) {
    let mirrored = false;
    for (const [other, queue] of unmatched) {
      if (other === src) continue;
      const idx = queue.indexOf(line);
      if (idx !== -1) {
        queue.splice(idx, 1);
        mirrored = true;
        break;
      }
    }
    if (mirrored) continue;

    merged.push(line);
    const own = unmatched.get(src) ?? [];
    own.push(line);
    if (own.length > MIRROR_WINDOW) own.shift();
    unmatched.set(src, own);
  }

  return { merged: merged.join('\n') + (merged.length ? '\n' : ''), bySource };
}
