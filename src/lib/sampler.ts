/** Periodic sampler for chequebook balance/cheques and download progress. */

import type { Bee } from '@ethersphere/bee-js';
import type { BalanceSample, ChequebookSample, ProgressSample } from './records';

export interface SamplerOptions {
  bee: Bee;
  chequebookEnabled: boolean;
  intervalMs: number;
  /** Reference time (Date.now()) used to compute relative tMs. */
  t0: number;
  /** Snapshot of current download progress at sample time. */
  getProgress: () => { totalBytes: number; perFile: Record<string, number> };
  progressSamples: ProgressSample[];
  chequebookSamples: ChequebookSample[];
  balanceSamples: BalanceSample[];
}

/**
 * Samples progress every tick and, when a chequebook is present, the chequebook
 * balance and cumulative sent-cheque value. Overlapping ticks are skipped so a
 * slow endpoint cannot pile up requests.
 */
export class Sampler {
  private timer: NodeJS.Timeout | null = null;
  private sampling = false;

  constructor(private readonly opts: SamplerOptions) {}

  start(): void {
    if (this.timer) return;
    // Take an immediate baseline sample (t≈0) so cost deltas are measured from
    // the true pre-download state, then sample on the interval.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
  }

  /** Stop the interval and take one final sample. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.tick();
  }

  private async tick(): Promise<void> {
    if (this.sampling) return;
    this.sampling = true;
    try {
      const tMs = Date.now() - this.opts.t0;
      const timestamp = new Date().toISOString();

      const p = this.opts.getProgress();
      this.opts.progressSamples.push({
        tMs,
        timestamp,
        totalBytes: p.totalBytes,
        perFile: { ...p.perFile },
      });

      if (this.opts.chequebookEnabled) {
        const [cheque, balance] = await Promise.all([
          this.sampleChequebook(tMs, timestamp),
          this.sampleBalances(tMs, timestamp),
        ]);
        if (cheque) this.opts.chequebookSamples.push(cheque);
        if (balance) this.opts.balanceSamples.push(balance);
      }
    } finally {
      this.sampling = false;
    }
  }

  private async sampleBalances(tMs: number, timestamp: string): Promise<BalanceSample | null> {
    try {
      const { balances } = await this.opts.bee.getAllBalances();
      let net = 0n;
      let owedToPeers = 0n;
      let owedByPeers = 0n;
      const perPeer: Record<string, string> = {};
      for (const b of balances) {
        const v = b.balance.toPLURBigInt();
        net += v;
        if (v < 0n) owedToPeers += -v;
        else owedByPeers += v;
        perPeer[b.peer] = v.toString();
      }
      return {
        tMs,
        timestamp,
        netBalancePlur: net.toString(),
        owedToPeersPlur: owedToPeers.toString(),
        owedByPeersPlur: owedByPeers.toString(),
        perPeer,
        peerCount: balances.length,
      };
    } catch {
      return null;
    }
  }

  private async sampleChequebook(
    tMs: number,
    timestamp: string,
  ): Promise<ChequebookSample | null> {
    try {
      const [balance, cheques] = await Promise.all([
        this.opts.bee.getChequebookBalance(),
        this.opts.bee.getLastCheques(),
      ]);

      let totalCheques = 0n;
      let chequeCount = 0;
      for (const entry of cheques.lastcheques) {
        if (entry.lastsent) {
          totalCheques += entry.lastsent.payout.toPLURBigInt();
          chequeCount++;
        }
      }

      return {
        tMs,
        timestamp,
        availableBalancePlur: balance.availableBalance.toPLURBigInt().toString(),
        totalBalancePlur: balance.totalBalance.toPLURBigInt().toString(),
        totalChequesValuePlur: totalCheques.toString(),
        chequeCount,
      };
    } catch {
      // Transient endpoint error — skip this tick rather than abort the run.
      return null;
    }
  }
}
