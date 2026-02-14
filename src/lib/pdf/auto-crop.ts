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

// 시험지 헤더 영역 — 상단 ~20% 제외 (학교명, 과목, 이름란, 시험지 제목 등)
const EXAM_HEADER_RATIO = 0.20;
// 하단 여백 — 하단 7% 제외 (수사람 로고, 페이지번호)
const EXAM_FOOTER_RATIO = 0.93;
// 문제 블록 최소 높이 (비율) — 이보다 작으면 인접 블록에 병합 (선택지, 그림 분리 방지)
// 시험지 1문제 = 보통 전체 높이의 15~25%, 최소 10% 이상이어야 독립 문제
const MIN_BLOCK_HEIGHT_RATIO = 0.10;
// 문제 블록 최대 높이 (비율) — 이 이상이면 세부 분리 시도
const MAX_SINGLE_PROBLEM_RATIO = 0.25;

/**
 * 캔버스 픽셀 분석으로 문제 블록 감지 (단일 영역)
 * - 시험지 헤더 자동 제외 (전체 높이 ROI에서도 적용)
 * - 수평 갭 기반 블록 분리 (감도 자동 조정)
 * - 큰 블록은 splitLargeBlock으로 세부 분리
 * - 비율 기반 (0~1) 좌표 반환
 *
 * 2단 시험지는 이 함수를 직접 호출하지 말고 analyzePageBlocksSplit() 사용
 */
export function analyzePageBlocks(
  canvas: HTMLCanvasElement,
  sensitivityOverride?: number,
  roi: ROI | null = null,
  maxProblemRatio: number = MAX_SINGLE_PROBLEM_RATIO
): CropRect[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const bounds = roi || { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const width = Math.floor(bounds.width);
  const height = Math.floor(bounds.height);

  if (width <= 0 || height <= 0) return [];

  // 감도 자동 조정: 캔버스 높이의 1.2%
  // 2.0x(1684px)→20px, 1.0x(842px)→10px — 문제 간 갭(25-50px) 감지, 문제 내부 갭(5-15px) 무시
  const sensitivity = sensitivityOverride ?? Math.max(8, Math.min(20, Math.floor(height * 0.012)));

  const imageData = ctx.getImageData(bounds.x, bounds.y, width, height);
  const data = imageData.data;

  // 1. 헤더/푸터 제외 (시험지 헤더: 학교명, 과목, 이름, 날짜)
  // ROI이더라도 전체 높이(좌/우 반 분할)면 헤더 건너뛰기 적용
  const isFullHeightROI = roi && roi.height >= canvas.height * 0.9;
  const applyHeader = !roi || isFullHeightROI;
  const topMargin = applyHeader ? Math.floor(height * EXAM_HEADER_RATIO) : 0;
  const bottomMargin = applyHeader ? Math.floor(height * EXAM_FOOTER_RATIO) : height;

  // 헤더 영역에서 실제 콘텐츠가 시작하는 지점 찾기
  const actualTop = applyHeader ? findContentStart(data, width, height, topMargin) : 0;

  // 2. Helper: 행의 특정 범위가 비어있는지 확인
  // ROI 모드(반쪽 스캔)일 때 좌우 5% 마진 적용 — 세로 구분선/테두리 무시
  const edgeMargin = roi ? Math.floor(width * 0.05) : 0;
  const isSegmentEmpty = (rowY: number, startX: number, endX: number): boolean => {
    const rowOffset = rowY * width;
    const scanStart = startX + edgeMargin;
    const scanEnd = endX - edgeMargin;
    for (let x = scanStart; x < scanEnd; x++) {
      const offset = (rowOffset + x) * 4;
      if (data[offset] + data[offset + 1] + data[offset + 2] < 600) {
        return false;
      }
    }
    return true;
  };

  // 3. 단일 영역 스캔 (2단 분할은 analyzePageBlocksSplit에서 ROI로 처리)
  const columnZones = [{ start: 0, end: width }];

  console.log(`[AutoCrop] 스캔 (sensitivity=${sensitivity}, header=${actualTop}px/${height}px, 영역=${width}x${height}, offset=${bounds.x},${bounds.y})`);

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
    let zoneBlockCount = 0;

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
            if (refined && refined.width > 30 && refined.height > 20) {
              allRegions.push(refined);
              zoneBlockCount++;
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
      if (refined && refined.width > 30 && refined.height > 20) {
        allRegions.push(refined);
        zoneBlockCount++;
      }
    }

    console.log(`[AutoCrop] Zone ${zoneIdx}: ${zoneBlockCount}개 블록 (범위: x=${zone.start}-${zone.end})`);
  });

  // ROI Fallback
  if (allRegions.length === 0 && roi && (roi.width > 30 || roi.height > 30)) {
    const refined = getContentBoundsAbs(canvas, bounds);
    if (refined && refined.width > 20 && refined.height > 15) {
      allRegions.push(refined);
    }
  }

  // 5. 큰 블록은 세부 분리 시도 (문제가 여러 개 합쳐진 경우)
  const finalRegions: AbsoluteRect[] = [];
  const maxSingleHeight = height * maxProblemRatio;

  for (const region of allRegions) {
    if (region.height > maxSingleHeight) {
      // 블록 크기에 따라 2단계 세밀도 조정 (최솟값 8px로 문제 내부 분리 방지)
      const blockRatio = region.height / height;
      const subSensitivity = blockRatio > 0.5
        ? Math.max(8, Math.floor(sensitivity * 0.5))    // 초대형(>50%): 10px
        : Math.max(8, Math.floor(sensitivity * 0.6));   // 보통: 12px
      const subBlocks = splitLargeBlock(canvas, region, subSensitivity);
      if (subBlocks.length > 1) {
        console.log(`[AutoCrop] 큰 블록 (h=${region.height}px, ${(blockRatio*100).toFixed(1)}%) → ${subBlocks.length}개로 분리 (subSensitivity=${subSensitivity})`);
        finalRegions.push(...subBlocks);
      } else {
        finalRegions.push(region);
      }
    } else {
      finalRegions.push(region);
    }
  }

  // 최종 요약 로깅
  console.log(`[AutoCrop] 1차 ${allRegions.length}블록 → 세부분리 후 ${finalRegions.length}블록`);

  // 절대 좌표 → 비율 기반 (0~1) 변환, 너무 작은 블록 필터
  const minBlockH = height * MIN_BLOCK_HEIGHT_RATIO;
  const filteredOut = finalRegions.filter(r => r.height < minBlockH);
  if (filteredOut.length > 0) {
    console.log(`[AutoCrop] 최소높이 필터(${Math.round(minBlockH)}px): ${filteredOut.length}개 제거 — ` +
      filteredOut.map(r => `${r.height}px@y=${r.y}`).join(', '));
  }
  const result = finalRegions.filter(r => r.height >= minBlockH);
  console.log(`[AutoCrop] 최종 ${result.length}블록: ` +
    result.map((r, i) => `#${i+1}(${r.height}px, y=${Math.round(r.y/canvas.height*100)}%)`).join(', '));
  return result.map(r => ({
    x: r.x / canvas.width,
    y: r.y / canvas.height,
    w: r.width / canvas.width,
    h: r.height / canvas.height,
  }));
}

/**
 * 헤더 아래에서 실제 문제 콘텐츠가 시작하는 Y좌표 탐색
 * 간소화된 버전: 12%~18% 범위에서 첫 번째 의미 있는 갭을 찾아 반환
 * 첫 문제를 건너뛰지 않도록 보수적으로 동작
 */
function findContentStart(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  minTop: number
): number {
  // 12%~18% 범위만 스캔 (기존 35%는 첫 문제를 건너뛸 위험)
  const maxScan = Math.floor(height * 0.18);
  const gapThreshold = Math.max(3, Math.floor(height * 0.003)); // ~3px 최소 갭
  let gapCount = 0;

  // 중앙 90%만 스캔 (가장자리 노이즈 무시)
  const scanStartX = Math.floor(width * 0.05);
  const scanEndX = Math.floor(width * 0.95);

  for (let y = minTop; y < maxScan; y++) {
    let rowEmpty = true;
    for (let x = scanStartX; x < scanEndX; x += 2) {
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
        // 첫 번째 의미 있는 갭을 찾으면 바로 반환 (헤더와 본문 사이 갭)
        return y;
      }
      gapCount = 0;
    }
  }

  // 갭 못찾으면 보수적으로 minTop(12%) 반환
  return minTop;
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

  // 행별 콘텐츠 유무 측정 — 좌우 8% 마진 제외 (세로 구분선/테두리 무시)
  const marginX = Math.floor(w * 0.08);
  const hasContentRow = new Uint8Array(h);
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
  }).filter((r): r is AbsoluteRect => r !== null && r.width > 20 && r.height > 15);
}

/**
 * 콘텐츠 영역의 tight 바운딩 박스 계산 (절대 좌표)
 */
function getContentBoundsAbs(
  canvas: HTMLCanvasElement,
  rect: AbsoluteRect,
  padding = 10
): AbsoluteRect | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const startX = Math.max(0, Math.floor(rect.x));
  const startY = Math.max(0, Math.floor(rect.y));
  const w = Math.min(canvas.width - startX, Math.floor(rect.width));
  const h = Math.min(canvas.height - startY, Math.floor(rect.height));

  if (w <= 0 || h <= 0) return null;

  const imageData = ctx.getImageData(startX, startY, w, h);
  const data = imageData.data;

  // ★ 좌우 마진: 세로 구분선/외곽 테두리 무시 (양쪽 10%)
  const marginX = Math.max(4, Math.floor(w * 0.10));

  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  let hasContent = false;

  for (let y = 0; y < h; y++) {
    for (let x = marginX; x < w - marginX; x++) {
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

  // 빈 영역이면 null 반환 (유령 블록 방지)
  if (!hasContent) return null;

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
 *
 * 판서 프로젝트(AutoCropService.getMultiBlocks) 원본 알고리즘 포팅:
 * - 선택 영역 내 Y축 투영으로 콘텐츠 행 감지
 * - sensitivity(기본 30) 이상의 빈 행이 연속되면 블록 분리
 * - 각 블록마다 getContentBoundsAbs로 tight bbox 계산
 * - 수동 드래그 영역 전용 (헤더/푸터 제외 없음)
 */
export function getMultiBlocks(
  canvas: HTMLCanvasElement,
  rect: CropRect,
  sensitivity = 30
): CropRect[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [rect];

  const startX = Math.max(0, Math.floor(rect.x * canvas.width));
  const startY = Math.max(0, Math.floor(rect.y * canvas.height));
  const w = Math.min(canvas.width - startX, Math.floor(rect.w * canvas.width));
  const h = Math.min(canvas.height - startY, Math.floor(rect.h * canvas.height));

  if (w <= 0 || h <= 0) return [rect];

  const imageData = ctx.getImageData(startX, startY, w, h);
  const data = imageData.data;

  // 좌우 마진: 테두리선/세로선/점선 무시 (양쪽 10% 제외)
  const marginX = Math.max(4, Math.floor(w * 0.10));
  const scanLeft = marginX;
  const scanRight = w - marginX;
  const scanWidth = scanRight - scanLeft;
  // 콘텐츠 행 판정: darkPixel 비율이 일정 이상이어야 실제 텍스트/수식 행
  // 텍스트 한 줄에 수십~수백 픽셀이 어두우므로, 스캔 폭의 1% 이상을 임계값으로 설정
  const minDarkPixels = Math.max(3, Math.floor(scanWidth * 0.01));

  // 1. Y축 투영: 각 행에 충분한 어두운 픽셀(콘텐츠)이 있는지 확인
  const hasContentRow = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    let darkCount = 0;
    for (let x = scanLeft; x < scanRight; x++) {
      const offset = (rowOffset + x) * 4;
      if (data[offset] + data[offset + 1] + data[offset + 2] < 600) {
        darkCount++;
        if (darkCount >= minDarkPixels) {
          hasContentRow[y] = 1;
          break; // 충분히 어두운 픽셀 있으면 콘텐츠 행
        }
      }
    }
  }

  // 최소 블록 높이: 캔버스 전체의 MIN_BLOCK_HEIGHT_RATIO 이상이어야 유효한 문제 블록
  const minBlockH = Math.max(15, Math.floor(canvas.height * MIN_BLOCK_HEIGHT_RATIO));

  // 2. 블록 찾기 (sensitivity 이상 빈 행이 연속되면 블록 경계)
  const rawBlocks: { y: number; height: number }[] = [];
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
            rawBlocks.push({ y: blockStart, height: blockH });
          }
          inBlock = false;
        }
      }
    }
  }
  // 마지막 블록
  if (inBlock && h - blockStart > 10) {
    rawBlocks.push({ y: blockStart, height: h - blockStart });
  }

  // 3. 작은 블록을 인접한 블록에 병합 (선택지/소문항이 따로 잡힌 경우)
  const blocks: { y: number; height: number }[] = [];
  for (let i = 0; i < rawBlocks.length; i++) {
    const cur = rawBlocks[i];
    if (cur.height >= minBlockH) {
      blocks.push(cur);
    } else {
      // 작은 블록 → 가장 가까운 (이전/다음) 블록에 병합
      if (blocks.length > 0) {
        // 이전 블록에 병합 (이전 블록 끝 ~ 현재 블록 끝까지 확장)
        const prev = blocks[blocks.length - 1];
        const mergedEnd = cur.y + cur.height;
        prev.height = mergedEnd - prev.y;
      } else if (i + 1 < rawBlocks.length) {
        // 다음 블록에 병합 (현재 블록 시작부터)
        const next = rawBlocks[i + 1];
        next.height = (next.y + next.height) - cur.y;
        next.y = cur.y;
      }
      // 둘 다 없으면 작은 블록 버림 (노이즈)
    }
  }

  // 빈 행 통계 (디버그)
  let emptyRowCount = 0;
  let maxGap = 0;
  let currentGap = 0;
  for (let y = 0; y < h; y++) {
    if (hasContentRow[y] === 0) { emptyRowCount++; currentGap++; }
    else { if (currentGap > maxGap) maxGap = currentGap; currentGap = 0; }
  }
  if (currentGap > maxGap) maxGap = currentGap;
  console.log(`[getMultiBlocks] 영역(${w}x${h}) sensitivity=${sensitivity}, 빈행=${emptyRowCount}/${h}, 최대갭=${maxGap}px, marginX=${marginX}, minDark=${minDarkPixels} → ${blocks.length}개 블록`);

  // 3. 0개 → 빈 배열 반환 (유령 블록 방지)
  if (blocks.length === 0) {
    return [];
  }

  // 4. 각 블록을 절대좌표로 변환 → tight bbox → 비율 변환
  return blocks.map(block => {
    const blockRect: AbsoluteRect = {
      x: startX,
      y: startY + block.y,
      width: w,
      height: block.height,
    };
    const refined = getContentBoundsAbs(canvas, blockRect);
    if (!refined) return null;
    return {
      x: refined.x / canvas.width,
      y: refined.y / canvas.height,
      w: refined.width / canvas.width,
      h: refined.height / canvas.height,
    };
  }).filter((r): r is CropRect => r !== null);
}

/**
 * 페이지를 좌/우 반으로 나눠서 각각 완전히 독립적으로 스캔 후 결과 합침
 *
 * 시험지는 한 페이지를 한꺼번에 스캔하면 인식이 안 됨 (모든 캡처 프로그램의 공통 문제).
 * 반으로 나눈 뒤 좌측 처음~끝, 우측 처음~끝 순서로 스캔해야 문제가 정확하게 분리됨.
 *
 * columns=1이면 전체 페이지 1번 스캔 (워크시트 등 1단 문서용)
 */
export function analyzePageBlocksSplit(
  canvas: HTMLCanvasElement,
  columns: 1 | 2 = 2,
  sensitivityOverride?: number
): CropRect[] {
  // ★ 수동 드래그와 동일한 sensitivity=30 기본값 사용
  const sensitivity = sensitivityOverride ?? 30;

  // 헤더/푸터 대략적 ROI (getContentBoundsAbs가 정밀하게 잡으므로 넉넉하게)
  const headerY = EXAM_HEADER_RATIO;
  const footerY = EXAM_FOOTER_RATIO;
  const contentH = footerY - headerY;

  if (columns === 1) {
    // 1단 모드: 헤더/푸터 제외한 전체 영역을 바로 getMultiBlocks에 넘김
    const fullRect: CropRect = {
      x: 0,
      y: headerY,
      w: 1,
      h: contentH,
    };
    return getMultiBlocks(canvas, fullRect, sensitivity);
  }

  // ★ 2단 모드: 헤더/푸터 제외한 좌/우 반을 각각 getMultiBlocks에 넘김
  // getMultiBlocks 내부의 marginX(10%)와 minDarkPixels(1%)가 세로선/테두리를 무시
  const halfW = 0.5; // 비율 기준

  // 좌측 반
  const leftRect: CropRect = { x: 0, y: headerY, w: halfW, h: contentH };
  const leftBlocks = getMultiBlocks(canvas, leftRect, sensitivity);

  // 우측 반
  const rightRect: CropRect = { x: halfW, y: headerY, w: 1 - halfW, h: contentH };
  const rightBlocks = getMultiBlocks(canvas, rightRect, sensitivity);

  // 각 반쪽 내 Y좌표로 정렬
  leftBlocks.sort((a, b) => a.y - b.y);
  rightBlocks.sort((a, b) => a.y - b.y);

  console.log(`[AutoCrop Split] 좌측 ${leftBlocks.length}블록, 우측 ${rightBlocks.length}블록 (총 ${leftBlocks.length + rightBlocks.length}), sensitivity=${sensitivity}`);

  return [...leftBlocks, ...rightBlocks];
}
