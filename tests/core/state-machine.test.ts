import { describe, expect, it } from 'vitest';
import { loadSkin } from '../../src/core/skin/validate';
import { clampToWorkArea } from '../../src/core/layout/clamp';
import { PetMachine } from '../../src/core/state/machine';
import type { Rect, Skin } from '../../src/core/skin/types';
import { validManifest } from '../fixtures/skin';

/**
 * 加载一份合法皮肤。夹具的画布为 64 乘 64，锚点为 (32, 64)。
 */
function loadFixtureSkin(manifest = validManifest()): Skin {
  const result = loadSkin({
    id: 'placeholder',
    manifestText: JSON.stringify(manifest),
    exists: () => true,
  });
  if (!result.ok) {
    throw new Error(`夹具皮肤加载失败：${result.reason}`);
  }
  return result.skin;
}

/**
 * 构造状态机。锚点位置取 (100, 200)，因此窗口左上角位于 (68, 136)，
 * 画布坐标与屏幕坐标之间的换算关系是 屏幕坐标 等于 画布坐标 加 (68, 136)。
 * 画布坐标 (30, 50) 对应的屏幕坐标是 (98, 186)，该点落在命中区域之内。
 */
function makeMachine(skin: Skin = loadFixtureSkin()): PetMachine {
  return new PetMachine({ skin, anchorPosition: { x: 100, y: 200 } });
}

describe('状态机', () => {
  it('初始处于待机状态，播放待机动画的第一帧', () => {
    const machine = makeMachine();
    const snapshot = machine.snapshot;
    expect(snapshot.state).toBe('idle');
    expect(snapshot.animationName).toBe('idle');
    expect(snapshot.frameIndex).toBe(0);
    expect(snapshot.anchorPosition).toEqual({ x: 100, y: 200 });
  });

  // T9
  it('在命中区域内按下鼠标时进入拖拽状态，并切换到拖拽动画的第一帧', () => {
    const machine = makeMachine();
    const snapshot = machine.dispatch({ type: 'pointerDown', point: { x: 98, y: 186 } });
    expect(snapshot.state).toBe('dragging');
    expect(snapshot.animationName).toBe('drag');
    expect(snapshot.frameIndex).toBe(0);
  });

  it('在命中区域之外按下鼠标时保持待机状态', () => {
    const machine = makeMachine();
    // 画布坐标 (70, 0) 超出宽度为 64 的画布，因此不落在命中区域内
    const snapshot = machine.dispatch({ type: 'pointerDown', point: { x: 138, y: 136 } });
    expect(snapshot.state).toBe('idle');
    expect(snapshot.animationName).toBe('idle');
  });

  // T11
  it('拖拽过程中移动鼠标时，锚点位置等于指针位置减去按下时记录的差值', () => {
    const machine = makeMachine();
    machine.dispatch({ type: 'pointerDown', point: { x: 98, y: 186 } });
    const snapshot = machine.dispatch({ type: 'pointerMove', point: { x: 300, y: 400 } });
    expect(snapshot.anchorPosition).toEqual({ x: 302, y: 414 });
  });

  // T10
  it('拖拽过程中松开鼠标时回到待机状态，动画切回待机动画的第一帧', () => {
    const machine = makeMachine();
    machine.dispatch({ type: 'pointerDown', point: { x: 98, y: 186 } });
    machine.dispatch({ type: 'tick', deltaMs: 100 });
    machine.dispatch({ type: 'pointerMove', point: { x: 300, y: 400 } });
    const snapshot = machine.dispatch({ type: 'pointerUp', point: { x: 300, y: 400 } });
    expect(snapshot.state).toBe('idle');
    expect(snapshot.animationName).toBe('idle');
    expect(snapshot.frameIndex).toBe(0);
    expect(snapshot.anchorPosition).toEqual({ x: 302, y: 414 });
  });

  it('待机状态下移动鼠标不改变锚点位置', () => {
    const machine = makeMachine();
    const snapshot = machine.dispatch({ type: 'pointerMove', point: { x: 300, y: 400 } });
    expect(snapshot.anchorPosition).toEqual({ x: 100, y: 200 });
    expect(snapshot.state).toBe('idle');
  });

  it('时间推进驱动当前动画的帧索引前进', () => {
    const machine = makeMachine();
    const snapshot = machine.dispatch({ type: 'tick', deltaMs: 100 });
    expect(snapshot.frameIndex).toBe(1);
  });

  // T17
  it('运行中切换皮肤时保持状态与动画名称，并把帧索引归零', () => {
    const machine = makeMachine();
    machine.dispatch({ type: 'tick', deltaMs: 100 });
    expect(machine.snapshot.frameIndex).toBe(1);

    const nextSkin = loadFixtureSkin(
      validManifest({
        id: 'placeholder',
        animations: {
          idle: {
            fps: 20,
            loop: true,
            frames: [
              { file: 'images/n0.png' },
              { file: 'images/n1.png' },
              { file: 'images/n2.png' },
            ],
          },
          drag: {
            fps: 20,
            loop: true,
            frames: [{ file: 'images/nd0.png' }, { file: 'images/nd1.png' }],
          },
        },
      }),
    );
    machine.switchSkin(nextSkin);

    const snapshot = machine.snapshot;
    expect(snapshot.state).toBe('idle');
    expect(snapshot.animationName).toBe('idle');
    expect(snapshot.frameIndex).toBe(0);
    expect(snapshot.frame.file).toBe('images/n0.png');
  });

  it('切换皮肤后新的帧率立即生效', () => {
    const machine = makeMachine();
    const nextSkin = loadFixtureSkin(
      validManifest({
        animations: {
          idle: {
            fps: 20,
            loop: true,
            frames: [{ file: 'images/n0.png' }, { file: 'images/n1.png' }],
          },
          drag: {
            fps: 20,
            loop: true,
            frames: [{ file: 'images/nd0.png' }],
          },
        },
      }),
    );
    machine.switchSkin(nextSkin);
    machine.dispatch({ type: 'tick', deltaMs: 50 });
    expect(machine.snapshot.frameIndex).toBe(1);
  });

  it('位置约束器参与位移计算时，移动结果被夹紧', () => {
    const machine = new PetMachine({
      skin: loadFixtureSkin(),
      anchorPosition: { x: 100, y: 200 },
      clampPosition: () => ({ x: 10, y: 20 }),
    });
    machine.dispatch({ type: 'pointerDown', point: { x: 98, y: 186 } });
    const snapshot = machine.dispatch({ type: 'pointerMove', point: { x: 900, y: 900 } });
    expect(snapshot.anchorPosition).toEqual({ x: 10, y: 20 });
  });

  it('显示器变小后重新夹紧，把越界的锚点拉回工作区内', () => {
    let areas: Rect[] = [{ x: 0, y: 0, width: 1920, height: 1080 }];
    const machine = new PetMachine({
      skin: loadFixtureSkin(),
      anchorPosition: { x: 500, y: 600 },
      clampPosition: (point) => clampToWorkArea(point, areas),
    });
    areas = [{ x: 0, y: 0, width: 320, height: 240 }];
    expect(machine.reclamp().anchorPosition).toEqual({ x: 320, y: 240 });
  });

  it('位置仍在工作区内时重新夹紧不改变锚点', () => {
    const machine = new PetMachine({
      skin: loadFixtureSkin(),
      anchorPosition: { x: 500, y: 600 },
      clampPosition: (point) => clampToWorkArea(point, [{ x: 0, y: 0, width: 1920, height: 1080 }]),
    });
    expect(machine.reclamp().anchorPosition).toEqual({ x: 500, y: 600 });
  });

  it('直接放置锚点时不受拖拽状态限制，并且同样经过夹紧', () => {
    const machine = new PetMachine({
      skin: loadFixtureSkin(),
      anchorPosition: { x: 100, y: 200 },
      clampPosition: (point) => ({ x: Math.min(point.x, 50), y: Math.min(point.y, 60) }),
    });
    const snapshot = machine.place({ x: 900, y: 900 });
    expect(snapshot.anchorPosition).toEqual({ x: 50, y: 60 });
    expect(snapshot.state).toBe('idle');
    expect(snapshot.animationName).toBe('idle');
  });
});
