/** Configurable in-memory fake of the bee-js `Bee` client for tests. */

function bzz(plur: bigint) {
  return { toPLURBigInt: () => plur };
}

export interface FakeBeeConfig {
  chequebookEnabled?: boolean;
  unreachable?: boolean;
  fileSize?: number;
  sizeByRef?: Record<string, number>;
  notFoundRefs?: Set<string>;
  /** 404 for the first N attempts of any ref, then succeed (deferred-race). */
  notFoundUntilAttempt?: number;
  /** File names that throw HTTP 402 on upload. */
  uploadError402?: Set<string>;
  availableBalancePlur?: () => bigint;
  totalBalancePlur?: () => bigint;
  cheques?: () => { payout: bigint }[];
  balances?: () => { peer: string; balance: bigint }[];
  postageBatches?: unknown[];
}

export function makeFakeBee(config: FakeBeeConfig = {}) {
  const attempts: Record<string, number> = {};
  const uploads: { name: string; batchId: string; size?: number; deferred?: boolean }[] = [];

  return {
    uploads,
    downloadAttempts: attempts,

    async uploadFile(batchId: string, data: AsyncIterable<unknown>, name: string, opts?: { size?: number; deferred?: boolean }) {
      if (data && typeof (data as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
        for await (const _chunk of data) {
          void _chunk; // drain so the upload counter/progress flows
        }
      }
      if (config.uploadError402?.has(name)) {
        const err = Object.assign(new Error('Request failed with status code 402'), { status: 402 });
        throw err;
      }
      uploads.push({ name, batchId, size: opts?.size, deferred: opts?.deferred });
      return { reference: { toHex: () => `ref-${name}` } };
    },

    async downloadReadableFile(reference: string) {
      const key = String(reference);
      attempts[key] = (attempts[key] ?? 0) + 1;
      const fail =
        config.notFoundRefs?.has(key) ||
        (config.notFoundUntilAttempt != null && attempts[key] <= config.notFoundUntilAttempt);
      if (fail) {
        throw Object.assign(new Error('Request failed with status code 404'), { status: 404 });
      }
      const size = config.sizeByRef?.[key] ?? config.fileSize ?? 1024;
      async function* gen() {
        const half = Math.floor(size / 2);
        if (half > 0) yield Buffer.alloc(half);
        yield Buffer.alloc(size - half);
      }
      return { data: gen() };
    },

    async getChequebookAddress() {
      if (config.chequebookEnabled === false) throw new Error('no chequebook');
      return { chequebookAddress: '0xchequebook' };
    },
    async getChequebookBalance() {
      return {
        availableBalance: bzz(config.availableBalancePlur?.() ?? 0n),
        totalBalance: bzz(config.totalBalancePlur?.() ?? 0n),
      };
    },
    async getLastCheques() {
      const cs = config.cheques?.() ?? [];
      return { lastcheques: cs.map((c) => ({ lastsent: { payout: bzz(c.payout) } })) };
    },
    async getAllBalances() {
      const bs = config.balances?.() ?? [];
      return { balances: bs.map((b) => ({ peer: b.peer, balance: bzz(b.balance) })) };
    },
    async getHealth() {
      if (config.unreachable) throw new Error('ECONNREFUSED');
      return { status: 'ok' };
    },
    async getPostageBatches() {
      return config.postageBatches ?? [];
    },
  };
}

export type FakeBee = ReturnType<typeof makeFakeBee>;
