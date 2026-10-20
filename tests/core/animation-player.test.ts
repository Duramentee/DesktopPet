import { describe, expect, it } from 'vitest';
import { AnimationPlayer } from '../../src/core/animation/player';
import type { AnimationSpec } from '../../src/core/skin/types';

function twoFrameSpec(fps: number, loop: boolean): AnimationSpec {
  return {
    fps,
    loop,
    frames: [{ file: 'images/a.png' }, { file: 'images/b.png' }],
  };
}

describe('动画播放器', () => {
  it('初始帧索引为零，并且当前帧是帧序列的第一帧', () => {
    const player = new AnimationPlayer(twoFrameSpec(10, true));
    expect(player.frameIndex).toBe(0);
    expect(player.frame.file).toBe('images/a.png');
  });

  // T5
  it('帧率为十时推进一百毫秒，帧索引从零变成一', () => {
    const player = new AnimationPlayer(twoFrameSpec(10, true));
    player.advance(100);
    expect(player.frameIndex).toBe(1);
  });

  it('推进时间不足一帧的时长时，帧索引保持不变', () => {
    const player = new AnimationPlayer(twoFrameSpec(10, true));
    player.advance(99);
    expect(player.frameIndex).toBe(0);
    player.advance(1);
    expect(player.frameIndex).toBe(1);
  });

  // T6
  it('循环动画的累计推进时间超过全部帧的总时长时，帧索引回到零', () => {
    const player = new AnimationPlayer(twoFrameSpec(10, true));
    player.advance(250);
    expect(player.frameIndex).toBe(0);
    expect(player.finished).toBe(false);
  });

  // T7
  it('非循环动画推进超过全部帧的总时长后，帧索引停在最后一帧', () => {
    const player = new AnimationPlayer(twoFrameSpec(10, false));
    player.advance(250);
    expect(player.frameIndex).toBe(1);
    expect(player.finished).toBe(true);
  });

  // T8
  it('帧上配置了独立持续时长时，采用该时长而不是帧率推算出的时长', () => {
    const spec: AnimationSpec = {
      fps: 10,
      loop: true,
      frames: [
        { file: 'images/a.png', durationMs: 40 },
        { file: 'images/b.png', durationMs: 200 },
      ],
    };
    const player = new AnimationPlayer(spec);
    player.advance(60);
    expect(player.frameIndex).toBe(1);
    expect(player.frame.durationMs).toBe(200);
  });

  it('单次推进跨越多帧时，帧索引按总时长正确落位', () => {
    const player = new AnimationPlayer(twoFrameSpec(10, true));
    player.advance(450);
    expect(player.frameIndex).toBe(0);
    player.advance(100);
    expect(player.frameIndex).toBe(1);
  });
});
