/**
 * Requirement IDs.
 *
 * Every requirement carries a stable ID, written as a tag on its `Rule:`
 * (`@REQ-0001`). An ID is `REQ-` followed by at least four digits. IDs are
 * handed out by a counter that only goes up, so an ID is never reused, not
 * even after its requirement is removed. Code points back at a requirement
 * by its ID, in a `@trace` comment that names the ID.
 */

export const REQUIREMENT_ID_PREFIX = 'REQ-';
export const REQUIREMENT_ID_MIN_DIGITS = 4;

/**
 * Regular-expression source for one ID, without anchors or flags, for callers
 * that build their own pattern (for example a trace scanner).
 */
export const REQUIREMENT_ID_PATTERN_SOURCE = 'REQ-\\d{4,}';

const REQUIREMENT_ID_REGEX = /^REQ-(\d{4,})$/;

/** True for a bare ID (`REQ-0001`), not a tag (`@REQ-0001`). */
export function isRequirementId(value: string): boolean {
  return REQUIREMENT_ID_REGEX.test(value);
}

export function formatRequirementId(n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(`Requirement ID number must be a positive integer, got ${n}`);
  }
  return `${REQUIREMENT_ID_PREFIX}${String(n).padStart(REQUIREMENT_ID_MIN_DIGITS, '0')}`;
}

/** The number in an ID (`REQ-0042` → 42), or undefined for anything else. */
export function requirementIdNumber(id: string): number | undefined {
  const match = id.match(REQUIREMENT_ID_REGEX);
  return match ? Number(match[1]) : undefined;
}

/** Sort IDs by their number, so `REQ-10000` follows `REQ-9999`. */
export function compareRequirementIds(a: string, b: string): number {
  return (requirementIdNumber(a) ?? 0) - (requirementIdNumber(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Every ID tag in a text (`@REQ-0001` → `REQ-0001`), in order, with repeats.
 * A plain scan rather than a parse, so it also reads files that do not parse.
 */
export function findRequirementIdTags(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/(?<![\w@])@(REQ-\d{4,})(?![\w-])/g)) {
    ids.push(match[1]);
  }
  return ids;
}
