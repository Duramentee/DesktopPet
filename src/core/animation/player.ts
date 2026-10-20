/**
 * 动画播放器。
 * 播放器不读取系统时钟，也不创建定时器，时间完全由调用方通过 advance 注入，
 * 因此可以在测试中用虚拟时间精确断言帧的推进结果。
 */

import type { AnimationSpec, FrameSpec } from '../skin/types';

const MIN_FRAME_DURATION_MS = 1;
const FALLBACK_FRAME_DURATION_MS = 100;

export class AnimationPlayer {
  private readonly spec: AnimationSpec;
  private readonly durations: number[];
  private index = 0;
  private elapsedInFrame = 0;
  private finishedFlag = false;

  constructor(spec: AnimationSpec) {
    if (spec.frames.length === 0) {
      throw new Error('动画播放器不能接受空帧序列，调用方应当先经过皮肤校验');
    }
    this.spec = spec;
    this.durations = spec.frames.map((frame) => frameDurationOf(frame, spec.fps));
  }

  /** 当前帧的索引。 */
  get frameIndex(): number {
    return this.index;
  }

  /** 当前帧的描述。 */
  get frame(): FrameSpec {
    const frame = this.spec.frames[this.index];
    if (frame === undefined) {
      throw new Error('帧索引越界，这表示播放器内部状态已损坏');
    }
    return frame;
  }

  /** 非循环动画是否已经播放完毕。循环动画始终返回 false。 */
  get finished(): boolean {
    return this.finishedFlag;
  }

  /** 当前帧已经持续的时间。 */
  get elapsedMs(): number {
    return this.elapsedInFrame;
  }

  /** 推进虚拟时间。deltaMs 必须是非负数。 */
  advance(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return;
    }
    if (this.finishedFlag) {
      return;
    }
    this.elapsedInFrame += deltaMs;
    let guard = 0;
    let duration = this.durationAt(this.index);
    while (this.elapsedInFrame >= duration) {
      this.elapsedInFrame -= duration;
      if (this.index < this.durations.length - 1) {
        this.index += 1;
      } else if (this.spec.loop) {
        this.index = 0;
      } else {
        this.elapsedInFrame = 0;
        this.finishedFlag = true;
        return;
      }
      duration = this.durationAt(this.index);
      guard += 1;
      if (guard > 100000) {
        throw new Error('动画推进出现异常循环，请检查帧时长是否为正数');
      }
    }
  }

  /** 回到第一帧并清除播放完毕标记。 */
  reset(): void {
    this.index = 0;
    this.elapsedInFrame = 0;
    this.finishedFlag = false;
  }

  private durationAt(index: number): number {
    const duration = this.durations[index];
    if (duration === undefined) {
      throw new Error('帧时长索引越界，这表示播放器内部状态已损坏');
    }
    return duration;
  }
}

function frameDurationOf(frame: FrameSpec, fps: number): number {
  if (typeof frame.durationMs === 'number' && Number.isFinite(frame.durationMs) && frame.durationMs > 0) {
    return frame.durationMs;
  }
  if (Number.isFinite(fps) && fps > 0) {
    return Math.max(MIN_FRAME_DURATION_MS, 1000 / fps);
  }
  return FALLBACK_FRAME_DURATION_MS;
}
