/**
 * Supported Espressif chips in esp32sim
 */
export type EspChip = 'esp32' | 'esp32s3' | 'esp32c3' | 'esp32c6' | 's3' | 'c3' | 'c6';

/**
 * Normalizes chip name to canonical format ('esp32' | 's3' | 'c3' | 'c6')
 */
export function normalizeChip(chip?: string): 'esp32' | 's3' | 'c3' | 'c6' {
  if (!chip) return 's3';
  const c = chip.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (c === 'esp32s3' || c === 's3') return 's3';
  if (c === 'esp32c3' || c === 'c3') return 'c3';
  if (c === 'esp32c6' || c === 'c6') return 'c6';
  if (c === 'esp32') return 'esp32';
  return 's3';
}

/**
 * Board specifications and peripherals modeled by esp32sim
 */
export interface BoardSpec {
  id: string;
  name: string;
  chip: 'esp32' | 's3' | 'c3' | 'c6';
  status: 'mature' | 'draft' | 'early';
  cpu: string;
  hasDisplay: boolean;
  displayResolution?: string;
  hasWifi: boolean;
  hasBle: boolean;
  hasAudio: boolean;
  hasCamera: boolean;
  buttons: string[];
  knobs: string[];
  description: string;
}

/**
 * Script events for interactive test scripts
 */
export type ScriptAction = 'press' | 'knob' | 'serial' | 'stop';

export interface BaseEvent {
  time: number; // Emulated seconds from start (e.g. 1.5)
}

export interface PressEvent extends BaseEvent {
  action: 'press';
  target: string; // e.g. "btn1", "btn2", "boot"
  durationMs?: number; // Duration button is held down (e.g. 150)
}

export interface KnobEvent extends BaseEvent {
  action: 'knob';
  direction: 'cw' | 'ccw';
  steps?: number; // Number of detents (default 1)
}

export interface SerialEvent extends BaseEvent {
  action: 'serial';
  data: string; // Serial text or JSON to inject into UART
}

export interface StopEvent extends BaseEvent {
  action: 'stop';
}

export type SimEvent = PressEvent | KnobEvent | SerialEvent | StopEvent;

/**
 * Options for running a simulation
 */
export interface SimRunOptions {
  projectDir?: string;
  appBin?: string;
  bootloaderBin?: string;
  ptableBin?: string;
  romBin?: string;
  elfFile?: string;
  flashImage?: string;
  chip?: EspChip;
  board?: string;
  maxSeconds?: number; // Emulated seconds (default 10)
  timeoutMs?: number; // Real-world timeout in ms (default 30000)
  stopAfterExceptions?: number; // Stop after N exceptions (default 1)
  console?: 'uart0' | 'usb' | 'both' | 'all' | 'none';
  wifi?: string; // Virtual AP name or config
  net?: 'nat' | 'none';
  tftPng?: string; // Output path for display snapshot
  script?: string | SimEvent[]; // Script path or array of events
  serialInput?: string; // Initial serial input
  customArgs?: string[];
  stripAnsi?: boolean;
  esp32simPath?: string;
}

/**
 * Result of a simulation run
 */
export interface SimResult {
  success: boolean;
  exitCode: number;
  stopReason: 'timeout' | 'exception' | 'script_stop' | 'completed' | 'error';
  uartLogs: string;
  rawStdout: string;
  rawStderr: string;
  emulatedSeconds?: number;
  wallClockTimeMs: number;
  exceptions: string[];
  hasCrashed: boolean;
  panicMessage?: string;
  screenshotPath?: string;
  screenshotBase64?: string;
}

/**
 * Options for assertion tests (sim_expect)
 */
export interface ExpectOptions extends SimRunOptions {
  patterns: (string | RegExp)[];
  ordered?: boolean; // If true, patterns must appear in sequential order
  caseSensitive?: boolean;
}

export interface PatternCheckResult {
  pattern: string;
  matched: boolean;
  matchedLine?: string;
  lineNumber?: number;
}

export interface ExpectResult {
  passed: boolean;
  matchedCount: number;
  totalPatterns: number;
  patternResults: PatternCheckResult[];
  missingPattern?: string;
  diffSummary?: string;
  simResult: SimResult;
}

/**
 * Environment & binary health check result
 */
export interface DoctorResult {
  esp32simFound: boolean;
  binaryPath?: string;
  version?: string;
  rustInstalled: boolean;
  rustVersion?: string;
  idfTargetInstalled: boolean;
  platform: string;
  arch: string;
  recommendations: string[];
}
