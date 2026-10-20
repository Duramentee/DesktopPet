/**
 * 渲染层。渲染器只接收应用层给出的帧描述，把对应的帧图片绘制到画布上，
 * 不参与状态计算，因此可以独立替换实现。
 *
 * 画布的后备存储按设备像素分配，CSS 尺寸固定为皮肤画布的逻辑尺寸，
 * 因此在一百五十或二百的缩放比例下宠物依旧清晰，视觉尺寸也不变。
 */

import type { RenderFrame, Renderer } from '../app/controller';
import type { Point, Skin } from '../core/skin/types';
import { backingStoreSize, resolveScale } from './dpi';

export class CanvasRenderer implements Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly masks = new Map<string, Uint8ClampedArray>();
  private baseUrl = '';
  private logical = { width: 0, height: 0 };
  private scale = 1;
  /** 每次准备皮肤递增，用作图片地址的版本号，避免网页复用上一次的解码结果。 */
  private generation = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * 设置画布尺寸并预载全部帧图片。
   * 预载完成之前不绘制，因此宠物出现时不会出现空白帧。
   */
  async prepareSkin(skin: Skin, baseUrl: string): Promise<void> {
    this.baseUrl = baseUrl;
    this.generation += 1;
    this.logical = { width: skin.canvas.width, height: skin.canvas.height };
    this.scale = resolveScale(currentDevicePixelRatio());
    this.applyBackingStore();
    const files = new Set<string>();
    for (const animation of Object.values(skin.animations)) {
      for (const frame of animation.frames) {
        files.add(frame.file);
      }
    }
    this.images.clear();
    this.masks.clear();
    await Promise.all([...files].map((file) => this.loadImage(file)));
  }

  /** 设备像素比变化时重建后备存储，像素尺寸随缩放比例变化，CSS 尺寸不变。 */
  setScale(scale: number): void {
    this.scale = resolveScale(scale);
    this.applyBackingStore();
  }

  draw(frame: RenderFrame): void {
    const context = this.canvas.getContext('2d');
    if (context === null) {
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const image = this.images.get(frame.frameFile);
    if (image === undefined) {
      return;
    }
    const { width, height } = this.logical;
    const motion = frame.motion;
    context.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    // 以底边中点为基准：呼吸时脚底位置不变，张望时整只宠物平移
    context.translate(width / 2 + motion.offsetX, height + motion.offsetY);
    context.scale(1, motion.scaleY);
    context.drawImage(image, -width / 2, -height, width, height);
  }

  private applyBackingStore(): void {
    if (this.logical.width <= 0 || this.logical.height <= 0) {
      return;
    }
    const size = backingStoreSize(this.logical, this.scale);
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    this.canvas.style.width = `${this.logical.width}px`;
    this.canvas.style.height = `${this.logical.height}px`;
    const context = this.canvas.getContext('2d');
    if (context !== null) {
      context.imageSmoothingEnabled = true;
    }
  }

  /**
   * 画布坐标处是否落在该帧不透明的像素上，用于决定窗口要不要拦截鼠标。
   * 掩码读取失败时按不透明处理，宁可让宠物可点，也不要让它变成点不到的装饰。
   */
  isOpaqueAt(frameFile: string, point: Point): boolean {
    const mask = this.maskOf(frameFile);
    if (mask === null) {
      return true;
    }
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (x < 0 || y < 0 || x >= this.logical.width || y >= this.logical.height) {
      return false;
    }
    return (mask[y * this.logical.width + x] ?? 0) > 8;
  }

  private maskOf(frameFile: string): Uint8ClampedArray | null {
    const cached = this.masks.get(frameFile);
    if (cached !== undefined) {
      return cached;
    }
    const image = this.images.get(frameFile);
    if (image === undefined || this.logical.width <= 0 || this.logical.height <= 0) {
      return null;
    }
    const width = this.logical.width;
    const height = this.logical.height;
    const scratch = document.createElement('canvas');
    scratch.width = width;
    scratch.height = height;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      return null;
    }
    context.drawImage(image, 0, 0, width, height);
    let pixels: Uint8ClampedArray;
    try {
      pixels = context.getImageData(0, 0, width, height).data;
    } catch (error) {
      console.warn('[renderer] 无法读取帧的透明度掩码', error);
      return null;
    }
    const mask = new Uint8ClampedArray(width * height);
    for (let index = 0; index < mask.length; index += 1) {
      mask[index] = pixels[index * 4 + 3] ?? 0;
    }
    this.masks.set(frameFile, mask);
    return mask;
  }

  private loadImage(file: string): Promise<void> {
    // 版本号让热加载时的同名文件重新读取，而不是复用网页里上一次的解码结果
    const url = `${new URL(this.baseUrl + file, document.baseURI).href}?g=${this.generation}`;
    return new Promise<void>((resolve) => {
      const image = new Image();
      // 用户皮肤走自定义协议，属于跨源请求；只有带 CORS 加载才能在离屏画布上读取像素
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        this.images.set(file, image);
        resolve();
      };
      image.onerror = () => {
        resolve();
      };
      image.src = url;
    });
  }
}

/** 读取当前设备像素比。在没有窗口的环境（例如单元测试）中按一比一处理。 */
function currentDevicePixelRatio(): number {
  return typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1;
}
