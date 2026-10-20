import { describe, expect, it } from 'vitest';
import { formatMegabytes } from '../../src/platform/diagnostics';

describe('诊断读数格式化', () => {
  it('把字节数换算成保留一位小数的兆字节', () => {
    expect(formatMegabytes(28 * 1024 * 1024)).toBe('28 MB');
    expect(formatMegabytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatMegabytes(1024)).toBe('0 MB');
  });

  it('读数缺失或非法时给出可读的占位文本', () => {
    expect(formatMegabytes(null)).toBe('内存未知');
    expect(formatMegabytes(Number.NaN)).toBe('内存未知');
    expect(formatMegabytes(-1)).toBe('内存未知');
  });
});
