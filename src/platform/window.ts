/**
 * 平台适配层：窗口控制。
 *
 * 该层把应用层的请求翻译成 Tauri 窗口接口调用。
 * 窗口对象通过构造函数注入，因此可以在测试中用桩对象断言参数转发是否正确；
 * 真正创建 Tauri 窗口对象的工厂函数使用动态导入，测试环境不会执行它。
 *
 * 关于失败处理：窗口置顶与位置设置在 Linux 的 Wayland 会话中可能被合成器拒绝，
 * 该层把这类失败记录到日志后继续运行，绝不让拒绝导致程序崩溃。
 */

import type { WindowBackend } from '../app/controller';
import type { Point } from '../core/skin/types';

/** 对 Tauri 窗口对象的抽象，只包含本程序实际使用的方法。 */
export interface TauriWindowLike {
  setPosition(position: Point): Promise<void>;
  setSize(width: number, height: number): Promise<void>;
  setAlwaysOnTop(value: boolean): Promise<void>;
  startDragging(): Promise<void>;
  hide(): Promise<void>;
  show(): Promise<void>;
  close(): Promise<void>;
}

export interface WindowBackendOptions {
  onError?: (message: string, error: unknown) => void;
}

const defaultOnError = (message: string, error: unknown): void => {
  console.warn(`[window] ${message}`, error);
};

export class TauriWindowBackend implements WindowBackend {
  private readonly win: TauriWindowLike;
  private readonly onError: (message: string, error: unknown) => void;

  constructor(win: TauriWindowLike, options: WindowBackendOptions = {}) {
    this.win = win;
    this.onError = options.onError ?? defaultOnError;
  }

  async setTopLeft(point: Point): Promise<void> {
    try {
      await this.win.setPosition({ x: point.x, y: point.y });
    } catch (error) {
      this.onError('设置窗口位置失败，当前平台可能未采纳该请求', error);
    }
  }

  async setSize(width: number, height: number): Promise<void> {
    try {
      await this.win.setSize(width, height);
    } catch (error) {
      this.onError('设置窗口尺寸失败，当前平台可能未采纳该请求', error);
    }
  }

  async setAlwaysOnTop(value: boolean): Promise<void> {
    try {
      await this.win.setAlwaysOnTop(value);
    } catch (error) {
      this.onError('切换窗口置顶失败，当前平台可能未采纳该请求', error);
    }
  }

  /** 请求操作系统接管窗口拖动。该方式在指针移出窗口范围后仍然有效。 */
  async startDragging(): Promise<void> {
    try {
      await this.win.startDragging();
    } catch (error) {
      this.onError('启动系统级拖动失败', error);
    }
  }

  async hide(): Promise<void> {
    try {
      await this.win.hide();
    } catch (error) {
      this.onError('隐藏窗口失败', error);
    }
  }

  async show(): Promise<void> {
    try {
      await this.win.show();
    } catch (error) {
      this.onError('显示窗口失败', error);
    }
  }

  async quit(): Promise<void> {
    try {
      await this.win.close();
    } catch (error) {
      this.onError('关闭窗口失败', error);
    }
  }
}

/** 创建绑定到当前 Tauri 窗口的后端。只能在 WebView 环境中调用。 */
export async function createTauriWindowBackend(): Promise<TauriWindowBackend> {
  const { getCurrentWindow, LogicalPosition, LogicalSize } = await import('@tauri-apps/api/window');
  const current = getCurrentWindow();
  const win: TauriWindowLike = {
    setPosition: (position) => current.setPosition(new LogicalPosition(position.x, position.y)),
    setSize: (width, height) => current.setSize(new LogicalSize(width, height)),
    setAlwaysOnTop: (value) => current.setAlwaysOnTop(value),
    startDragging: () => current.startDragging(),
    hide: () => current.hide(),
    show: () => current.show(),
    close: () => current.close(),
  };
  return new TauriWindowBackend(win);
}
