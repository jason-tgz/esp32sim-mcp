import { runSimulation } from './runner.js';
import { ExpectOptions, ExpectResult, PatternCheckResult, SimResult } from './types.js';

/**
 * Checks a list of patterns against UART logs
 */
export function checkExpectations(
  logs: string,
  patterns: (string | RegExp)[],
  options: { ordered?: boolean; caseSensitive?: boolean } = {}
): {
  passed: boolean;
  matchedCount: number;
  patternResults: PatternCheckResult[];
  missingPattern?: string;
  diffSummary?: string;
} {
  const ordered = options.ordered !== false;
  const caseSensitive = options.caseSensitive !== false;
  const lines = logs.split(/\r?\n/);

  const patternResults: PatternCheckResult[] = [];
  let currentLineIndex = 0;
  let allMatched = true;
  let missingPattern: string | undefined;

  for (const pat of patterns) {
    const patString = pat instanceof RegExp ? pat.source : pat;
    let found = false;
    let foundLineIndex = -1;
    let foundLineText = '';

    const startIdx = ordered ? currentLineIndex : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      let matches = false;

      if (pat instanceof RegExp) {
        matches = pat.test(line);
      } else {
        if (caseSensitive) {
          matches = line.includes(pat);
        } else {
          matches = line.toLowerCase().includes(pat.toLowerCase());
        }
      }

      if (matches) {
        found = true;
        foundLineIndex = i;
        foundLineText = line;
        if (ordered) {
          currentLineIndex = i + 1;
        }
        break;
      }
    }

    if (found) {
      patternResults.push({
        pattern: patString,
        matched: true,
        matchedLine: foundLineText.trim(),
        lineNumber: foundLineIndex + 1,
      });
    } else {
      patternResults.push({
        pattern: patString,
        matched: false,
      });
      allMatched = false;
      if (!missingPattern) {
        missingPattern = patString;
      }
      if (ordered) {
        // If ordered and one pattern fails, subsequent ordered patterns cannot match in order
        break;
      }
    }
  }

  const matchedCount = patternResults.filter((r) => r.matched).length;

  let diffSummary = '';
  if (!allMatched) {
    const missing = patternResults.filter((r) => !r.matched).map((r) => `  ❌ MISSING: "${r.pattern}"`).join('\n');
    const matched = patternResults.filter((r) => r.matched).map((r) => `  ✅ FOUND (line ${r.lineNumber}): "${r.matchedLine}"`).join('\n');
    diffSummary = `Expectation failure:\n${missing}\n\nMatched patterns before failure:\n${matched || '  (none)'}`;
  }

  return {
    passed: allMatched && patternResults.length === patterns.length,
    matchedCount,
    patternResults,
    missingPattern,
    diffSummary: diffSummary || undefined,
  };
}

/**
 * Runs simulation and asserts expected UART output
 */
export async function runExpect(options: ExpectOptions): Promise<ExpectResult> {
  // An expectation with nothing to expect would pass without checking anything
  if (!Array.isArray(options.patterns) || options.patterns.length === 0) {
    throw new Error('`patterns` is required: pass at least one string or regex expected on the console.');
  }
  const simResult: SimResult = await runSimulation(options);

  const check = checkExpectations(simResult.uartLogs, options.patterns, {
    ordered: options.ordered,
    caseSensitive: options.caseSensitive,
  });

  const passed = check.passed && simResult.success;

  return {
    passed,
    matchedCount: check.matchedCount,
    totalPatterns: options.patterns.length,
    patternResults: check.patternResults,
    missingPattern: check.missingPattern,
    diffSummary: check.diffSummary || (simResult.hasCrashed ? `Firmware crashed: ${simResult.panicMessage}` : undefined),
    simResult,
  };
}
