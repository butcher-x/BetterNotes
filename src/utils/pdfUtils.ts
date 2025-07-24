/*
 * pdfUtils.ts
 * -------------------------------------------------------
 * 提供与 PDF 坐标、矩形和向量运算相关的通用工具函数。
 * 这些函数与 Obsidian、pdf.js、pdf-lib 等库无耦合，可在其他模块中复用。
 */

/**
 * 将 pdf.js 的 2×3 变换矩阵进行逆变换，并应用到点 (x, y)。
 * @param m 2×3 变换矩阵 `[a, b, c, d, e, f]`
 * @param p 点坐标 `[x, y]`
 * @returns 逆变换后的点坐标 `[x', y']`
 */
export function applyInverseTransform(m: number[], p: [number, number]): [number, number] {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c || 1e-6; // 防止除零
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  const ie = (c * f - d * e) / det;
  const if_ = (b * e - a * f) / det;
  const [x, y] = p;
  return [ia * x + ic * y + ie, ib * x + id * y + if_];
}

/**
 * 判断两个矩形的中心 Y 值差异是否在阈值内，用于判定是否处于同一文本行。
 * @param a `[l, b, r, t]`
 * @param b `[l, b, r, t]`
 */
export function areRectanglesMergeableHorizontally(a: number[], b: number[]): boolean {
  const midY1 = (a[1] + a[3]) / 2;
  const midY2 = (b[1] + b[3]) / 2;
  const h1 = Math.abs(a[3] - a[1]);
  const h2 = Math.abs(b[3] - b[1]);
  const threshold = 0.5 * Math.max(h1, h2);
  return Math.abs(midY1 - midY2) < threshold;
}

/**
 * 合并同一行的矩形，减少 QuadPoints 数量。
 */
export function mergeSequentialRects(rects: number[][]): number[][] {
  if (rects.length <= 1) return rects;
  const merged: number[][] = [];
  let cur = rects[0];
  for (let i = 1; i < rects.length; i++) {
    const r = rects[i];
    if (areRectanglesMergeableHorizontally(cur, r)) {
      cur = [
        Math.min(cur[0], r[0]),
        Math.min(cur[1], r[1]),
        Math.max(cur[2], r[2]),
        Math.max(cur[3], r[3])
      ];
    } else {
      merged.push(cur);
      cur = r;
    }
  }
  merged.push(cur);
  return merged;
}

/**
 * 将若干矩形转换为 PDF QuadPoints（8 个数一组：LT, RT, LB, RB）。
 * @param rects 矩形数组 `[l, b, r, t]`
 */
export function rectsToQuadPoints(rects: number[][]): number[] {
  return rects.flatMap(([l, b, r, t]) => [l, t, r, t, l, b, r, b]);
}

/**
 * 计算能够包裹所有矩形的最小边框矩形。
 */
export function mergeRects(rects: number[][]): number[] {
  const l = Math.min(...rects.map(r => r[0]));
  const b = Math.min(...rects.map(r => r[1]));
  const r = Math.max(...rects.map(r => r[2]));
  const t = Math.max(...rects.map(r => r[3]));
  return [l, b, r, t];
} 