import { describe, it, expect } from 'vitest';
import { isChequebookEnabled } from '../../src/lib/bee';
import type { Bee } from '@ethersphere/bee-js';

describe('isChequebookEnabled', () => {
  it('true when the chequebook endpoint responds', async () => {
    const bee = { getChequebookAddress: async () => ({ chequebookAddress: '0x1' }) } as unknown as Bee;
    expect(await isChequebookEnabled(bee)).toBe(true);
  });

  it('false when the chequebook endpoint throws (gateway/light node)', async () => {
    const bee = { getChequebookAddress: async () => { throw new Error('404'); } } as unknown as Bee;
    expect(await isChequebookEnabled(bee)).toBe(false);
  });
});
