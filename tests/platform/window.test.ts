import { describe, expect, it } from 'vitest';
import { TauriWindowBackend } from '../../src/platform/window';
import type { TauriWindowLike } from '../../src/platform/window';
import type { Point } from '../../src/core/skin/types';

class FakeTauriWindow implements TauriWindowLike {
  positions: Point[] = [];
  alwaysOnTop: boolean[] = [];
  dragCalls = 0;
  hideCalls = 0;
  showCalls = 0;
  closeCalls = 0;
  failAlwaysOnTop = false;

  async setPosition(position: Point): Promise<void> {
    this.positions.push(position);
  }

  async setAlwaysOnTop(value: boolean): Promise<void> {
    if (this.failAlwaysOnTop) {
      throw new Error('当前合成器不支持窗口置顶');
    }
    this.alwaysOnTop.push(value);
  }

  async startDragging(): Promise<void> {
    this.dragCalls += 1;
  }

  async hide(): Promise<void> {
    this.hideCalls += 1;
  }

  async show(): Promise<void> {
    this.showCalls += 1;
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

describe('窗口后端', () => {
  it('把窗口左上角坐标原样转发给 Tauri 窗口对象', async () => {
    const win = new FakeTauriWindow();
    const backend = new TauriWindowBackend(win, { onError: () => {} });
    await backend.setTopLeft({ x: 468, y: 536 });
    expect(win.positions).toEqual([{ x: 468, y: 536 }]);
  });

  it('置顶状态原样转发', async () => {
    const win = new FakeTauriWindow();
    const backend = new TauriWindowBackend(win, { onError: () => {} });
    await backend.setAlwaysOnTop(false);
    await backend.setAlwaysOnTop(true);
    expect(win.alwaysOnTop).toEqual([false, true]);
  });

  it('平台拒绝置顶请求时不抛出异常，只记录一次错误', async () => {
    const win = new FakeTauriWindow();
    win.failAlwaysOnTop = true;
    const messages: string[] = [];
    const backend = new TauriWindowBackend(win, {
      onError: (message) => messages.push(message),
    });
    await expect(backend.setAlwaysOnTop(true)).resolves.toBeUndefined();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('置顶');
  });

  it('系统级拖动、隐藏、显示与关闭分别转发到对应方法', async () => {
    const win = new FakeTauriWindow();
    const backend = new TauriWindowBackend(win, { onError: () => {} });
    await backend.startDragging();
    await backend.hide();
    await backend.show();
    await backend.quit();
    expect(win.dragCalls).toBe(1);
    expect(win.hideCalls).toBe(1);
    expect(win.showCalls).toBe(1);
    expect(win.closeCalls).toBe(1);
  });
});
