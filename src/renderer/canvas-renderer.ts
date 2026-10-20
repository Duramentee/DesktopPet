/**
 * 渲染层。
 * 渲染器只接收应用层给出的帧描述，把对应的帧图片绘制到画布上，
 * 不参与状态计算，因此可以独立替换实现。
 */

import type { RenderFrame, Renderer } from '../app/controller';
import type { Skin } from '../core/skin/types';

export class CanvasRenderer implements Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly images = new Map<string, HTMLImageElement>();
  private baseUrl = '';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * 设置画布尺寸并预载全部帧图片。
   * 预载完成之前不绘制，因此宠物出现时不会出现空白帧。
   */
  async prepareSkin(skin: Skin, baseUrl: string): Promise<void> {
    this.baseUrl = baseUrl;
    this.canvas.width = skin.canvas.width;
    this.canvas.height = skin.canvas.height;
    const context = this.canvas.getContext('2d');
    if (context !== null) {
      context.imageSmoothingEnabled = true;
    }
    const files = new Set<string>();
    for (const animation of Object.values(skin.animations)) {
      for (const frame of animation.frames) {
        files.add(frame.file);
      }
    }
    this.images.clear();
    await Promise.all([...files].map((file) => this.loadImage(file)));
  }

  draw(frame: RenderFrame): void {
    const context = this.canvas.getContext('2d');
    if (context === null) {
      return;
    }
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const image = this.images.get(frame.frameFile);
    if (image !== undefined) {
      context.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private loadImage(file: string): Promise<void> {
    const url = new URL(this.baseUrl + file, document.baseURI).href;
    return new Promise<void>((resolve) => {
      const image = new Image();
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
