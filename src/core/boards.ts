import { BoardSpec, EspChip, normalizeChip } from './types.js';

export const SUPPORTED_BOARDS: BoardSpec[] = [
  {
    id: 'atech14',
    name: 'Atech 14-Port Kit (ESP32-S3)',
    chip: 's3',
    status: 'mature',
    cpu: '2x Xtensa LX7 @ 240MHz',
    hasDisplay: true,
    displayResolution: '480x480 (ST7701S RGB)',
    hasWifi: true,
    hasBle: false,
    hasAudio: true,
    hasCamera: false,
    buttons: ['btn1', 'btn2', 'boot'],
    knobs: ['knob1'],
    description: 'Reference kit with 480x480 RGB display, audio SID player, buttons, and rotary encoder.',
  },
  {
    id: 'waveshare-touch-lcd-4b',
    name: 'Waveshare Touch-LCD-4B (ESP32-S3)',
    chip: 's3',
    status: 'mature',
    cpu: '2x Xtensa LX7 @ 240MHz',
    hasDisplay: true,
    displayResolution: '720x720 Round / Touch',
    hasWifi: true,
    hasBle: false,
    hasAudio: true,
    hasCamera: false,
    buttons: ['boot'],
    knobs: [],
    description: 'Round touch display board for modern IoT UI and smart control panels.',
  },
  {
    id: 'touch-amoled-1.8',
    name: 'LilyGO T-Display AMOLED 1.8 (ESP32-S3)',
    chip: 's3',
    status: 'mature',
    cpu: '2x Xtensa LX7 @ 240MHz',
    hasDisplay: true,
    displayResolution: '368x448 AMOLED',
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: false,
    buttons: ['btn1', 'btn2'],
    knobs: [],
    description: 'Vibrant AMOLED wearable & smart sensor display.',
  },
  {
    id: 'esp32s3-cam',
    name: 'ESP32-S3-CAM',
    chip: 's3',
    status: 'mature',
    cpu: '2x Xtensa LX7 @ 240MHz',
    hasDisplay: false,
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: true,
    buttons: ['boot'],
    knobs: [],
    description: 'Camera development board with simulated OV2640 sensor input.',
  },
  {
    id: 'waveshare-c6-lcd-1.47',
    name: 'Waveshare ESP32-C6-LCD-1.47',
    chip: 'c6',
    status: 'draft',
    cpu: 'RISC-V RV32IMAC @ 160MHz',
    hasDisplay: true,
    displayResolution: '172x320 ST7789',
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: false,
    buttons: ['boot'],
    knobs: [],
    description: 'RISC-V C6 development board with 802.15.4 Zigbee/Thread/Matter radio model.',
  },
  {
    id: 'ttgo-t-display',
    name: 'LilyGO TTGO T-Display (Classic ESP32)',
    chip: 'esp32',
    status: 'early',
    cpu: '2x Xtensa LX6 @ 240MHz',
    hasDisplay: true,
    displayResolution: '135x240 IPS (ST7789)',
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: false,
    buttons: ['btn1', 'btn2'],
    knobs: [],
    description: 'Popular ESP32 dual-core IoT board with 1.14" color TFT.',
  },
  {
    id: 'generic-console',
    name: 'Generic Headless Console (ESP32-C3 / S3 / C6 / ESP32)',
    chip: 'c3',
    status: 'mature',
    cpu: 'RISC-V RV32IMC @ 160MHz (or chip native)',
    hasDisplay: false,
    hasWifi: true,
    hasBle: false,
    hasAudio: false,
    hasCamera: false,
    buttons: ['boot'],
    knobs: [],
    description: 'Pure headless UART console simulation for backend logic, web servers, and unit tests.',
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
  return SUPPORTED_BOARDS.filter((b) => b.chip === canonical);
}
