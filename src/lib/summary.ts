/** Derived statistics (speed, BZZ cost, MB/BZZ) from a records file. */

import { MB, bzzString, mbPerBzz } from './units.js';
import type { BalanceSample, Records } from './records.js';

/**
 * Total PLUR paid to peers between the baseline sample and `upTo` (default: the
 * last sample), computed as the sum of per-peer balance *decreases*. Downward
 * movement = we paid that peer (retrieval); upward movement (credit earned) is
 * ignored, so concurrent storage payments don't mask retrieval cost.
 */
export function accountingOutflow(samples: BalanceSample[], upTo?: BalanceSample): bigint {
  if (samples.length === 0) return 0n;
  const first = samples[0].perPeer;
  const last = (upTo ?? samples[samples.length - 1]).perPeer;
  const peers = new Set([...Object.keys(first), ...Object.keys(last)]);
  let spent = 0n;
  for (const peer of peers) {
    const before = BigInt(first[peer] ?? '0');
    const after = BigInt(last[peer] ?? '0');
    if (after < before) spent += before - after;
  }
  return spent;
}

export interface Summary {
  totalBytes: number;
  fileCount: number;
  failedCount: number;
  /** Wall-clock seconds from first download start to last download finish. */
  downloadSeconds: number;
  aggregateMBps: number;
  /** BZZ spent inferred from the drop in chequebook available balance (PLUR). */
  balanceSpentPlur: bigint;
  /** BZZ spent inferred from the rise in cumulative sent cheques (PLUR). */
  chequeSpentPlur: bigint;
  /** Retrieval cost from the rise in SWAP accounting debt to peers (PLUR). */
  accountingSpentPlur: bigint;
  /** Preferred spend figure used for MB/BZZ. */
  spentPlur: bigint;
  /** Which signal `spentPlur` came from. */
  spentSource: 'cheques+accounting' | 'cheques' | 'accounting' | 'balance' | 'none';
  mbPerBzz: number | null;
}

function biggest(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function computeSummary(records: Records): Summary {
  const totalBytes = records.files.reduce((sum, f) => sum + f.bytesDownloaded, 0);
  const failedCount = records.files.filter((f) => f.error).length;

  const starts = records.files.map((f) => f.startedAt).filter(Boolean) as string[];
  const ends = records.files.map((f) => f.finishedAt).filter(Boolean) as string[];
  let downloadSeconds = 0;
  if (starts.length && ends.length) {
    const first = Math.min(...starts.map((s) => Date.parse(s)));
    const last = Math.max(...ends.map((s) => Date.parse(s)));
    downloadSeconds = (last - first) / 1000;
  }
  const aggregateMBps = downloadSeconds > 0 ? totalBytes / MB / downloadSeconds : 0;

  let balanceSpentPlur = 0n;
  let chequeSpentPlur = 0n;
  const chq = records.chequebookSamples;
  if (chq.length >= 1) {
    const first = chq[0];
    const last = chq[chq.length - 1];
    balanceSpentPlur = biggest(
      0n,
      BigInt(first.availableBalancePlur) - BigInt(last.availableBalancePlur),
    );
    chequeSpentPlur = biggest(
      0n,
      BigInt(last.totalChequesValuePlur) - BigInt(first.totalChequesValuePlur),
    );
  }

  // SWAP accounting reacts to retrieval immediately, before debt crosses the
  // payment threshold and becomes a cheque — the most sensitive cost signal for
  // ad-hoc runs. We measure per-peer *outflow* (sum of each peer's balance
  // decrease from baseline to final): a peer's balance moving down means we paid
  // it for retrieval. This isolates retrieval spend from any storage credit
  // earned concurrently (which moves balances up and is ignored).
  const accountingSpentPlur = accountingOutflow(records.balanceSamples);

  // Settled debt (cheques) leaves the accounting balance; unsettled debt stays
  // in it (accounting outflow). They're complementary, so total retrieval spend
  // is their sum. Fall back to the chequebook balance drop only if we have no
  // per-peer accounting samples at all.
  let spentPlur = chequeSpentPlur + accountingSpentPlur;
  let spentSource: Summary['spentSource'] = 'none';
  if (chequeSpentPlur > 0n && accountingSpentPlur > 0n) spentSource = 'cheques+accounting';
  else if (chequeSpentPlur > 0n) spentSource = 'cheques';
  else if (accountingSpentPlur > 0n) spentSource = 'accounting';
  else if (balanceSpentPlur > 0n) {
    spentPlur = balanceSpentPlur;
    spentSource = 'balance';
  }

  return {
    totalBytes,
    fileCount: records.files.length,
    failedCount,
    downloadSeconds,
    aggregateMBps,
    balanceSpentPlur,
    chequeSpentPlur,
    accountingSpentPlur,
    spentPlur,
    spentSource,
    mbPerBzz: mbPerBzz(totalBytes, spentPlur),
  };
}

export function printSummary(records: Records): void {
  const s = computeSummary(records);
  console.log('\n─── Summary ───────────────────────────────');
  console.log(`Mode:            ${records.mode}`);
  console.log(`Files:           ${s.fileCount}${s.failedCount ? ` (${s.failedCount} failed)` : ''}`);
  console.log(`Downloaded:      ${(s.totalBytes / MB).toFixed(2)} MB`);
  console.log(`Wall time:       ${s.downloadSeconds.toFixed(1)} s`);
  console.log(`Throughput:      ${s.aggregateMBps.toFixed(2)} MB/s`);

  if (records.chequebookEnabled) {
    console.log(`Retrieval spend: ${bzzString(s.accountingSpentPlur)} BZZ  (accounting outflow, sub-threshold)`);
    console.log(`Cheques spent:   ${bzzString(s.chequeSpentPlur)} BZZ  (settled)`);
    console.log(`Balance drop:    ${bzzString(s.balanceSpentPlur)} BZZ`);
    if (s.mbPerBzz !== null) {
      console.log(
        `\n  ➜ ${s.mbPerBzz.toFixed(1)} MB per BZZ  (${(s.mbPerBzz / 1024).toFixed(3)} GB per BZZ)  [from ${s.spentSource}]`,
      );
    } else {
      console.log(
        '\n  ➜ No BZZ spent — the download node likely already stored these chunks (serve them locally). ' +
          'Use a download node outside the chunks’ neighborhood, or a larger dataset.',
      );
    }
  } else {
    console.log('Chequebook:      disabled (no cost measured)');
  }
  console.log('───────────────────────────────────────────');
}
