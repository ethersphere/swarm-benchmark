/** Unit constants and conversions for bytes and BZZ/PLUR. */

export const KB = 1024;
export const MB = 1024 * 1024;
export const GB = 1024 * 1024 * 1024;

/** 1 BZZ = 10^16 PLUR (BZZ has 16 decimals). */
export const PLUR_PER_BZZ = 10n ** 16n;

/** Convert a PLUR amount (bigint) to a floating-point BZZ value. */
export function plurToBzz(plur: bigint): number {
  return Number(plur) / 1e16;
}

/** Format a PLUR amount as a human-readable BZZ decimal string. */
export function bzzString(plur: bigint, digits = 8): string {
  return plurToBzz(plur).toFixed(digits);
}

/** Human-readable byte size, e.g. "5.00 MB". */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(2)} KB`;
  return `${bytes} B`;
}

/**
 * MB downloaded per 1 BZZ spent. Returns null when no BZZ was spent
 * (e.g. chequebook disabled, or all chunks served locally).
 */
export function mbPerBzz(bytes: number, plurSpent: bigint): number | null {
  if (plurSpent <= 0n) return null;
  return bytes / MB / plurToBzz(plurSpent);
}
