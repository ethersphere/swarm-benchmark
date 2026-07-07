/** BZZ/PLUR conversions and byte helpers (delegating size handling to bee-js). */

import { Size } from '@ethersphere/bee-js';

/**
 * Bytes per megabyte. Decimal (1000-based) to match bee-js `Size`, which uses
 * 1000 to stay consistent with the Swarm papers on storage capacity.
 */
export const MB = 1_000_000;

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

/** Human-readable byte size, e.g. "5 MB" (via bee-js `Size`). */
export function formatBytes(bytes: number): string {
  return Size.fromBytes(bytes).toFormattedString();
}

/**
 * MB downloaded per 1 BZZ spent. Returns null when no BZZ was spent
 * (e.g. chequebook disabled, or all chunks served locally).
 */
export function mbPerBzz(bytes: number, plurSpent: bigint): number | null {
  if (plurSpent <= 0n) return null;
  return bytes / MB / plurToBzz(plurSpent);
}
