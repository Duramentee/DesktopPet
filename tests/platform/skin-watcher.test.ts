import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchSkinChanges } from '../../src/platform/skins';

describe('皮肤目录监听', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('首次读取只建立基准，指纹变化时通知一次', async () => {
    let signature = 'a';
    const onChange = vi.fn();
    const stop = watchSkinChanges(onChange, {
      signature: async () => signature,
      intervalMs: 100,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).not.toHaveBeenCalled();

    signature = 'a:1:2048';
    await vi.advanceTimersByTimeAsync(100);
    expect(onChange).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenCalledTimes(1);

    signature = 'a:2:4096';
    await vi.advanceTimersByTimeAsync(100);
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
  });

  it('停止监听后不再轮询', async () => {
    const signature = vi.fn(async () => 'a');
    const stop = watchSkinChanges(() => {}, { signature, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterBaseline = signature.mock.calls.length;
    stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(signature.mock.calls.length).toBe(callsAfterBaseline);
  });

  it('读取失败时只记录错误，不中断后续轮询', async () => {
    let fail = true;
    const errors: unknown[] = [];
    const onChange = vi.fn();
    const stop = watchSkinChanges(onChange, {
      signature: async () => {
        if (fail) {
          throw new Error('目录不可读');
        }
        return 'b';
      },
      intervalMs: 100,
      onError: (error) => errors.push(error),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveLength(1);

    fail = false;
    await vi.advanceTimersByTimeAsync(100);
    // 首次成功读取只建立基准
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });
});
