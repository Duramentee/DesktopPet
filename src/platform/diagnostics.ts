/**
 * 平台适配层：运行诊断。
 *
 * 提供常驻内存读数与托盘提示文字更新。两者都属于“有则更好”的能力，
 * 平台不支持时静默降级，不影响宠物本身的运行。
 */

/** 读取当前进程的常驻内存字节数，平台不支持时返回 null。 */
export async function readMemoryUsage(): Promise<number | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const value = await invoke<number | null>('memory_usage');
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** 更新托盘图标的提示文字，鼠标悬停时可见。失败时忽略。 */
export async function setTrayTooltip(text: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_tray_tooltip', { text });
  } catch {
    // 托盘不可用时只影响提示文字
  }
}

/** 把字节数格式化成便于阅读的兆字节文本。 */
export function formatMegabytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) {
    return '内存未知';
  }
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}
