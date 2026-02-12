// ============================================================================
// AutoCropService — 캔버스 픽셀 분석으로 문제 블록 자동 감지
// 원본: D:/클래스인 판서 제작기/src/services/AutoCropService.js
// 시험지 특화: 헤더 제외, 2단 레이아웃, 문제 간 좁은 갭 감지
// 비율 기반 좌표(0~1) 반환
// ============================================================================

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AbsoluteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ROI {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// 시험지용 상수
// ============================================================================

// 시험지 헤더 영역 (학교명, 과목, 이름, 날짜 등) — 상단 ~18% 제외
const EXAM_HEADER_RATIO = 0.18;
// 하단 여백
const EXAM_FOOTER_RATIO = 0.98;
// 문제 블록 최소 높이 (비율) — 너무 작은 노이즈 블록 제거
const MIN_BLOCK_HEIGHT_RATIO = 0.03;
// 문제 블록 최대 높이 (비율) — 이 이상이면 세부 분리 시도
const MAX_SINGLE_PROBLEM_RATIO = 0.35;

/**
 * 캔버스 픽셀 분석으로 문제 블록 감지
 * - 시험지 헤더 자동 제외
 * - 2단 레이아웃 자동 감지 (중앙 수직 갭 분석)
 * - 수평 갭 기반 블록 분리 (감도 자동 조정)
 * - 큰 블록은 getMultiBlocks로 세부 분리
 * - 비율 기반 (0~1) 좌표 반환
 */
export function analyzePageBlocks(
  canvas: HTMLCanvasElement,
  sensitivityOverride?: number,
  roi: ROI | null = null
): CropRect[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const bounds = roi || { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const width = Math.floor(bounds.width);
  const height = Math.floor(bounds.height);

  if (width <= 0 || height <= 0) return [];

  // 감도 자동 조정: 캔버스 높이에 비례
  // 원본 PDF 기준 문제 간 갭 ~10~20px, 캔버스 스케일 ~2.5x → 25~50px
  // 기본값: 캔버스 높이의 ~1.2% (예: 1500px 캔버스 → 18px 갭이면 분리)
  const sensitivity = sensitivityOverride ?? Math.max(8, Math.floor(height * 0.012));

  const imageData = ctx.getImageData(bounds.x, bounds.y, width, height);
  const data = imageData.data;

  // 1. 헤더/푸터 제외 (시험지 헤더: 학교명, 과목, 이름, 날짜)
  const topMargin = roi ? 0 : Math.floor(height * EXAM_HEADER_RATIO);
  const bottomMargin = roi ? height : Math.floor(height * EXAM_FOOTER_RATIO);

  // 헤더 영역에서 실제 콘텐츠가 시작하는 지점 찾기 (더 정밀)
  const actualTop = roi ? 0 : findContentStart(data, width, height, topMargin);

  // 2. Helper: 행의 특정 범위가 비어있는지 확인
  const isSegmentEmpty = (rowY: number, startX: number, endX: number): boolean => {
    const rowOffset = rowY * width;
    // 가장자리 10% 마진 무시 (프린트 경계선, 그림자 등)
    const marginX = Math.floor((endX - startX) * 0.05);
    const scanStartX = startX + marginX;
    const scanEndX = endX - marginX;
    for (let x = scanStartX; x < scanEndX; x++) {
      const offset = (rowOffset + x) * 4;
      if (data[offset] + data[offset + 1] + data[offset + 2] < 600) {
        return false;
      }
    }
    return true;
  };

  // 3. 2단 레이아웃 자동 감지 (Vertical Projection)
  const scanStart = Math.floor(width * 0.4);
  const scanEnd = Math.floor(width * 0.6);
  const vProjection = new Int32Array(scanEnd - scanStart);

  for (let x = scanStart; x < scanEnd; x++) {
    for (let y = actualTop; y < bottomMargin; y += 4) {
      const offset = (y * width + x) * 4;
      if (data[offset] + data[offset + 1] + data[offset + 2] < 500) {
        vProjection[x - scanStart]++;
      }
    }
  }

  let minDensity = height;
  let splitXRelative = -1;
  for (let i = 0; i < vProjection.length; i++) {
    if (vProjection[i] < minDensity) {
      minDensity = vProjection[i];
      splitXRelative = i;
    }
  }

  const splitX = scanStart + splitXRelative;
  const avgDensity = vProjection.reduce((a, b) => a + b, 0) / vProjection.length;
  const totalSampleLines = (bottomMargin - actualTop) / 4;
  const isTwoColumn = avgDensity < totalSampleLines * 0.2;

  const columnZones = isTwoColumn
    ? [{ start: 0, end: splitX - 1 }, { start: splitX + 1, end: width }]
    : [{ start: 0, end: width }];

  console.log(`[AutoCrop] ${isTwoColumn ? '2단' : '1단'} 레이아웃 (sensitivity=${sensitivity}, header=${actualTop}px/${height}px)`);

  const allRegions: AbsoluteRect[] = [];

  // 4. 각 컬럼 존에서 블록 분리
  columnZones.forEach((zone, zoneIdx) => {
    const projection = new Uint8Array(height);
    for (let y = actualTop; y < bottomMargin; y++) {
      if (!isSegmentEmpty(y, zone.start, zone.end)) {
        projection[y] = 1;
      }
    }

    let currentBlock: { y: number; height: number } | null = null;
    let gapCounter = 0;

    for (let y = actualTop; y < bottomMargin; y++) {
      if (projection[y] === 1) {
        if (!currentBlock) {
          currentBlock = { y, height: 0 };
        }
        gapCounter = 0;
        currentBlock.height = y - currentBlock.y + 1;
      } else if (currentBlock) {
        gapCounter++;
        if (gapCounter > sensitivity) {
          if (currentBlock.height > 20) {
            const absBlockRect: AbsoluteRect = {
              x: bounds.x + zone.start,
              y: bounds.y + currentBlock.y,
              width: zone.end - zone.start,
              height: currentBlock.height,
            };
            const refined = getContentBoundsAbs(canvas, absBlockRect);
            if (refined.width > 30 && refined.height > 20) {
              allRegions.push(refined);
            }
          }
          currentBlock = null;
          gapCounter = 0;
        } else {
          currentBlock.height = y - currentBlock.y + 1;
        }
      }
    }

    // 마지막 블록 처리
    if (currentBlock && currentBlock.height > 20) {
      const absBlockRect: AbsoluteRect = {
        x: bounds.x + zone.start,
        y: bounds.y + currentBlock.y,
        width: zone.end - zone.start,
        height: currentBlock.height,
      };
      const refined = getContentBoundsAbs(canvas, absBlockRect);
      if (refined.width > 30 && refined.height > 20) {
        allRegions.push(refined);
      }
    }
  });

  // ROI Fallback
  if (allRegions.length === 0 && roi && (roi.width > 30 || roi.height > 30)) {
    const refined = getContentBoundsAbs(canvas, bounds);
    if (refined.width > 20 && refined.height > 15) {
      allRegions.push(refined);
    }
  }

  // 5. 큰 블록은 세부 분리 시도 (문제가 여러 개 합쳐진 경우)
  const finalRegions: AbsoluteRect[] = [];
  const maxSingleHeight = height * MAX_SINGLE_PROBLEM_RATIO;

  for (const region of allRegions) {
    if (region.height > maxSingleHeight) {
      // 큰 블록 → 세부 분리 시도 (더 작은 감도)
      const subSensitivity = Math.max(5, Math.floor(sensitivity * 0.6));
      const subBlocks = splitLargeBlock(canvas, region, subSensitivity);
      if (subBlocks.length > 1) {
        finalRegions.push(...subBlocks);
      } else {
        finalRegions.push(region);
      }
    } else {
      finalRegions.push(region);
    }
  }

  console.log(`[AutoCrop] 1차 ${allRegions.length}블록 → 세부분리 후 ${finalRegions.length}블록`);

  // 절대 좌표 → 비율 기반 (0~1) 변환, 너무 작은 블록 필터
  const minBlockH = height * MIN_BLOCK_HEIGHT_RATIO;
  return finalRegions
    .filter(r => r.height >= minBlockH)
    .map(r => ({
      x: r.x / canvas.width,
      y: r.y / canvas.height,
      w: r.width / canvas.width,
      h: r.height / canvas.height,
    }));
}

/**
 * 헤더 아래에서 실제 문제 콘텐츠가 시작하는 Y좌표 탐색
 * 헤더 영역 아래쪽에서 비어있는 갭을 찾아 문제 시작점 결정
 */
function findContentStart(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  minTop: number
): number {
  // minTop부터 아래로 스캔하면서 "빈 행 연속 구간" 찾기
  // 그 구간 직후가 실제 문제 시작점
  let lastGapEnd = minTop;
  let gapCount = 0;
  const gapThreshold = Math.max(5, Math.floor(height * 0.005)); // 최소 5px 갭

  for (let y = minTop; y < Math.floor(height * 0.35); y++) {
    let rowEmpty = true;
    // 중앙 80%만 스캔 (가장자리 노이즈 무시)
    const scanStart = Math.floor(width * 0.1);
    const scanEnd = Math.floor(width * 0.9);
    for (let x = scanStart; x < scanEnd; x += 2) {
      const offset = (y * width + x) * 4;
      if (data[offset] + data[offset + 1] + data[offset + 2] < 600) {
        rowEmpty = false;
        break;
      }
    }

    if (rowEmpty) {
      gapCount++;
    } else {
      if (gapCount >= gapThreshold) {
        lastGapEnd = y;
      }
      gapCount = 0;
    }
  }

  if (gapCount >= gapThreshold) {
    // 마지막 갭이 헤더 끝
    lastGapEnd = minTop + Math.floor(height * 0.35) - gapCount;
  }

  return lastGapEnd;
}

/**
 * 큰 블록을 세부 문제로 분리
 */
function splitLargeBlock(
  canvas: HTMLCanvasElement,
  rect: AbsoluteRect,
  sensitivity: number
): AbsoluteRect[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [rect];

  const startX = Math.max(0, Math.floor(rect.x));
  const startY = Math.max(0, Math.floor(rect.y));
  const w = Math.min(canvas.width - startX, Math.floor(rect.width));
  const h = Math.min(canvas.height - startY, Math.floor(rect.height));

  if (w <= 0 || h <= 0) return [rect];

  const imageData = ctx.getImageData(startX, startY, w, h);
  const data = imageData.data;

  // 행별 콘텐츠 밀도 측정 (단순 유무가 아닌 밀도)
  const hasContentRow = new Uint8Array(h);
  // 가장자리 5% 마진 무시
  const marginX = Math.floor(w * 0.05);
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = marginX; x < w - marginX; x++) {
      const offset = (rowOffset + x) * 4;
      if (data[offset] + data[offset + 1] + data[offset + 2] < 600) {
        hasContentRow[y] = 1;
        break;
      }
    }
  }

  // 블록 찾기
  const blocks: { y: number; height: number }[] = [];
  let inBlock = false;
  let blockStart = 0;
  let gapCount = 0;

  for (let y = 0; y < h; y++) {
    if (hasContentRow[y] === 1) {
      if (!inBlock) {
        inBlock = true;
        blockStart = y;
      }
      gapCount = 0;
    } else {
      if (inBlock) {
        gapCount++;
        if (gapCount > sensitivity) {
          const blockH = y - gapCount - blockStart;
          if (blockH > 10) {
            blocks.push({ y: blockStart, height: blockH });
          }
          inBlock = false;
        }
      }
    }
  }

  // 마지막 블록
  if (inBlock && h - blockStart > 10) {
    blocks.push({ y: blockStart, height: h - blockStart });
  }

  if (blocks.length <= 1) return [rect];

  // 각 블록을 절대 좌표로 변환 후 tight bbox
  return blocks.map(block => {
    const blockRect: AbsoluteRect = {
      x: startX,
      y: startY + block.y,
      width: w,
      height: block.height,
    };
    return getContentBoundsAbs(canvas, blockRect);
  }).filter(r => r.width > 20 && r.height > 15);
}

/**
 * 콘텐츠 영역의 tight 바운딩 박스 계산 (절대 좌표)
 * RGB sum < 600인 픽셀을 찾아 최소/최대 좌표 계산
 */
function getContentBoundsAbs(
  canvas: HTMLCanvasElement,
  rect: AbsoluteRect,
  padding = 6
): AbsoluteRect {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return rect;

  const startX = Math.max(0, Math.floor(rect.x));
  const startY = Math.max(0, Math.floor(rect.y));
  const w = Math.min(canvas.width - startX, Math.floor(rect.width));
  const h = Math.min(canvas.height - startY, Math.floor(rect.height));

  if (w <= 0 || h <= 0) return rect;

  const imageData = ctx.getImageData(startX, startY, w, h);
  const data = imageData.data;

  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  let hasContent = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const offset = (y * w + x) * 4;
      if (data[offset] + data[offset + 1] + data[offset + 2] < 600) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        hasContent = true;
      }
    }
  }

  if (!hasContent) return rect;

  const finalX = Math.max(0, startX + minX - padding);
  const finalY = Math.max(0, startY + minY - padding);
  const finalMaxX = Math.min(canvas.width, startX + maxX + padding);
  const finalMaxY = Math.min(canvas.height, startY + maxY + padding);

  return {
    x: finalX,
    y: finalY,
    width: finalMaxX - finalX,
    height: finalMaxY - finalY,
  };
}

/**
 * 특정 영역 내의 세부 블록 분리 (비율 기반 입력/출력)
 * 큰 블록 하나를 여러 문제로 더 잘게 나눌 때 사용
 */
export function getMultiBlocks(
  canvas: HTMLCanvasElement,
  rect: CropRect,
  sensitivity = 15
): CropRect[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [rect];

  // 비율 → 절대 좌표 변환
  const startX = Math.max(0, Math.floor(rect.x * canvas.width));
  const startY = Math.max(0, Math.floor(rect.y * canvas.height));
  const w = Math.min(canvas.width - startX, Math.floor(rect.w * canvas.width));
  const h = Math.min(canvas.height - startY, Math.floor(rect.h * canvas.height));

  if (w <= 0 || h <= 0) return [rect];

  const absRect: AbsoluteRect = { x: startX, y: startY, width: w, height: h };
  const subBlocks = splitLargeBlock(canvas, absRect, sensitivity);

  return subBlocks.map(r => ({
    x: r.x / canvas.width,
    y: r.y / canvas.height,
    w: r.width / canvas.width,
    h: r.height / canvas.height,
  }));
}
