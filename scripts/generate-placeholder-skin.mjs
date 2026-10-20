/**
 * 生成占位皮肤包。
 * 脚本不依赖任何第三方库：PNG 编码由 node:zlib 的 deflate 加手写的块封裝完成，
 * 因此仓库可以在没有美术素材的情况下自描述地生成一套可运行的皮肤。
 *
 * 用法：node scripts/generate-placeholder-skin.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKIN_ROOT = join(HERE, '..', 'assets', 'skins');

const CANVAS = 64;
const SUPERSAMPLE = 3;

// ---------------------------------------------------------------- PNG 编码

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // 过滤类型 0，表示不滤波
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 位深
  header[9] = 6; // 颜色类型 6，表示 RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 绘制

function insideEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function parseHex(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * 绘制一帧。bob 表示竖直方向的浮动像素，squash 表示竖直方向压扁的比例。
 * 每个像素用 3 乘 3 个子采样求覆盖率，从而得到平滑的边缘。
 */
function renderFrame({ body, eye, bob, squash, size = CANVAS }) {
  const bodyRgb = parseHex(body);
  const eyeRgb = parseHex(eye);
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / CANVAS;
  const bodyCx = size / 2;
  const bodyCy = (38 + bob) * scale;
  const bodyRx = 17 * scale;
  const bodyRy = 15 * squash * scale;
  const eyeRadius = 2.4 * scale;
  const eyeCy = (32 + bob) * scale;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bodyHits = 0;
      let eyeHits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const px = x + (sx + 0.5) / SUPERSAMPLE;
          const py = y + (sy + 0.5) / SUPERSAMPLE;
          if (!insideEllipse(px, py, bodyCx, bodyCy, bodyRx, bodyRy)) {
            continue;
          }
          bodyHits += 1;
          if (
            insideEllipse(px, py, bodyCx - 6 * scale, eyeCy, eyeRadius, eyeRadius) ||
            insideEllipse(px, py, bodyCx + 6 * scale, eyeCy, eyeRadius, eyeRadius)
          ) {
            eyeHits += 1;
          }
        }
      }
      const total = SUPERSAMPLE * SUPERSAMPLE;
      if (bodyHits === 0) {
        continue;
      }
      const alpha = Math.round((bodyHits / total) * 255);
      const eyeRatio = eyeHits / bodyHits;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const bodyValue = bodyRgb[channel] ?? 0;
        const eyeValue = eyeRgb[channel] ?? 0;
        pixels[offset + channel] = Math.round(bodyValue * (1 - eyeRatio) + eyeValue * eyeRatio);
      }
      pixels[offset + 3] = alpha;
    }
  }
  return encodePng(size, size, pixels);
}

// ---------------------------------------------------------------- 皮肤定义

const SKINS = [
  {
    id: 'default',
    displayName: '占位皮肤',
    body: '#8fd3f4',
    eye: '#2b3a45',
    idle: { fps: 8, loop: true, frames: [0, -1, -2, -1] },
    drag: { fps: 12, loop: true, frames: [0.86, 0.94] },
  },
  {
    id: 'midnight',
    displayName: '午夜皮肤',
    body: '#5b5f74',
    eye: '#e8e8f0',
    idle: { fps: 6, loop: true, frames: [0, -1, -2, -3, -2, -1] },
    drag: { fps: 12, loop: true, frames: [0.82, 0.92] },
  },
];

function buildManifest(skin) {
  const idleFrames = skin.idle.frames.map((bob, index) => ({
    file: `images/idle_${index}.png`,
  }));
  const dragFrames = skin.drag.frames.map((squash, index) => ({
    file: `images/drag_${index}.png`,
  }));
  return {
    id: skin.id,
    displayName: skin.displayName,
    formatVersion: 1,
    canvas: { width: CANVAS, height: CANVAS },
    anchor: { x: CANVAS / 2, y: CANVAS },
    animations: {
      idle: { fps: skin.idle.fps, loop: skin.idle.loop, frames: idleFrames },
      drag: { fps: skin.drag.fps, loop: skin.drag.loop, frames: dragFrames },
    },
  };
}

for (const skin of SKINS) {
  const dir = join(SKIN_ROOT, skin.id);
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'skin.json'), `${JSON.stringify(buildManifest(skin), null, 2)}\n`, 'utf8');

  skin.idle.frames.forEach((bob, index) => {
    const png = renderFrame({ body: skin.body, eye: skin.eye, bob, squash: 1 });
    writeFileSync(join(dir, 'images', `idle_${index}.png`), png);
  });
  skin.drag.frames.forEach((squash, index) => {
    const png = renderFrame({ body: skin.body, eye: skin.eye, bob: 0, squash });
    writeFileSync(join(dir, 'images', `drag_${index}.png`), png);
  });

  const frameCount = skin.idle.frames.length + skin.drag.frames.length;
  console.log(`生成皮肤 ${skin.id}，共 ${frameCount} 帧`);
}

// 写出皮肤索引，运行时通过它列出可切换的皮肤
const index = {
  skins: SKINS.map((skin) => ({ id: skin.id, displayName: skin.displayName })),
};
writeFileSync(join(SKIN_ROOT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`生成皮肤索引，共 ${SKINS.length} 份皮肤`);

// 写出打包用的图标源文件，后续由 tauri icon 命令派生各平台所需格式
const ICON_SIZE = 1024;
const ICON_DIR = join(HERE, '..', 'src-tauri', 'icons');
mkdirSync(ICON_DIR, { recursive: true });
const iconPng = renderFrame({
  body: '#8fd3f4',
  eye: '#2b3a45',
  bob: 0,
  squash: 1,
  size: ICON_SIZE,
});
writeFileSync(join(ICON_DIR, 'source.png'), iconPng);
console.log(`生成图标源文件，边长 ${ICON_SIZE} 像素`);
