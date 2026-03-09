// ============================================================================
// image-upscaler.ts — 스캔 문서 최적화 이미지 업스케일러
// 원본 크롭 이미지를 고품질로 업스케일하여 AI 생성 없이 바로 사용
// ============================================================================

import sharp from 'sharp';

// ============================================================================
// 타입 정의
// ============================================================================

export interface CropQualityResult {
  /** 원본 너비 (px) */
  width: number;
  /** 원본 높이 (px) */
  height: number;
  /** 사용 가능 여부 */
  isUsable: boolean;
  /** 품질 점수 (0~1) */
  score: number;
  /** 판단 사유 */
  reason: string;
}

export interface UpscaleResult {
  /** 업스케일된 이미지 base64 (data URI 아님, raw base64) */
  base64: string;
  /** MIME type */
  contentType: string;
  /** 업스케일 후 너비 */
  width: number;
  /** 업스케일 후 높이 */
  height: number;
  /** 적용된 스케일 배율 */
  scale: number;
}

// ============================================================================
// 설정
// ============================================================================

/** 최소 사용 가능 해상도 (이보다 작으면 AI 생성 폴백) */
const MIN_USABLE_WIDTH = 80;
const MIN_USABLE_HEIGHT = 60;

/** 업스케일 목표 최소 너비 (교재 인쇄 품질 수준) */
const TARGET_MIN_WIDTH = 600;

/** 최대 업스케일 배율 (너무 크면 픽셀화 발생) */
const MAX_SCALE = 4;

/** 최대 출력 해상도 (메모리 절약) */
const MAX_OUTPUT_WIDTH = 1200;
const MAX_OUTPUT_HEIGHT = 1600;

// ============================================================================
// 품질 평가
// ============================================================================

/**
 * 크롭 이미지의 품질을 평가하여 업스케일 사용 가능 여부 판단
 *
 * @param imageBuffer 이미지 바이너리 데이터
 * @returns 품질 평가 결과
 */
export async function assessCropQuality(
  imageBuffer: Buffer
): Promise<CropQualityResult> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // 1. 크기가 너무 작으면 사용 불가
    if (width < MIN_USABLE_WIDTH || height < MIN_USABLE_HEIGHT) {
      return {
        width,
        height,
        isUsable: false,
        score: 0.1,
        reason: `해상도 너무 낮음 (${width}x${height} < ${MIN_USABLE_WIDTH}x${MIN_USABLE_HEIGHT})`,
      };
    }

    // 2. 가로세로 비율 체크 (극단적인 비율은 잘못된 크롭일 가능성)
    const aspectRatio = width / height;
    if (aspectRatio > 10 || aspectRatio < 0.1) {
      return {
        width,
        height,
        isUsable: false,
        score: 0.15,
        reason: `비정상 비율 (${aspectRatio.toFixed(2)})`,
      };
    }

    // 3. 이미지 통계로 내용물 확인 (거의 빈 이미지 거르기)
    const stats = await sharp(imageBuffer).stats();
    const channels = stats.channels;

    // 전체 채널의 평균 밝기 — 거의 완전 흰색(>250)이면 빈 이미지
    const avgBrightness = channels.reduce((sum, ch) => sum + ch.mean, 0) / channels.length;
    if (avgBrightness > 252) {
      return {
        width,
        height,
        isUsable: false,
        score: 0.1,
        reason: `거의 빈 이미지 (평균 밝기 ${avgBrightness.toFixed(1)})`,
      };
    }

    // 전체 채널 표준편차 — 너무 낮으면 단색에 가까움
    const avgStdDev = channels.reduce((sum, ch) => sum + ch.stdev, 0) / channels.length;
    if (avgStdDev < 5) {
      return {
        width,
        height,
        isUsable: false,
        score: 0.15,
        reason: `단색에 가까운 이미지 (stdev ${avgStdDev.toFixed(1)})`,
      };
    }

    // 4. 해상도 기반 품질 점수 계산
    const pixelCount = width * height;
    let score: number;
    if (pixelCount >= 400 * 400) {
      score = 0.95; // 충분히 큰 이미지
    } else if (pixelCount >= 200 * 200) {
      score = 0.75; // 중간 크기
    } else if (pixelCount >= 100 * 100) {
      score = 0.55; // 작지만 사용 가능
    } else {
      score = 0.35; // 매우 작지만 최소 기준 통과
    }

    // 표준편차가 높을수록 내용이 풍부 → 점수 보너스
    if (avgStdDev > 40) score = Math.min(1.0, score + 0.05);

    return {
      width,
      height,
      isUsable: true,
      score,
      reason: `사용 가능 (${width}x${height}, score=${score.toFixed(2)})`,
    };
  } catch (error) {
    console.error('[image-upscaler] assessCropQuality error:', error);
    return {
      width: 0,
      height: 0,
      isUsable: false,
      score: 0,
      reason: `이미지 분석 실패: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  }
}

// ============================================================================
// 업스케일 처리
// ============================================================================

/**
 * 스캔 문서 크롭 이미지를 고품질로 업스케일
 *
 * 최적화 사항:
 * - Lanczos3 리샘플링 (스캔 문서에 최적)
 * - 업스케일 후 선명도 보정 (unsharp mask)
 * - 대비 향상 (스캔 문서의 흐릿한 텍스트/선 강화)
 * - PNG 출력 (무손실)
 *
 * @param imageBuffer 원본 이미지 바이너리
 * @param targetMinWidth 목표 최소 너비 (기본 600px)
 * @returns 업스케일 결과
 */
export async function upscaleCropImage(
  imageBuffer: Buffer,
  targetMinWidth: number = TARGET_MIN_WIDTH
): Promise<UpscaleResult> {
  const metadata = await sharp(imageBuffer).metadata();
  const origWidth = metadata.width || 1;
  const origHeight = metadata.height || 1;

  // 스케일 계산 — 최소 너비 목표에 맞춤
  let scale = targetMinWidth / origWidth;

  // 이미 충분히 크면 최소 1.5x 업스케일 (선명도 개선용)
  if (scale < 1.0) {
    scale = 1.0; // 이미 목표보다 크면 리사이즈하지 않음
  }

  // 최대 배율 제한
  scale = Math.min(scale, MAX_SCALE);

  // 출력 크기 계산
  let outWidth = Math.round(origWidth * scale);
  let outHeight = Math.round(origHeight * scale);

  // 최대 출력 해상도 제한
  if (outWidth > MAX_OUTPUT_WIDTH) {
    const factor = MAX_OUTPUT_WIDTH / outWidth;
    outWidth = MAX_OUTPUT_WIDTH;
    outHeight = Math.round(outHeight * factor);
    scale = outWidth / origWidth;
  }
  if (outHeight > MAX_OUTPUT_HEIGHT) {
    const factor = MAX_OUTPUT_HEIGHT / outHeight;
    outHeight = MAX_OUTPUT_HEIGHT;
    outWidth = Math.round(outWidth * factor);
    scale = outWidth / origWidth;
  }

  console.log(`[image-upscaler] Upscaling: ${origWidth}x${origHeight} → ${outWidth}x${outHeight} (${scale.toFixed(2)}x)`);

  // Sharp 파이프라인 구성
  let pipeline = sharp(imageBuffer);

  // Step 1: 컬러스페이스 정규화 (sRGB로 통일)
  pipeline = pipeline.toColorspace('srgb');

  // Step 2: 업스케일 (Lanczos3 — 스캔 문서의 날카로운 엣지 보존에 최적)
  if (scale > 1.0) {
    pipeline = pipeline.resize(outWidth, outHeight, {
      kernel: sharp.kernel.lanczos3,
      fit: 'fill',
      fastShrinkOnLoad: false,  // 정확한 리샘플링 보장
    });
  }

  // Step 3: 스캔 문서 최적화 — 선명도 보정 (Unsharp Mask)
  // sharpen(sigma, flat, jagged)
  // sigma: 블러 반경, flat: 평탄 영역 임계값, jagged: 날카로운 엣지 임계값
  pipeline = pipeline.sharpen(1.0, 1.0, 2.0);

  // Step 4: 대비 미세 조정 (스캔 문서의 흐릿한 부분 강화)
  // linear() = 간단한 brightness/contrast 조정
  // a*pixel + b: a=1.05 (약간 대비 증가), b=-5 (약간 어둡게 → 잉크/선 강화)
  pipeline = pipeline.linear(1.05, -5);

  // Step 5: PNG 출력 (무손실, 적당한 압축)
  const outputBuffer = await pipeline
    .png({
      compressionLevel: 6,   // 0~9 (6 = 밸런스)
      adaptiveFiltering: true, // 더 나은 압축
    })
    .toBuffer();

  const base64 = outputBuffer.toString('base64');

  console.log(`[image-upscaler] Output: ${outWidth}x${outHeight}, ${Math.round(outputBuffer.length / 1024)}KB`);

  return {
    base64,
    contentType: 'image/png',
    width: outWidth,
    height: outHeight,
    scale: parseFloat(scale.toFixed(2)),
  };
}

// ============================================================================
// 통합 함수: 평가 + 업스케일 (generate-figure에서 호출)
// ============================================================================

/**
 * 크롭 이미지를 평가하고, 사용 가능하면 업스케일하여 반환
 *
 * @param imageBuffer 원본 이미지 바이너리
 * @returns 업스케일 결과 또는 null (AI 생성 폴백 필요)
 */
export async function tryUpscaleCrop(
  imageBuffer: Buffer
): Promise<{ quality: CropQualityResult; upscaled: UpscaleResult } | null> {
  // 1. 품질 평가
  const quality = await assessCropQuality(imageBuffer);
  console.log(`[image-upscaler] Quality assessment: ${quality.reason}`);

  if (!quality.isUsable) {
    console.log(`[image-upscaler] Crop not usable → fallback to AI generation`);
    return null;
  }

  // 2. 업스케일 실행
  try {
    const upscaled = await upscaleCropImage(imageBuffer);
    return { quality, upscaled };
  } catch (error) {
    console.error('[image-upscaler] Upscale failed:', error);
    return null;
  }
}
