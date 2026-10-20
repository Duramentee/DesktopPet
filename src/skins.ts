/**
 * 皮肤管理窗口的页面入口。
 *
 * 该窗口只做两件事：列出可用皮肤、把选择结果通知宠物窗口。
 * 当前皮肤从配置文件读取，切换动作通过事件交给宠物窗口执行，
 * 因此这里不直接修改任何运行时状态。
 */

import { createFetchSkinRepository, hideSkinManager } from './platform/skins';
import { buildGalleryCards } from './ui/skin-gallery';
import type { GalleryCard } from './ui/skin-gallery';

const EMPTY_HINT = '没有可用的皮肤，请检查 skins/index.json';

async function readActiveSkinId(): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const text = await invoke<string | null>('load_config');
    if (typeof text !== 'string') {
      return '';
    }
    const parsed = JSON.parse(text) as { activeSkinId?: unknown };
    return typeof parsed.activeSkinId === 'string' ? parsed.activeSkinId : '';
  } catch (error) {
    console.warn('[skins-window] 读取配置失败，按无激活皮肤处理', error);
    return '';
  }
}

function renderCards(cards: GalleryCard[], onPick: (id: string) => void): void {
  const gallery = document.querySelector<HTMLElement>('#gallery');
  if (gallery === null) {
    return;
  }
  gallery.replaceChildren();
  if (cards.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'empty';
    hint.textContent = EMPTY_HINT;
    gallery.append(hint);
    return;
  }
  for (const card of cards) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = card.active ? 'card active' : 'card';
    button.dataset['skinId'] = card.id;
    button.addEventListener('click', () => onPick(card.id));

    const preview = document.createElement('img');
    preview.alt = card.name;
    preview.draggable = false;
    if (card.previewUrl !== null) {
      preview.src = card.previewUrl;
    }

    const label = document.createElement('span');
    label.textContent = card.name;

    button.append(preview, label);
    gallery.append(button);
  }
}

function markActive(id: string): void {
  for (const element of document.querySelectorAll<HTMLElement>('.card')) {
    element.classList.toggle('active', element.dataset['skinId'] === id);
  }
  const status = document.querySelector<HTMLElement>('#status');
  if (status !== null) {
    const active = document.querySelector<HTMLElement>('.card.active span');
    status.textContent = active === null ? '' : `当前：${active.textContent ?? ''}`;
  }
}

async function bootstrap(): Promise<void> {
  const repository = await createFetchSkinRepository();
  const { emit, listen } = await import('@tauri-apps/api/event');

  const skins = await repository.list();
  const previews = new Map<string, string | null>();
  await Promise.all(
    skins.map(async (skin) => {
      previews.set(skin.id, await repository.previewUrl(skin.id));
    }),
  );

  let activeId = await readActiveSkinId();
  renderCards(buildGalleryCards(skins, activeId, previews), (id) => {
    activeId = id;
    markActive(id);
    void emit('pet:switch-skin', { id });
  });
  markActive(activeId);

  const status = document.querySelector<HTMLElement>('#status');
  if (status !== null && skins.length > 0) {
    status.textContent = `共 ${skins.length} 份皮肤`;
  }

  // 宠物窗口切换成功后会把当前皮肤广播回来，这里同步高亮
  await listen<{ id: string }>('pet:skin-changed', ({ payload }) => {
    if (typeof payload?.id === 'string') {
      activeId = payload.id;
      markActive(activeId);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      void hideSkinManager();
    }
  });

  // 标题栏的关闭按钮只隐藏窗口，保留实例以便再次打开
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().onCloseRequested(async (event) => {
    event.preventDefault();
    await hideSkinManager();
  });
}

void bootstrap().catch((error: unknown) => {
  console.error('[skins-window] 皮肤管理窗口启动失败', error);
  const status = document.querySelector<HTMLElement>('#status');
  if (status !== null) {
    status.textContent = '皮肤列表加载失败';
  }
});
