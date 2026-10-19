import * as fs from 'fs';
import * as path from 'path';
import { EspChip, normalizeChip } from './types.js';

export interface ResolvedFirmware {
  appBin?: string;
  bootloaderBin?: string;
  ptableBin?: string;
  elfPath?: string;
  flashImage?: string;
  chip?: 'esp32' | 's3' | 'c3' | 'c6';
  source: 'flasher_args' | 'explicit' | 'auto_discovered' | 'elf_only';
}

/**
 * Searches and resolves firmware binaries from a project directory or explicit paths
 */
export function resolveFirmware(options: {
  projectDir?: string;
  appBin?: string;
  bootloaderBin?: string;
  ptableBin?: string;
  elfFile?: string;
  flashImage?: string;
  chip?: EspChip;
}): ResolvedFirmware {
  const { appBin, bootloaderBin, ptableBin, elfFile, flashImage, chip } = options;

  // 1. If explicit binaries were given
  if (appBin || flashImage || elfFile) {
    return {
      appBin: appBin ? path.resolve(appBin) : undefined,
      bootloaderBin: bootloaderBin ? path.resolve(bootloaderBin) : undefined,
      ptableBin: ptableBin ? path.resolve(ptableBin) : undefined,
      elfPath: elfFile ? path.resolve(elfFile) : undefined,
      flashImage: flashImage ? path.resolve(flashImage) : undefined,
      chip: chip ? normalizeChip(chip) : undefined,
      source: 'explicit',
    };
  }

  // 2. Discover in project directory
  const root = path.resolve(options.projectDir || process.cwd());
  const candidateBuildDirs = [
    path.join(root, 'build'),
    root,
    path.join(root, '.pio', 'build'),
  ];

  for (const bDir of candidateBuildDirs) {
    if (!fs.existsSync(bDir)) continue;

    // Check ESP-IDF flasher_args.json
    const flasherArgsPath = path.join(bDir, 'flasher_args.json');
    if (fs.existsSync(flasherArgsPath)) {
      try {
        const raw = fs.readFileSync(flasherArgsPath, 'utf-8');
        const json = JSON.parse(raw);
        const flashFiles = json.flash_files || {};
        const target = json.target || json.chip || chip;

        let foundApp: string | undefined;
        let foundBootloader: string | undefined;
        let foundPtable: string | undefined;

        for (const [offset, relPath] of Object.entries(flashFiles)) {
          const abs = path.isAbsolute(relPath as string)
            ? (relPath as string)
            : path.join(bDir, relPath as string);
          const lower = (relPath as string).toLowerCase();

          if (lower.includes('bootloader')) {
            foundBootloader = abs;
          } else if (lower.includes('partition') || lower.includes('ptable')) {
            foundPtable = abs;
          } else if (!foundApp && lower.endsWith('.bin')) {
            foundApp = abs;
          }
        }

        // Also check if an ELF file exists in build directory
        let foundElf: string | undefined;
        if (json.app?.elf) {
          foundElf = path.resolve(bDir, json.app.elf);
        } else {
          const files = fs.readdirSync(bDir);
          const elfName = files.find((f) => f.endsWith('.elf') && !f.includes('bootloader'));
          if (elfName) foundElf = path.join(bDir, elfName);
        }

        if (foundApp || foundBootloader || foundPtable) {
          return {
            appBin: foundApp,
            bootloaderBin: foundBootloader,
            ptableBin: foundPtable,
            elfPath: foundElf,
            chip: target ? normalizeChip(target) : chip ? normalizeChip(chip) : 's3',
            source: 'flasher_args',
          };
        }
      } catch {
        // Fall back to scanning files
      }
    }

    // Direct search for standard ESP-IDF file layout in build directory
    const bootloaderCand = path.join(bDir, 'bootloader', 'bootloader.bin');
    const ptableCand = path.join(bDir, 'partition_table', 'partition-table.bin');
    
    let appCand: string | undefined;
    let elfCand: string | undefined;

    try {
      const files = fs.readdirSync(bDir);
      for (const f of files) {
        if (f.endsWith('.bin') && f !== 'bootloader.bin' && f !== 'partition-table.bin') {
          appCand = path.join(bDir, f);
        }
        if (f.endsWith('.elf') && !f.includes('bootloader')) {
          elfCand = path.join(bDir, f);
        }
      }
    } catch {
      // Ignore directory read errors
    }

    if (appCand || elfCand) {
      return {
        appBin: appCand,
        bootloaderBin: fs.existsSync(bootloaderCand) ? bootloaderCand : undefined,
        ptableBin: fs.existsSync(ptableCand) ? ptableCand : undefined,
        elfPath: elfCand,
        chip: chip ? normalizeChip(chip) : 's3',
        source: 'auto_discovered',
      };
    }
  }

  throw new Error(
    `No ESP32 firmware binaries (.bin or .elf) found in '${root}' or '${path.join(root, 'build')}'. ` +
    `Please compile with 'idf.py build' first, or supply --app, --bootloader, and --ptable.`
  );
}
