/**
 * 渲染进程入口。
 * 本文件只负责装配五个组件并把浏览器事件转发给控制器，
 * 不包含任何业务规则。
 */

import { PetController } from './app/controller';
import { CanvasRenderer } from './renderer/canvas-renderer';
import { createTauriWindowBackend } from './platform/window';
import { createTauriStorage } from './platform/storage';
import { createFetchSkinRepository } from './platform/skins';
import { listWorkAreas } from './platform/screen';
import { watchWorkAreas } from './platform/monitors';
import { createTauriAutostart } from './platform/autostart';
import { popupContextMenu } from './platform/menu';
import { degradedCapabilities, detectRuntime, readRuntimeInfo } from './platform/runtime';

async function bootstrap(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#pet');
  if (canvas === null) {
    throw new Error('页面中缺少画布元素，程序无法启动');
  }

  const windowBackend = await createTauriWindowBackend();
  const controller = new PetController({
    renderer: new CanvasRenderer(canvas),
    window: windowBackend,
    storage: await createTauriStorage(),
    skins: await createFetchSkinRepository(),
    autostart: await createTauriAutostart(),
    workAreas: listWorkAreas,
    fallbackSkinId: 'default',
  });

  await controller.start();

  // 显示器热插拔没有对应事件，改为轮询布局指纹，变化时把宠物夹回可见区域
  watchWorkAreas((areas) => controller.applyWorkAreas(areas), { list: listWorkAreas });

  // 识别运行环境并输出已知的能力降级项，使降级表现有明确的原因可循
  const runtimeKind = detectRuntime(await readRuntimeInfo());
  for (const warning of degradedCapabilities(runtimeKind)) {
    console.warn(`[runtime] ${warning.capability}受限：${warning.reason}`);
  }

  let previous = performance.now();
  const frameLoop = (now: number): void => {
    controller.tick(now - previous);
    previous = now;
    requestAnimationFrame(frameLoop);
  };
  requestAnimationFrame(frameLoop);

  canvas.addEventListener('pointerdown', (event) => {
    const began = controller.pointerDown({ x: event.screenX, y: event.screenY });
    if (began) {
      // 交给操作系统接管窗口拖动，指针移出窗口范围后拖动仍然继续
      void windowBackend.startDragging();
    }
  });

  canvas.addEventListener('pointerup', () => {
    void controller.pointerUp();
  });

  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    void popupContextMenu({
      listSkins: () => controller.listSkins(),
      autoStartEnabled: () => controller.autoStartEnabled(),
      onToggleAlwaysOnTop: () => controller.toggleAlwaysOnTop(),
      onToggleAutoStart: () => controller.toggleAutoStart(),
      onSwitchSkin: (id) => controller.switchSkin(id),
      onQuit: () => controller.quit(),
    });
  });

  // 操作系统完成窗口拖动之后回读窗口位置，把物理像素按当前缩放比例换算成逻辑像素
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const scale = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  await getCurrentWindow().onMoved(({ payload }) => {
    void controller.syncTopLeft({ x: payload.x / scale, y: payload.y / scale });
  });
}

void bootstrap().catch((error: unknown) => {
  console.error('[startup] 程序启动失败', error);
});
