/**
 * 渲染节流。
 *
 * 浏览器的 requestAnimationFrame 在部分平台上会跑到远高于屏幕刷新率的频率
 * （本机 WebView2 实测约两百次每秒），而宠物的动画只有个位数帧率、
 * 待机小动作也只要求每秒三十帧左右，逐次回调全部重绘纯属浪费。
 *
 * 这里把绘制频率压到目标帧率：未到点的回调直接跳过，被跳过的时间会累加进
 * 下一次推进，动画的时间轴因此不会走偏。纯计算，时间由调用方注入。
 */

/** 目标帧率的合理范围，超出范围说明调用方写错了常量。 */
const MIN_TARGET_FPS = 1;
const MAX_TARGET_FPS = 240;

export class FramePacer {
  /** 目标帧率，每秒最多绘制这么多次。 */
  readonly targetFps: number;
  /** 两次绘制之间的最小间隔，单位为毫秒。 */
  readonly intervalMs: number;
  private sinceEmitMs = 0;

  constructor(targetFps = 30) {
    if (!Number.isFinite(targetFps) || targetFps < MIN_TARGET_FPS || targetFps > MAX_TARGET_FPS) {
      throw new Error(`目标帧率必须是 ${MIN_TARGET_FPS} 到 ${MAX_TARGET_FPS} 之间的有限数`);
    }
    this.targetFps = targetFps;
    this.intervalMs = 1000 / targetFps;
  }

  /**
   * 报告一次回调的间隔时间。到点则返回应当推进给动画的时间（等于上次绘制以来
   * 累积的全部时间），未到点返回 null，此时调用方应当跳过这一帧。
   * 非有限值与非正数会被忽略，避免首帧或时钟回拨污染计时。
   */
  due(deltaMs: number): number | null {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return null;
    }
    this.sinceEmitMs += deltaMs;
    if (this.sinceEmitMs < this.intervalMs) {
      return null;
    }
    const step = this.sinceEmitMs;
    this.sinceEmitMs = 0;
    return step;
  }
}
