import { describe, it, expect } from 'vitest';
import { demuxConsoles } from '../src/core/console.js';

describe('console demux', () => {
  it('rebuilds lines split mid-way by the other console and keeps mirrored lines once', () => {
    // Captured from esp32sim --console both --console-prefix on the S3 hello_world
    const raw =
      '[uart0] I (33) main_task: Calling app_main()\r\n' +
      '[uart0] Hello w[usb]  Hello world!\r\n' +
      '[usb]  Restarting in 10 seconds...\r\n' +
      '[uart0] orld!\r\n' +
      '[uart0] Restarting in 10 seconds...\r\n';

    const { merged, bySource } = demuxConsoles(raw);

    expect(merged).toBe('I (33) main_task: Calling app_main()\nHello world!\nRestarting in 10 seconds...\n');
    expect(bySource.uart0).toContain('Hello world!\r\n');
    expect(bySource.usb).toBe('Hello world!\r\nRestarting in 10 seconds...\r\n');
  });

  it('keeps lines that only one console printed, and real repeats', () => {
    const raw =
      '[uart0] ESP-ROM:esp32s3\n' +
      '[usb]  ESP-ROM:esp32s3\n' +
      '[usb]  station: GOT_IP\n' +
      '[usb]  tick\n' +
      '[usb]  tick\n';

    expect(demuxConsoles(raw).merged).toBe('ESP-ROM:esp32s3\nstation: GOT_IP\ntick\ntick\n');
  });

  it('keeps leading spaces of the payload and an unterminated last line', () => {
    const raw = '[usb]    indented\n[uart0]   also\n[usb]  no newline';
    expect(demuxConsoles(raw).merged).toBe('  indented\n  also\nno newline\n');
  });
});
