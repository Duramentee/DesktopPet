/**
 * 待机小动作：呼吸与偶尔张望。
 *
 * 这两件事都不引入新美术资源，只产出给渲染层使用的位姿：
 * 呼吸是纵向缩放，张望是水平偏移。时间由外部注入，随机源也可以注入，
 * 因此整套行为可以在没有窗口的环境里精确测试。
 */

export interface IdleMotionPose {
  /** 水平偏移，单位为逻辑像素；张望时向一侧移动。 */
  offsetX: number;
  /** 垂直偏移，单位为逻辑像素。 */
  offsetY: number;
  /** 纵向缩放，呼吸时在 1 与 1 - 振幅之间起伏。 */
  scaleY: number;
}

export const NEUTRAL_POSE: IdleMotionPose = Object.freeze({
  offsetX: 0,
  offsetY: 0,
  scaleY: 1,
}) as IdleMotionPose;

export interface IdleMotionOptions {
  /** 一次完整呼吸的时长。 */
  breathPeriodMs?: number;
  /** 呼吸的纵向缩放幅度，取 0 到 0.1 之间的值比较自然。 */
  breathAmplitude?: number;
  /** 两次张望之间的随机间隔范围。 */
  glanceIntervalMs?: readonly [number, number];
  /** 张望时停在侧向的时长。 */
  glanceHoldMs?: number;
  /** 从原位移动到侧向、以及移回原位所用的时长。 */
  glanceRampMs?: number;
  /** 张望时向侧向移动的距离，单位为逻辑像素。 */
  glanceOffset?: number;
  /** 随机源，返回值落在 [0, 1)；测试可注入固定序列。 */
  random?: () => number;
}

type GlancePhase = 'rest' | 'out' | 'hold' | 'back';

const DEFAULT_INTERVAL: readonly [number, number] = [5000, 12000];

function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  // 归一化负零，避免位姿里出现 -0 影响比较与序列化
  return rounded === 0 ? 0 : rounded;
}

export class IdleMotion {
  private readonly breathPeriodMs: number;
  private readonly breathAmplitude: number;
  private readonly glanceIntervalMs: readonly [number, number];
  private readonly glanceHoldMs: number;
  private readonly glanceRampMs: number;
  private readonly glanceOffset: number;
  private readonly random: () => number;

  private elapsedMs = 0;
  private phase: GlancePhase = 'rest';
  private phaseMs = 0;
  private direction = 1;
  private nextGlanceAt = 0;
  private pose: IdleMotionPose = { ...NEUTRAL_POSE };

  constructor(options: IdleMotionOptions = {}) {
    this.breathPeriodMs = Math.max(1, options.breathPeriodMs ?? 4200);
    this.breathAmplitude = Math.min(0.1, Math.max(0, options.breathAmplitude ?? 0.02));
    const interval = options.glanceIntervalMs ?? DEFAULT_INTERVAL;
    this.glanceIntervalMs = [Math.max(0, interval[0]), Math.max(0, interval[1])];
    this.glanceHoldMs = Math.max(0, options.glanceHoldMs ?? 1100);
    this.glanceRampMs = Math.max(1, options.glanceRampMs ?? 180);
    this.glanceOffset = Math.max(0, options.glanceOffset ?? 2);
    this.random = options.random ?? Math.random;
    this.nextGlanceAt = this.sampleInterval();
  }

  /** 当前位姿，不推进时间。 */
  get current(): IdleMotionPose {
    return this.pose;
  }

  /** 回到中立位姿并重新计时，拖拽开始或小动作被关闭时调用。 */
  reset(): void {
    this.elapsedMs = 0;
    this.phase = 'rest';
    this.phaseMs = 0;
    this.nextGlanceAt = this.sampleInterval();
    this.pose = { ...NEUTRAL_POSE };
  }

  /** 推进时间并返回新的位姿。非法间隔被忽略，保持当前位姿。 */
  advance(deltaMs: number): IdleMotionPose {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return this.pose;
    }
    this.elapsedMs += deltaMs;
    const offsetX = this.advanceGlance(deltaMs);
    this.pose = { offsetX, offsetY: 0, scaleY: this.breathScale() };
    return this.pose;
  }

  /** 缩放从 1 开始向下起伏，避免放大后顶部被画布裁掉。 */
  private breathScale(): number {
    const phase = (2 * Math.PI * this.elapsedMs) / this.breathPeriodMs;
    return round3(1 - this.breathAmplitude * (0.5 - 0.5 * Math.cos(phase)));
  }

  private advanceGlance(deltaMs: number): number {
    // 用绝对时间推进，避免把全局已用时间与本次步长混在一起比较
    const end = this.elapsedMs;
    let cursor = end - deltaMs;
    let guard = 0;
    while (cursor < end && guard < 8) {
      guard += 1;
      switch (this.phase) {
        case 'rest': {
          if (this.nextGlanceAt > end) {
            cursor = end;
            break;
          }
          cursor = Math.max(cursor, this.nextGlanceAt);
          this.phase = 'out';
          this.phaseMs = 0;
          this.direction = this.random() < 0.5 ? -1 : 1;
          break;
        }
        case 'out': {
          const finishAt = cursor + (this.glanceRampMs - this.phaseMs);
          if (finishAt > end) {
            this.phaseMs += end - cursor;
            cursor = end;
            break;
          }
          this.phaseMs = 0;
          cursor = finishAt;
          this.phase = 'hold';
          break;
        }
        case 'hold': {
          const finishAt = cursor + (this.glanceHoldMs - this.phaseMs);
          if (finishAt > end) {
            this.phaseMs += end - cursor;
            cursor = end;
            break;
          }
          this.phaseMs = 0;
          cursor = finishAt;
          this.phase = 'back';
          break;
        }
        case 'back': {
          const finishAt = cursor + (this.glanceRampMs - this.phaseMs);
          if (finishAt > end) {
            this.phaseMs += end - cursor;
            cursor = end;
            break;
          }
          this.phaseMs = 0;
          cursor = finishAt;
          this.phase = 'rest';
          this.nextGlanceAt = end + this.sampleInterval();
          break;
        }
      }
    }
    return this.glanceOffsetNow();
  }

  private glanceOffsetNow(): number {
    switch (this.phase) {
      case 'out':
        return round3((this.direction * this.glanceOffset * this.phaseMs) / this.glanceRampMs);
      case 'hold':
        return this.direction * this.glanceOffset;
      case 'back':
        return round3(this.direction * this.glanceOffset * (1 - this.phaseMs / this.glanceRampMs));
      default:
        return 0;
    }
  }

  private sampleInterval(): number {
    const [min, max] = this.glanceIntervalMs;
    return min + Math.max(0, max - min) * this.random();
  }
}
