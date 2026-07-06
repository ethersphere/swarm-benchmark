/** Measurement record types + JSON/CSV serialization (format by extension). */

import { readFile, writeFile } from 'node:fs/promises';
import { MB, plurToBzz } from './units.js';

export type DownloadMode = 'serial' | 'burst';

export interface FileRecord {
  name: string;
  reference: string;
  size: number;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  bytesDownloaded: number;
  error: string | null;
}

export interface ProgressSample {
  tMs: number;
  timestamp: string;
  totalBytes: number;
  perFile: Record<string, number>;
}

export interface ChequebookSample {
  tMs: number;
  timestamp: string;
  availableBalancePlur: string;
  totalBalancePlur: string;
  totalChequesValuePlur: string;
  chequeCount: number;
}

/**
 * SWAP accounting balances (`/balances`). Debt accrues here continuously, well
 * before it crosses the payment threshold and becomes a cheque — so this is the
 * sensitive, sub-threshold cost signal. Sign convention (this node's view):
 * negative balance = we owe the peer (retrieval debt), positive = peer owes us.
 */
export interface BalanceSample {
  tMs: number;
  timestamp: string;
  /** Sum of signed per-peer balances. */
  netBalancePlur: string;
  /** Sum of |negative balances| — what we owe peers (retrieval debt). */
  owedToPeersPlur: string;
  /** Sum of positive balances — what peers owe us (e.g. storage credit). */
  owedByPeersPlur: string;
  /** Signed per-peer balance (PLUR). Needed to isolate retrieval outflow from
   * concurrent storage credit: a peer's balance moving *down* means we paid it. */
  perPeer: Record<string, string>;
  peerCount: number;
}

export interface Records {
  mode: DownloadMode;
  startedAt: string;
  finishedAt: string;
  downloadBeeUrl: string;
  sampleIntervalMs: number;
  settleMs: number;
  chequebookEnabled: boolean;
  files: FileRecord[];
  progressSamples: ProgressSample[];
  chequebookSamples: ChequebookSample[];
  balanceSamples: BalanceSample[];
}

function isCsv(path: string): boolean {
  return path.toLowerCase().endsWith('.csv');
}

/**
 * CSV export merges the two time series by `tMs` into one row per sample tick.
 * Per-file progress and the full file table are only kept in JSON.
 */
function toCsv(records: Records): string {
  const chequeByT = new Map<number, ChequebookSample>();
  for (const c of records.chequebookSamples) chequeByT.set(c.tMs, c);
  const balanceByT = new Map<number, BalanceSample>();
  for (const b of records.balanceSamples) balanceByT.set(b.tMs, b);

  const header = [
    'tMs',
    'timestamp',
    'totalMB',
    'availableBzz',
    'totalBalanceBzz',
    'chequesSentBzz',
    'chequeCount',
    'owedToPeersBzz',
    'netBalanceBzz',
  ];
  const rows = [header.join(',')];

  for (const p of records.progressSamples) {
    const c = chequeByT.get(p.tMs);
    const b = balanceByT.get(p.tMs);
    rows.push(
      [
        p.tMs,
        p.timestamp,
        (p.totalBytes / MB).toFixed(4),
        c ? plurToBzz(BigInt(c.availableBalancePlur)).toFixed(8) : '',
        c ? plurToBzz(BigInt(c.totalBalancePlur)).toFixed(8) : '',
        c ? plurToBzz(BigInt(c.totalChequesValuePlur)).toFixed(8) : '',
        c ? c.chequeCount : '',
        b ? plurToBzz(BigInt(b.owedToPeersPlur)).toFixed(8) : '',
        b ? plurToBzz(BigInt(b.netBalancePlur)).toFixed(8) : '',
      ].join(','),
    );
  }
  return rows.join('\n') + '\n';
}

export async function writeRecords(path: string, records: Records): Promise<void> {
  if (isCsv(path)) {
    await writeFile(path, toCsv(records));
  } else {
    await writeFile(path, JSON.stringify(records, null, 2));
  }
}

export async function readRecords(path: string): Promise<Records> {
  if (isCsv(path)) {
    throw new Error(
      `Cannot build a full report from CSV (${path}); per-file data is only in JSON. ` +
        `Re-run the downloader with a .json output, or point report at the .json file.`,
    );
  }
  return JSON.parse(await readFile(path, 'utf8')) as Records;
}
