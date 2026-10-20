/**
 * 平台适配层：日志。
 *
 * 图形程序没有控制台，页面的警告与未捕获异常必须落到应用日志目录，
 * 否则用户反馈“闪一下就没了”时没有任何线索。写入按行缓冲后批量提交，
 * 单条错误立即提交，避免崩溃时丢掉最关键的那一行。
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
  /** 把缓冲区里的日志立即提交。 */
  flush(): Promise<void>;
}

export interface LoggerOptions {
  /** 真正落盘的实现，通常是后端命令。 */
  write: (level: LogLevel, message: string) => Promise<void> | void;
  /** 同时输出到控制台，便于开发时观察；默认使用全局 console。 */
  console?: Pick<Console, 'info' | 'warn' | 'error'>;
  /** 缓冲多少行之后立即提交。 */
  flushThreshold?: number;
  /** 定时提交的间隔，单位为毫秒；省略则只在错误与达到阈值时提交。 */
  flushIntervalMs?: number;
}

interface PendingLine {
  level: LogLevel;
  message: string;
}

/** 把任意值转成适合写进日志的一行文本。 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    const text = JSON.stringify(error);
    return text === undefined ? String(error) : text;
  } catch {
    return String(error);
  }
}

export function createLogger(options: LoggerOptions): Logger {
  const flushThreshold = options.flushThreshold ?? 20;
  const output = options.console ?? console;
  const buffer: PendingLine[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  const stopTimer = (): void => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const submit = async (): Promise<void> => {
    while (buffer.length > 0) {
      const entry = buffer.shift();
      if (entry === undefined) {
        break;
      }
      try {
        await options.write(entry.level, entry.message);
      } catch {
        // 日志写不进去时不能反过来影响程序运行
      }
    }
    stopTimer();
  };

  const push = (level: LogLevel, message: string): void => {
    // 缓冲区有上限：异常风暴时新的行会被丢弃，避免内存无限增长
    if (buffer.length < 200) {
      buffer.push({ level, message });
    }
    if (timer === undefined && options.flushIntervalMs !== undefined) {
      timer = setInterval(() => {
        void submit();
      }, options.flushIntervalMs);
    }
    if (level === 'error' || buffer.length >= flushThreshold) {
      void submit();
    }
  };

  return {
    info: (message) => {
      output.info(message);
      push('info', message);
    },
    warn: (message) => {
      output.warn(message);
      push('warn', message);
    },
    error: (message, error) => {
      const text = error === undefined ? message : `${message} :: ${describeError(error)}`;
      output.error(text);
      push('error', text);
    },
    flush: submit,
  };
}

/** 创建绑定到后端的日志器。只能在 Tauri 环境中调用。 */
export async function createTauriLogger(): Promise<Logger> {
  const { invoke } = await import('@tauri-apps/api/core');
  return createLogger({
    write: (level, message) => invoke('append_log', { level, message }),
    flushIntervalMs: 2000,
  });
}

/** 把未捕获异常与未处理的 Promise 拒绝接到日志器上。 */
export function installErrorReporting(
  logger: Logger,
  target: Pick<Window, 'addEventListener'> = window,
): void {
  target.addEventListener('error', (event) => {
    const detail = event instanceof ErrorEvent ? (event.error ?? event.message) : event;
    logger.error('未捕获的脚本错误', detail);
  });
  target.addEventListener('unhandledrejection', (event) => {
    logger.error('未处理的 Promise 拒绝', (event as PromiseRejectionEvent).reason);
  });
}

/** 在系统文件管理器中打开日志目录。 */
export async function openLogFolder(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_log_dir');
}
