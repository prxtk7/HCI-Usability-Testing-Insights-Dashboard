import { describe, expect, it } from 'vitest';
import { EMPTY, formatDecimal, formatDuration, formatPercent } from './format';

describe('formatters', () => {
  it('show a dash for missing or impossible values', () => {
    expect(formatPercent(null)).toBe(EMPTY);
    expect(formatPercent(Number.NaN)).toBe(EMPTY);
    expect(formatDuration(null)).toBe(EMPTY);
    expect(formatDuration(-5)).toBe(EMPTY);
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe(EMPTY);
    expect(formatDecimal(null)).toBe(EMPTY);
  });

  it('format valid values', () => {
    expect(formatPercent(0.625)).toBe('63%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(125)).toBe('2m 05s');
    expect(formatDecimal(1.234, 2)).toBe('1.23');
  });
});
