import { describe, it, expect } from 'vitest';
import { MB, PLUR_PER_BZZ, plurToBzz, bzzString, formatBytes, mbPerBzz } from '../../src/lib/units';

describe('units', () => {
  it('MB is decimal (1e6) to match bee-js Size', () => {
    expect(MB).toBe(1_000_000);
  });

  it('1 BZZ = 1e16 PLUR', () => {
    expect(PLUR_PER_BZZ).toBe(10n ** 16n);
  });

  it('plurToBzz converts PLUR to a BZZ float', () => {
    expect(plurToBzz(10n ** 16n)).toBe(1);
    expect(plurToBzz(5n * 10n ** 15n)).toBe(0.5);
    expect(plurToBzz(0n)).toBe(0);
  });

  it('bzzString formats to N decimals', () => {
    expect(bzzString(10n ** 16n)).toBe('1.00000000');
    expect(bzzString(10n ** 16n, 2)).toBe('1.00');
  });

  it('formatBytes uses decimal (1000-based) units', () => {
    expect(formatBytes(1_000_000)).toContain('MB');
    expect(formatBytes(1_000_000_000)).toContain('GB');
    // decimal: 1.5 MB, not 1.43 MB (binary)
    expect(formatBytes(1_500_000)).toContain('1.5');
  });

  it('mbPerBzz = MB downloaded per BZZ, null when nothing spent', () => {
    expect(mbPerBzz(100 * MB, 10n ** 16n)).toBeCloseTo(100, 6);
    expect(mbPerBzz(50 * MB, 5n * 10n ** 15n)).toBeCloseTo(100, 6);
    expect(mbPerBzz(100 * MB, 0n)).toBeNull();
    expect(mbPerBzz(100 * MB, -5n)).toBeNull();
  });
});
