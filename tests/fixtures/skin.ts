import type { SkinManifest } from '../../src/core/skin/types';

/**
 * 构造一份通过全部校验规则的最小皮肤清单。
 * 调用方通过传入 overrides 覆盖顶层字段，用来构造各种非法清单。
 */
export function validManifest(overrides: Partial<SkinManifest> = {}): SkinManifest {
  return {
    id: 'placeholder',
    displayName: '占位皮肤',
    formatVersion: 1,
    canvas: { width: 64, height: 64 },
    anchor: { x: 32, y: 64 },
    animations: {
      idle: {
        fps: 10,
        loop: true,
        frames: [{ file: 'images/idle_0.png' }, { file: 'images/idle_1.png' }],
      },
      drag: {
        fps: 10,
        loop: true,
        frames: [{ file: 'images/drag_0.png' }, { file: 'images/drag_1.png' }],
      },
    },
    ...overrides,
  };
}

/** 清单中引用到的全部帧文件，用于构造 exists 桩函数。 */
export function frameFilesOf(manifest: SkinManifest): string[] {
  const files: string[] = [];
  for (const animation of Object.values(manifest.animations)) {
    for (const frame of animation.frames) {
      files.push(frame.file);
    }
  }
  return files;
}

/** 复制一份清单并删除指定的动画，用于构造缺少必要动画的清单。 */
export function withoutAnimation(manifest: SkinManifest, name: string): SkinManifest {
  const animations = { ...manifest.animations };
  delete animations[name];
  return { ...manifest, animations };
}

/** 复制一份清单并把指定动画的帧率改成给定取值。 */
export function withFps(manifest: SkinManifest, name: string, fps: number): SkinManifest {
  const animation = manifest.animations[name];
  if (animation === undefined) {
    throw new Error(`测试数据错误：动画 ${name} 不存在`);
  }
  return {
    ...manifest,
    animations: { ...manifest.animations, [name]: { ...animation, fps } },
  };
}
