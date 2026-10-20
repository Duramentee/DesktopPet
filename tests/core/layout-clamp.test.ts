import { describe, expect, it } from 'vitest';
import { clampToWorkArea } from '../../src/core/layout/clamp';
import type { Rect } from '../../src/core/skin/types';

const PRIMARY: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
const SECOND: Rect = { x: 1920, y: 0, width: 1280, height: 1024 };

describe('位置约束器', () => {
  it('坐标落在工作区内部时原样返回', () => {
    expect(clampToWorkArea({ x: 500, y: 600 }, [PRIMARY])).toEqual({ x: 500, y: 600 });
  });

  // T12
  it('坐标超出工作区右边界时，横坐标被夹紧到右边界', () => {
    expect(clampToWorkArea({ x: 2000, y: 500 }, [PRIMARY])).toEqual({ x: 1920, y: 500 });
  });

  it('坐标超出工作区左边界与上边界时，坐标被夹紧到左上角', () => {
    expect(clampToWorkArea({ x: -50, y: -30 }, [PRIMARY])).toEqual({ x: 0, y: 0 });
  });

  it('坐标超出工作区下边界时，纵坐标被夹紧到下边界', () => {
    expect(clampToWorkArea({ x: 500, y: 1200 }, [PRIMARY])).toEqual({ x: 500, y: 1080 });
  });

  // T13
  it('坐标落在第二块显示器的工作区内时，以第二块显示器的工作区为边界夹紧', () => {
    expect(clampToWorkArea({ x: 3200, y: 1200 }, [PRIMARY, SECOND])).toEqual({
      x: 3200,
      y: 1024,
    });
  });

  // T14
  it('坐标不落在任何工作区内时，以距离最近的工作区为边界夹紧', () => {
    expect(clampToWorkArea({ x: -400, y: -300 }, [PRIMARY, SECOND])).toEqual({ x: 0, y: 0 });
  });

  it('坐标位于两块显示器之间的空隙时，被夹紧到距离最近的那一块', () => {
    const left: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
    const right: Rect = { x: 2500, y: 0, width: 1000, height: 1080 };
    expect(clampToWorkArea({ x: 2100, y: 500 }, [left, right])).toEqual({ x: 1920, y: 500 });
  });

  it('工作区列表为空时原样返回坐标，不抛出异常', () => {
    expect(clampToWorkArea({ x: 42, y: 43 }, [])).toEqual({ x: 42, y: 43 });
  });
});
