/**
 * 帧率统计。
 *
 * 只做纯计算，时间与窗口长度都由外部注入，因此可以在没有渲染环境的测试里验证。
 * 统计按固定窗口滚动，避免单帧抖动被立即放大成日志噪音。
 */

export interface FpsReport {
  /** 窗口内的平均帧率，保留一位小数。 */
  fps: number;
  /** 窗口内统计到的帧数。 */
  frames: number;
  /** 窗口内最长的一帧耗时，用于发现卡顿。 */
  longestFrameMs: number;
}

export class FpsMeter {
  private frames = 0;
  private elapsedMs = 0;
  private longestMs = 0;

  constructor(private readonly windowMs = 5000) {}

  /**
   * 记录一帧。返回值只在窗口攒满时给出，其余时候为 null。
   * 非有限值与非正数的间隔会被忽略，避免首帧或时钟回拨污染统计。
   */
  sample(deltaMs: number): FpsReport | null {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return null;
    }
    this.frames += 1;
    this.elapsedMs += deltaMs;
    this.longestMs = Math.max(this.longestMs, deltaMs);
    if (this.elapsedMs < this.windowMs) {
      return null;
    }
    const report: FpsReport = {
      fps: Math.round((this.frames * 1000 * 10) / this.elapsedMs) / 10,
      frames: this.frames,
      longestFrameMs: Math.round(this.longestMs),
    };
    this.frames = 0;
    this.elapsedMs = 0;
    this.longestMs = 0;
    return report;
  }
}
