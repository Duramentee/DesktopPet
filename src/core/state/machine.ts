/**
 * 宠物状态机。
 * 状态机只依赖领域层内部模块，时间由 tick 事件注入，位置换算与位置约束
 * 都通过纯函数完成，因此可以在没有窗口的环境下被完整测试。
 */

import { AnimationPlayer } from '../animation/player';
import { anchorToWindowTopLeft } from '../layout/anchor';
import type { AnimationSpec, FrameSpec, Point, Skin } from '../skin/types';

export type PetState = 'idle' | 'dragging';

export const IDLE_ANIMATION = 'idle';
export const DRAG_ANIMATION = 'drag';

export type PetEvent =
  | { type: 'pointerDown'; point: Point }
  | { type: 'pointerMove'; point: Point }
  | { type: 'pointerUp'; point: Point }
  | { type: 'tick'; deltaMs: number };

export interface PetSnapshot {
  state: PetState;
  animationName: string;
  frameIndex: number;
  frame: FrameSpec;
  anchorPosition: Point;
}

export interface PetMachineOptions {
  skin: Skin;
  anchorPosition: Point;
  /** 可选的坐标夹紧函数，通常传入 clampToWorkArea 的偏应用版本。 */
  clampPosition?: (point: Point) => Point;
  /** 可选的播放器工厂，测试可以借此注入可观察的桩对象。 */
  createPlayer?: (spec: AnimationSpec) => AnimationPlayer;
}

export class PetMachine {
  private skin: Skin;
  private state: PetState = 'idle';
  private animationName: string = IDLE_ANIMATION;
  private anchorPosition: Point;
  private grabOffset: Point = { x: 0, y: 0 };
  private players = new Map<string, AnimationPlayer>();
  private readonly clampPosition: (point: Point) => Point;
  private readonly createPlayer: (spec: AnimationSpec) => AnimationPlayer;

  constructor(options: PetMachineOptions) {
    this.skin = options.skin;
    this.anchorPosition = { ...options.anchorPosition };
    this.clampPosition = options.clampPosition ?? ((point) => point);
    this.createPlayer = options.createPlayer ?? ((spec) => new AnimationPlayer(spec));
    this.buildPlayers();
  }

  get snapshot(): PetSnapshot {
    const player = this.currentPlayer();
    return {
      state: this.state,
      animationName: this.animationName,
      frameIndex: player.frameIndex,
      frame: player.frame,
      anchorPosition: { ...this.anchorPosition },
    };
  }

  dispatch(event: PetEvent): PetSnapshot {
    switch (event.type) {
      case 'pointerDown':
        this.handlePointerDown(event.point);
        break;
      case 'pointerMove':
        this.handlePointerMove(event.point);
        break;
      case 'pointerUp':
        this.handlePointerUp();
        break;
      case 'tick':
        this.currentPlayer().advance(event.deltaMs);
        break;
    }
    return this.snapshot;
  }

  /** 切换皮肤。状态与当前动画名称保持不变，帧索引归零。 */
  switchSkin(skin: Skin): void {
    this.skin = skin;
    this.buildPlayers();
    this.applyAnimation(this.animationName);
  }

  private handlePointerDown(point: Point): void {
    if (!this.isInsideHitbox(point)) {
      return;
    }
    this.state = 'dragging';
    this.grabOffset = {
      x: point.x - this.anchorPosition.x,
      y: point.y - this.anchorPosition.y,
    };
    this.applyAnimation(DRAG_ANIMATION);
  }

  private handlePointerMove(point: Point): void {
    if (this.state !== 'dragging') {
      return;
    }
    const candidate: Point = {
      x: point.x - this.grabOffset.x,
      y: point.y - this.grabOffset.y,
    };
    this.anchorPosition = this.clampPosition(candidate);
  }

  /**
   * 直接把锚点移动到给定位置。该入口供操作系统完成窗口拖动之后回写坐标使用。
   * 只有处于拖拽状态时才生效，并且坐标同样经过位置约束器夹紧。
   */
  moveTo(anchorPoint: Point): PetSnapshot {
    if (this.state === 'dragging') {
      this.anchorPosition = this.clampPosition(anchorPoint);
    }
    return this.snapshot;
  }

  /**
   * 用当前的约束重新摆放锚点。显示器布局发生变化时调用，
   * 让宠物回到仍然存在的工作区内；无论处于待机还是拖拽中都会生效。
   */
  reclamp(): PetSnapshot {
    this.anchorPosition = this.clampPosition(this.anchorPosition);
    return this.snapshot;
  }

  private handlePointerUp(): void {
    if (this.state !== 'dragging') {
      return;
    }
    this.state = 'idle';
    this.applyAnimation(IDLE_ANIMATION);
  }

  /**
   * 把指针的屏幕坐标换算到画布坐标，再判断是否落在命中区域内。
   */
  private isInsideHitbox(point: Point): boolean {
    const topLeft = anchorToWindowTopLeft(this.anchorPosition, this.skin.anchor);
    const canvasPoint = { x: point.x - topLeft.x, y: point.y - topLeft.y };
    const hitbox = this.skin.hitbox;
    return (
      canvasPoint.x >= hitbox.x &&
      canvasPoint.x <= hitbox.x + hitbox.width &&
      canvasPoint.y >= hitbox.y &&
      canvasPoint.y <= hitbox.y + hitbox.height
    );
  }

  private buildPlayers(): void {
    this.players = new Map();
    for (const [name, spec] of Object.entries(this.skin.animations)) {
      this.players.set(name, this.createPlayer(spec));
    }
  }

  /** 切换当前动画并重建该动画的播放器，使帧索引归零。 */
  private applyAnimation(name: string): void {
    this.animationName = name;
    const spec = this.skin.animations[name];
    if (spec === undefined) {
      throw new Error(`皮肤中不存在动画 ${name}，调用方应当先经过皮肤校验`);
    }
    this.players.set(name, this.createPlayer(spec));
  }

  private currentPlayer(): AnimationPlayer {
    const player = this.players.get(this.animationName);
    if (player === undefined) {
      throw new Error(`动画 ${this.animationName} 的播放器不存在，这表示状态机内部状态已损坏`);
    }
    return player;
  }
}
