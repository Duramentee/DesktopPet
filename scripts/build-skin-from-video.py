"""
从白底视频生成桌面宠物皮肤包。

用法：
  python scripts/build-skin-from-video.py \
      --video assets/skins/亚贞/waiting.mp4 \
      --out   assets/skins/亚贞 \
      --id    亚贞 --name 亚贞 --canvas 96 --fps 12

前置条件：ffmpeg 在 PATH 中，Python 侧需要 pillow、numpy、scipy。

处理步骤：
  1. 用 ffmpeg 按目标帧率抽帧到临时目录；
  2. 逐帧抠掉白底：先取近白像素，再从画面边缘做连通域标记，
     只有与边缘连通的白色才算背景，因此被描边包围的白色衣料与高光不会丢；
  3. 只保留最大的连通前景，顺带去掉角落里的水印；
  4. 用所有帧的并集包围盒统一缩放与定位，避免逐帧取包围盒导致的抖动；
  5. 输出 idle 帧与 drag 帧、skin.json，并把皮肤登记进内置索引 index.json。
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

NEAR_WHITE = 238
EDGE_ERODE = 1
EDGE_BLUR = 0.6


def extract_frames(video: Path, fps: int, outdir: Path) -> list[Path]:
    if shutil.which("ffmpeg") is None:
        sys.exit("找不到 ffmpeg，请先把它加入 PATH")
    pattern = outdir / "src_%04d.png"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(video), "-vf", f"fps={fps}", str(pattern)],
        check=True,
    )
    frames = sorted(outdir.glob("src_*.png"))
    if not frames:
        sys.exit("抽帧失败，没有生成任何文件")
    return frames


def cutout(image: Image.Image) -> Image.Image:
    """去掉与画面边缘连通的近白背景，只保留最大的前景连通域。"""
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    near_white = rgb.min(axis=2) >= NEAR_WHITE

    # 与边缘连通的近白区域才是背景，被描边包围的白色衣料起点不触边，因此会保留
    structure = np.ones((3, 3), dtype=bool)
    labels, count = ndimage.label(near_white, structure=structure)
    border = np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])
    background_ids = np.unique(border[border > 0])
    background = np.isin(labels, background_ids)
    foreground = ~background

    # 水印与主体不相连，只保留最大的一块即可顺带清掉
    labels, count = ndimage.label(foreground, structure=structure)
    if count > 1:
        sizes = ndimage.sum(foreground, labels, range(1, count + 1))
        keep = int(np.argmax(sizes)) + 1
        foreground = labels == keep

    alpha = ndimage.binary_erosion(foreground, iterations=EDGE_ERODE, structure=structure)
    alpha_img = Image.fromarray((alpha * 255).astype(np.uint8), mode="L")
    if EDGE_BLUR > 0:
        alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(EDGE_BLUR))

    result = image.convert("RGBA")
    result.putalpha(alpha_img)
    return result


def content_bbox(images: list[Image.Image]) -> tuple[int, int, int, int]:
    """所有帧的并集包围盒，用于统一缩放与定位。"""
    left = top = 10**9
    right = bottom = -1
    for image in images:
        box = image.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
        if box is None:
            continue
        left = min(left, box[0])
        top = min(top, box[1])
        right = max(right, box[2])
        bottom = max(bottom, box[3])
    return left, top, right, bottom


def compose(image: Image.Image, box, scale: float, canvas: int, margin: int) -> Image.Image:
    """按统一比例缩放后，底部对齐、水平居中地放到方形画布上。"""
    left, top, right, bottom = box
    crop = image.crop((left, top, right, bottom))
    width = max(1, round(crop.width * scale))
    height = max(1, round(crop.height * scale))
    crop = crop.resize((width, height), Image.LANCZOS)

    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    x = (canvas - width) // 2
    y = canvas - margin - height
    out.alpha_composite(crop, (max(0, x), max(0, y)))
    return out


def save_png(image: Image.Image, path: Path) -> None:
    """
    转成 255 色调色板再存。宠物帧只有几十上百种颜色，调色板版本在四倍放大下
    与真彩色没有肉眼差别，体积却只有原来的三成，几十帧累加起来差别很明显。
    """
    image.quantize(colors=255, method=Image.FASTOCTREE).save(path, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--id", required=True)
    parser.add_argument("--name", default=None)
    parser.add_argument("--canvas", type=int, default=96)
    parser.add_argument("--fps", type=int, default=12)
    parser.add_argument("--margin", type=int, default=2)
    parser.add_argument("--fill", type=float, default=0.98, help="主体占画布的比例上限")
    args = parser.parse_args()

    outdir: Path = args.out
    images_dir = outdir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        frames = extract_frames(args.video, args.fps, Path(tmp))
        cut = [cutout(Image.open(frame)) for frame in frames]

        left, top, right, bottom = content_bbox(cut)
        if right <= left or bottom <= top:
            sys.exit("抠图后没有留下前景，检查背景阈值")
        usable = args.canvas - args.margin * 2
        scale = min(usable / (right - left), usable / (bottom - top)) * args.fill

        composed = [compose(image, (left, top, right, bottom), scale, args.canvas, args.margin) for image in cut]

    # 首尾帧相同说明素材本身是完整循环，去掉重复的最后一帧
    first = np.asarray(composed[0], dtype=np.int16)
    last = np.asarray(composed[-1], dtype=np.int16)
    if len(composed) > 2 and np.abs(first - last).mean() < 1.0:
        composed.pop()

    for index, image in enumerate(composed):
        save_png(image, images_dir / f"idle_{index}.png")

    # 拖拽动画取视频里的头两段动作，比复用静止画面更像被拎起来晃动
    drag_count = 2
    step = max(1, len(composed) // drag_count)
    for index in range(drag_count):
        source = composed[min(len(composed) - 1, index * step)]
        save_png(source, images_dir / f"drag_{index}.png")

    manifest = {
        "id": args.id,
        "displayName": args.name or args.id,
        "formatVersion": 1,
        "canvas": {"width": args.canvas, "height": args.canvas},
        "anchor": {"x": args.canvas // 2, "y": args.canvas},
        "animations": {
            "idle": {
                "fps": args.fps,
                "loop": True,
                "frames": [{"file": f"images/idle_{i}.png"} for i in range(len(composed))],
            },
            "drag": {
                "fps": 12,
                "loop": True,
                "frames": [{"file": f"images/drag_{i}.png"} for i in range(drag_count)],
            },
        },
    }
    # 保证中文不被转义，方便人工核对
    (outdir / "skin.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    index_path = outdir.parent / "index.json"
    if index_path.exists():
        index = json.loads(index_path.read_text(encoding="utf-8"))
        entries = [item for item in index.get("skins", []) if item.get("id") != args.id]
        entries.append({"id": args.id, "displayName": args.name or args.id})
        index_path.write_text(
            json.dumps({"skins": entries}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    total = sum(path.stat().st_size for path in images_dir.glob("*.png"))
    print(
        f"done: {len(composed)} idle frames + {drag_count} drag frames, "
        f"{total / 1024:.1f} KB total, canvas {args.canvas}"
    )


if __name__ == "__main__":
    main()
