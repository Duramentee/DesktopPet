import { describe, expect, it, vi } from 'vitest';
import { createLogger, describeError } from '../../src/platform/logger';
import type { LogLevel } from '../../src/platform/logger';

interface Written {
  level: LogLevel;
  message: string;
}

function recordingLogger(): { written: Written[]; write: (level: LogLevel, message: string) => void } {
  const written: Written[] = [];
  return {
    written,
    write: (level, message) => {
      written.push({ level, message });
    },
  };
}

const silentConsole = { info: () => {}, warn: () => {}, error: () => {} };

describe('日志器', () => {
  it('达到阈值时批量提交，级别与内容原样保留', async () => {
    const sink = recordingLogger();
    const logger = createLogger({ write: sink.write, console: silentConsole, flushThreshold: 2 });

    logger.info('第一条');
    expect(sink.written).toHaveLength(0);
    logger.warn('第二条');
    await Promise.resolve();

    expect(sink.written).toHaveLength(2);
    expect(sink.written[0]?.level).toBe('info');
    expect(sink.written[0]?.message).toContain('第一条');
    expect(sink.written[1]?.level).toBe('warn');
  });

  it('错误级别的日志立即提交，并带上异常堆栈', async () => {
    const sink = recordingLogger();
    const logger = createLogger({ write: sink.write, console: silentConsole, flushThreshold: 100 });

    logger.error('启动失败', new Error('画布缺失'));
    await Promise.resolve();

    expect(sink.written).toHaveLength(1);
    expect(sink.written[0]?.level).toBe('error');
    expect(sink.written[0]?.message).toContain('启动失败');
    expect(sink.written[0]?.message).toContain('画布缺失');
  });

  it('落盘实现抛错时不影响后续写入', async () => {
    const written: Written[] = [];
    let failed = false;
    const logger = createLogger({
      write: (level, message) => {
        if (!failed) {
          failed = true;
          throw new Error('磁盘不可写');
        }
        written.push({ level, message });
      },
      console: silentConsole,
      flushThreshold: 1,
    });

    logger.info('第一条');
    logger.info('第二条');
    await Promise.resolve();
    await Promise.resolve();

    expect(failed).toBe(true);
    expect(written).toHaveLength(1);
    expect(written[0]?.message).toContain('第二条');
  });

  it('按固定间隔自动提交缓冲区', async () => {
    vi.useFakeTimers();
    try {
      const sink = recordingLogger();
      const logger = createLogger({
        write: sink.write,
        console: silentConsole,
        flushThreshold: 100,
        flushIntervalMs: 1000,
      });

      logger.info('定时提交');
      expect(sink.written).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(sink.written).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('describeError 覆盖错误对象、字符串与普通对象', () => {
    expect(describeError(new Error('坏掉了'))).toContain('坏掉了');
    expect(describeError('直接文本')).toBe('直接文本');
    expect(describeError({ code: 7 })).toBe('{"code":7}');
  });
});

describe('日志内容', () => {
  it('落盘时只传原始文本与级别，时间戳由落盘端补', async () => {
    const sink = recordingLogger();
    const logger = createLogger({ write: sink.write, console: silentConsole, flushThreshold: 1 });
    logger.info('检查内容');
    await Promise.resolve();
    expect(sink.written[0]).toEqual({ level: 'info', message: '检查内容' });
  });
});
