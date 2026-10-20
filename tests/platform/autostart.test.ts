import { describe, expect, it } from 'vitest';
import { createAutostart } from '../../src/platform/autostart';
import type { AutostartFunctions } from '../../src/platform/autostart';

class FakeFunctions implements AutostartFunctions {
  enabled = false;
  enableCalls = 0;
  disableCalls = 0;
  failOn: 'enable' | 'disable' | 'isEnabled' | null = null;

  async isEnabled(): Promise<boolean> {
    if (this.failOn === 'isEnabled') {
      throw new Error('插件不可用');
    }
    return this.enabled;
  }

  async enable(): Promise<void> {
    if (this.failOn === 'enable') {
      throw new Error('系统拒绝写入自启项');
    }
    this.enabled = true;
    this.enableCalls += 1;
  }

  async disable(): Promise<void> {
    if (this.failOn === 'disable') {
      throw new Error('系统拒绝删除自启项');
    }
    this.enabled = false;
    this.disableCalls += 1;
  }
}

describe('开机自启后端', () => {
  it('读取状态与设置开关分别转发到插件函数', async () => {
    const functions = new FakeFunctions();
    const backend = createAutostart(functions, { onError: () => {} });
    expect(await backend.isEnabled()).toBe(false);
    await backend.setEnabled(true);
    expect(functions.enableCalls).toBe(1);
    expect(await backend.isEnabled()).toBe(true);
    await backend.setEnabled(false);
    expect(functions.disableCalls).toBe(1);
  });

  it('读取状态失败时按未启用处理，只记录一次错误', async () => {
    const functions = new FakeFunctions();
    functions.failOn = 'isEnabled';
    const messages: string[] = [];
    const backend = createAutostart(functions, { onError: (message) => messages.push(message) });
    await expect(backend.isEnabled()).resolves.toBe(false);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('开机自启');
  });

  it('写入自启项失败时不抛出异常，只记录错误', async () => {
    const functions = new FakeFunctions();
    functions.failOn = 'enable';
    const messages: string[] = [];
    const backend = createAutostart(functions, { onError: (message) => messages.push(message) });
    await expect(backend.setEnabled(true)).resolves.toBeUndefined();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('失败');
  });
});
