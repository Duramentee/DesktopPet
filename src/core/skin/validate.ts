/**
 * 皮肤清单校验器。
 * 校验所需的文件存在性判断由调用方通过 SkinSource 注入，
 * 因此测试可以在不访问真实文件系统的情况下覆盖全部校验规则。
 */

import type {
  AnimationSpec,
  FrameSpec,
  Rect,
  Skin,
  SkinIssueCode,
  SkinLoadResult,
  SkinManifest,
} from './types';
import { SUPPORTED_FORMAT_VERSION } from './types';

export interface SkinSource {
  /** 皮肤目录名，必须与清单中的 id 一致。 */
  id: string;
  /** 清单文件的原始文本，null 表示文件不存在。 */
  manifestText: string | null;
  /** 判断相对皮肤目录的路径是否存在。 */
  exists: (relativePath: string) => boolean;
}

const MAX_FPS = 60;

function fail(code: SkinIssueCode, reason: string, detail?: string): SkinLoadResult {
  return detail === undefined ? { ok: false, code, reason } : { ok: false, code, reason, detail };
}

export function loadSkin(source: SkinSource): SkinLoadResult {
  // S1 清单文件存在并且可以被解析为对象
  if (source.manifestText === null) {
    return fail('S1', '皮肤清单文件不存在', `${source.id}/skin.json`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.manifestText);
  } catch {
    return fail('S1', '皮肤清单文件格式非法，无法解析为 JSON', `${source.id}/skin.json`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return fail('S1', '皮肤清单文件的顶层内容必须是对象', `${source.id}/skin.json`);
  }
  const manifest = parsed as Partial<SkinManifest>;

  // S2 格式版本
  if (manifest.formatVersion !== SUPPORTED_FORMAT_VERSION) {
    return fail(
      'S2',
      `皮肤格式版本不受支持，当前支持版本为 ${SUPPORTED_FORMAT_VERSION}，清单中为 ${String(manifest.formatVersion)}`,
    );
  }

  // S3 标识与目录名一致
  if (typeof manifest.id !== 'string' || manifest.id !== source.id) {
    return fail(
      'S3',
      `皮肤标识与目录名不一致，清单中的标识为 ${String(manifest.id)}，目录名为 ${source.id}`,
    );
  }

  // S9 画布尺寸与命中区域尺寸合法
  const canvas = manifest.canvas;
  if (
    typeof canvas !== 'object' ||
    canvas === null ||
    !isPositiveInteger(canvas.width) ||
    !isPositiveInteger(canvas.height)
  ) {
    return fail('S9', '画布尺寸必须都是大于零的整数');
  }

  // S4 必要动画存在
  const animations = manifest.animations;
  if (typeof animations !== 'object' || animations === null || Array.isArray(animations)) {
    return fail('S4', '皮肤缺少必要的待机动画或拖拽动画：animations 字段缺失或类型非法');
  }
  const missing: string[] = [];
  if (!hasAnimation(animations, 'idle')) {
    missing.push('待机动画 idle');
  }
  if (!hasAnimation(animations, 'drag')) {
    missing.push('拖拽动画 drag');
  }
  if (missing.length > 0) {
    return fail('S4', `皮肤缺少必要的动画：${missing.join('、')}`);
  }

  // S5 帧率、S6 帧序列非空、S7 帧文件存在
  const normalizedAnimations: Record<string, AnimationSpec> = {};
  for (const name of Object.keys(animations)) {
    const raw = animations[name] as Partial<AnimationSpec> | undefined;
    if (raw === undefined || typeof raw !== 'object' || raw === null) {
      return fail('S6', `动画 ${name} 的描述必须是对象`);
    }
    const fps = raw.fps;
    if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0 || fps > MAX_FPS) {
      return fail('S5', `动画 ${name} 的帧率必须大于零并且不超过六十，当前取值为 ${String(fps)}`);
    }
    const frames = raw.frames;
    if (!Array.isArray(frames) || frames.length === 0) {
      return fail('S6', `动画 ${name} 的帧序列为空`);
    }
    const normalizedFrames: FrameSpec[] = [];
    for (const frame of frames) {
      if (typeof frame !== 'object' || frame === null) {
        return fail('S7', `动画 ${name} 中存在格式非法的帧描述`);
      }
      const file = (frame as Partial<FrameSpec>).file;
      if (typeof file !== 'string' || file.length === 0) {
        return fail('S7', `动画 ${name} 中存在缺少文件路径的帧描述`);
      }
      if (file.includes('../')) {
        return fail('S7', `帧文件路径不得包含上两级目录符号：${file}`, file);
      }
      if (!source.exists(file)) {
        return fail('S7', `帧文件缺失：${file}`, file);
      }
      const durationMs = (frame as Partial<FrameSpec>).durationMs;
      if (durationMs !== undefined) {
        if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
          return fail('S9', `动画 ${name} 中帧文件 ${file} 的独立持续时长必须大于零`);
        }
        normalizedFrames.push({ file, durationMs });
      } else {
        normalizedFrames.push({ file });
      }
    }
    normalizedAnimations[name] = {
      fps,
      loop: raw.loop === true,
      frames: normalizedFrames,
    };
  }

  // S8 锚点坐标落在画布范围之内
  const anchor = manifest.anchor;
  if (
    typeof anchor !== 'object' ||
    anchor === null ||
    !Number.isFinite(anchor.x) ||
    !Number.isFinite(anchor.y) ||
    anchor.x < 0 ||
    anchor.x > canvas.width ||
    anchor.y < 0 ||
    anchor.y > canvas.height
  ) {
    return fail(
      'S8',
      `锚点坐标超出画布范围，画布为 ${canvas.width} 乘 ${canvas.height}，锚点为 ${JSON.stringify(anchor)}`,
    );
  }

  // 命中区域缺省为整个画布
  let hitbox: Rect = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (manifest.hitbox !== undefined) {
    const raw = manifest.hitbox;
    if (
      typeof raw !== 'object' ||
      raw === null ||
      !Number.isFinite(raw.x) ||
      !Number.isFinite(raw.y) ||
      !isPositiveNumber(raw.width) ||
      !isPositiveNumber(raw.height)
    ) {
      return fail('S9', '命中区域必须包含有限的 x 与 y 坐标，以及大于零的宽与高');
    }
    hitbox = { x: raw.x, y: raw.y, width: raw.width, height: raw.height };
  }

  const skin: Skin = {
    manifest: {
      id: manifest.id,
      displayName: typeof manifest.displayName === 'string' ? manifest.displayName : manifest.id,
      formatVersion: SUPPORTED_FORMAT_VERSION,
      canvas: { width: canvas.width, height: canvas.height },
      anchor: { x: anchor.x, y: anchor.y },
      animations: normalizedAnimations,
      hitbox,
    },
    canvas: { width: canvas.width, height: canvas.height },
    anchor: { x: anchor.x, y: anchor.y },
    hitbox,
    animations: normalizedAnimations,
  };
  return { ok: true, skin };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasAnimation(animations: Record<string, AnimationSpec>, name: string): boolean {
  const value = animations[name];
  return typeof value === 'object' && value !== null;
}
