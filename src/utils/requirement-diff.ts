import { formatPatch, OMIT_HEADERS, structuredPatch } from 'diff';

/**
 * Compute a unified diff between a main-spec requirement block and the delta
 * block that replaces it. A null main block (new capability) diffs against the
 * empty string, so every line reads as an addition.
 *
 * Uses structuredPatch to retain unified-diff hunk ranges while omitting the
 * synthetic file headers, since the caller provides its own labeling.
 */
export function diffRequirementBlock(baseBlock: string | null, deltaBlock: string, label: string): string {
  const base = ensureTrailingNewline(baseBlock ?? '');
  const delta = ensureTrailingNewline(deltaBlock);
  const patch = structuredPatch(label, label, base, delta);

  return formatPatch(patch, OMIT_HEADERS).trimEnd();
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : s + '\n';
}
