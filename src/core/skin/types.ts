/**
 * 领域层共用的值对象与皮肤数据结构。
 * 本文件不依赖任何外部库，也不包含任何平台相关代码。
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 单帧的描述。durationMs 存在时优先于由帧率推算出的时长。 */
export interface FrameSpec {
  file: string;
  durationMs?: number;
}

/** 单个动画的描述。 */
export interface AnimationSpec {
  fps: number;
  loop: boolean;
  frames: FrameSpec[];
}

/** 皮肤清单文件 skin.json 的结构。 */
export interface SkinManifest {
  id: string;
  displayName: string;
  formatVersion: number;
  canvas: { width: number; height: number };
  anchor: Point;
  animations: Record<string, AnimationSpec>;
  hitbox?: Rect;
}

/** 当前加载器支持的皮肤格式版本。 */
export const SUPPORTED_FORMAT_VERSION = 1;

/** 校验通过的皮肤对象，字段已经规范化，缺少的可选字段已补上默认值。 */
export interface Skin {
  manifest: SkinManifest;
  canvas: { width: number; height: number };
  anchor: Point;
  hitbox: Rect;
  animations: Record<string, AnimationSpec>;
}

/** 校验失败时的规则编号，与需求文档第 5.3 节一一对应。 */
export type SkinIssueCode = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'S9';

/** 皮肤加载结果。失败时同时给出规则编号与可读原因。 */
export type SkinLoadResult =
  | { ok: true; skin: Skin }
  | { ok: false; code: SkinIssueCode; reason: string; detail?: string };
