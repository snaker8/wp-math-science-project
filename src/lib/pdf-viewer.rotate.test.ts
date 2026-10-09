// 회전 좌표 변환 왕복 — 감지(회전 캔버스) → unrotateBbox 저장 → rotateBbox 표시 가 원점으로 돌아와야 한다 (2026-10-09)
import { describe, it, expect } from 'vitest';
import { rotateBbox, unrotateBbox } from './pdf-viewer';

const ROTS = [0, 90, 180, 270] as const;
const boxes = [
  { x: 0.1, y: 0.2, w: 0.3, h: 0.15 },
  { x: 0, y: 0, w: 1, h: 1 },
  { x: 0.55, y: 0.8, w: 0.4, h: 0.2 },
];
const close = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  ['x', 'y', 'w', 'h'].every((k) => Math.abs((a as any)[k] - (b as any)[k]) < 1e-9);

describe('rotateBbox / unrotateBbox', () => {
  it('왕복하면 원래 상자', () => {
    for (const r of ROTS) for (const b of boxes) {
      expect(close(unrotateBbox(rotateBbox(b, r), r), b)).toBe(true);
      expect(close(rotateBbox(unrotateBbox(b, r), r), b)).toBe(true);
    }
  });
  it('90° 는 가로세로가 바뀌고 0~1 안에 머문다', () => {
    const d = rotateBbox(boxes[0], 90);
    expect(d.w).toBeCloseTo(0.15); expect(d.h).toBeCloseTo(0.3);
    expect(d.x).toBeGreaterThanOrEqual(0); expect(d.x + d.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(d.y).toBeGreaterThanOrEqual(0); expect(d.y + d.h).toBeLessThanOrEqual(1 + 1e-9);
  });
  it('가로 스캔의 왼쪽 위 문제는 90° 돌리면 오른쪽 위', () => {
    // 원본(가로) 좌상단 → 시계방향 90° 표시에서는 우상단
    const d = rotateBbox({ x: 0, y: 0, w: 0.2, h: 0.1 }, 90);
    expect(d.x).toBeCloseTo(0.9); expect(d.y).toBeCloseTo(0);
  });
});
