import { BoardSpec, EspChip, normalizeChip } from './types.js';

// Mirrors the boards esp32sim's `--board` flag accepts (docs/boards.md upstream).
// The C3 has no board models: it refuses `--board`, so its runs omit the flag.
export const SUPPORTED_BOARDS: BoardSpec[] = [
  {
    id: 'atech14',
    name: 'Atech 14-port board / Pocket Synth (ESP32-S3)',
    chip: 's3',
    status: 'mature',
    cpu: '2x Xtensa LX7 @ 240MHz',
    hasDisplay: true,
    displayResolution: '160x80 ST7735 TFT',
    hasWifi: true,
    hasBle: false,
    hasAudio: true,
    hasCamera: false,
    hasTouch: false,
    buttons: ['btn1', 'btn2', 'sw'],
    knobs: ['knob'],
    description: 'Default S3 board: ST7735 TFT, 12-LED WS2812 ring, two 3x3 light grids, rotary encoder with switch, two buttons, I2S audio.',
  },
  {
    id: 'waveshare-cam',
    name: 'Waveshare ESP32-S3-CAM-OV5640',
    chip: 's3',
    status: 'mature',
    cpu: '2x Xtensa LX7 @ 240MHz',
    hasDisplay: false,
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: true,
    hasTouch: false,
    buttons: [],
    knobs: [],
    description: 'OV5640 camera over SCCB + DVP; feed frames with --cam-image (BMP/PPM).',
  },
  {
    id: 'waveshare-lcd4b',
    name: 'Waveshare ESP32-S3-Touch-LCD-4B',
    chip: 's3',
    status: 'mature',
    cpu: '2x Xtensa LX7 @ 240MHz',
    hasDisplay: true,
    displayResolution: '480x480 ST7701S RGB',
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: false,
    hasTouch: true,
    buttons: [],
    knobs: [],
    requiredArgs: ['--flash-mb', '16', '--psram-mb', '8'],
    description: 'ST7701S 480x480 RGB panel behind a TCA9554 IO expander, GT911 touch.',
  },
  {
    id: 'waveshare-amoled18-v2',
    name: 'Waveshare ESP32-S3-Touch-AMOLED-1.8 V2',
    chip: 's3',
    status: 'mature',
    cpu: '2x Xtensa LX7 @ 240MHz',
    hasDisplay: true,
    displayResolution: '368x448 CO5300 AMOLED (QSPI)',
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: false,
    hasTouch: true,
    buttons: [],
    knobs: [],
    description: 'CO5300 AMOLED over QSPI with CST820 touch. V2 only (V1 uses different panel/touch chips).',
  },
  {
    id: 'waveshare-c6-lcd147',
    name: 'Waveshare ESP32-C6-LCD-1.47',
    chip: 'c6',
    status: 'mature',
    cpu: 'RISC-V RV32IMAC @ 160MHz',
    hasDisplay: true,
    displayResolution: '172x320 ST7789',
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: false,
    hasTouch: false,
    buttons: ['boot'],
    knobs: [],
    description: 'C6 board with ST7789 panel and BOOT button; 802.15.4 radio model.',
  },
  {
    id: 'ttgo-tdisplay',
    name: 'LilyGO TTGO T-Display (classic ESP32)',
    chip: 'esp32',
    status: 'mature',
    cpu: '2x Xtensa LX6 @ 240MHz',
    hasDisplay: true,
    displayResolution: '135x240 ST7789V',
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: false,
    hasTouch: false,
    buttons: ['right', 'boot'],
    knobs: [],
    description: 'Classic ESP32 with 1.14" ST7789V TFT and two buttons.',
  },
  {
    id: 'esp32dev-loopback',
    name: 'ESP32 DevKit with UART loopback (classic ESP32)',
    chip: 'esp32',
    status: 'mature',
    cpu: '2x Xtensa LX6 @ 240MHz',
    hasDisplay: false,
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: false,
    hasTouch: false,
    buttons: [],
    knobs: [],
    description: 'Classic ESP32 loopback test fixture.',
  },
  {
    id: 'none',
    name: 'Bare module (S3 / C6 / classic ESP32)',
    chip: 's3',
    status: 'mature',
    cpu: 'chip native',
    hasDisplay: false,
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: false,
    hasTouch: false,
    buttons: [],
    knobs: [],
    description: 'No devices, console only. Use for stock ESP-IDF projects (hello_world, web servers, unit tests). On the C3, simply omit the board.',
  },
];

/**
 * Get board details by ID
 */
export function getBoardById(id: string): BoardSpec | undefined {
  const norm = id.toLowerCase().trim();
  return SUPPORTED_BOARDS.find(
    (b) => b.id.toLowerCase() === norm || b.name.toLowerCase().includes(norm)
  );
}

/**
 * Filter boards by chip
 */
export function getBoardsByChip(chip?: string): BoardSpec[] {
  if (!chip) return SUPPORTED_BOARDS;
  const canonical = normalizeChip(chip);
  return SUPPORTED_BOARDS.filter((b) => b.chip === canonical || (b.id === 'none' && canonical !== 'c3'));
}
