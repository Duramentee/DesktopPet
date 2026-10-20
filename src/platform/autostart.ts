/**
 * 平台适配层：开机自启。
 *
 * 自启项由官方插件读写，三个平台的落点分别是 Windows 的注册表 Run 项、
 * macOS 的 LaunchAgent 与 Linux 的桌面项文件。
 * 插件调用失败时只记录日志，不因为某个平台不支持自启而让程序无法启动。
 */

export interface Autostart {
  /** 读取系统当前是否已登记本程序的自启项。 */
  isEnabled(): Promise<boolean>;
  setEnabled(value: boolean): Promise<void>;
}

export interface AutostartOptions {
  onError?: (message: string, error: unknown) => void;
}

/** 插件暴露的原始函数。单独抽出来是为了让上层可以直接用桩对象测试。 */
export interface AutostartFunctions {
  isEnabled: () => Promise<boolean>;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

const defaultOnError = (message: string, error: unknown): void => {
  console.warn(`[autostart] ${message}`, error);
};

export function createAutostart(
  functions: AutostartFunctions,
  options: AutostartOptions = {},
): Autostart {
  const onError = options.onError ?? defaultOnError;
  return {
    async isEnabled(): Promise<boolean> {
      try {
        return await functions.isEnabled();
      } catch (error) {
        onError('读取开机自启状态失败，按未启用处理', error);
        return false;
      }
    },
    async setEnabled(value: boolean): Promise<void> {
      try {
        await (value ? functions.enable() : functions.disable());
      } catch (error) {
        onError(`把开机自启切换为${value ? '开' : '关'}失败`, error);
      }
    },
  };
}

/** 创建绑定到当前 Tauri 应用的自启后端。只能在 Tauri 环境中调用。 */
export async function createTauriAutostart(options: AutostartOptions = {}): Promise<Autostart> {
  const { isEnabled, enable, disable } = await import('@tauri-apps/plugin-autostart');
  return createAutostart({ isEnabled, enable, disable }, options);
}
