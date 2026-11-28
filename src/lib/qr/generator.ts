// ============================================================================
// QR 코드 생성 유틸리티
//
// 서버/클라이언트 양쪽에서 호출 가능. `qrcode` npm 패키지 사용.
// ============================================================================

import QRCode from 'qrcode';

/**
 * URL 을 data URL (base64 PNG) 로 인코딩.
 * PDF 삽입용.
 */
export async function generateQRDataUrl(url: string, size = 256): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: size,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

/**
 * URL 을 SVG 문자열로 인코딩 (벡터, PDF 에 더 선명하게 삽입).
 */
export async function generateQRSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
  });
}

/**
 * ★ 인쇄물(교재·학습지) QR 이 가리키는 주소의 앞부분.
 *   책에 한 번 찍히면 바꿀 수 없으므로 요청 주소(localhost·프리뷰)를 쓰지 않고 운영 주소로 고정한다.
 *   2026-11-28 대표 결정: 지금 주소 그대로. 도메인을 바꾸면 이 주소가 계속 살아 있게(리다이렉트) 해야 한다.
 */
export const QR_PUBLIC_ORIGIN = (process.env.NEXT_PUBLIC_QR_ORIGIN || 'https://wp-math-science-project.vercel.app').replace(/\/+$/, '');

/** 시험지(교재 단원·학습지) 공용 QR 주소 — 찍으면 학생 풀이 화면으로 (/q/[examId]) */
export function buildExamQrUrl(examId: string): string {
  return `${QR_PUBLIC_ORIGIN}/q/${examId}`;
}

/** QR PNG 바이트 (한글 출력 임베드용). 여백 1모듈, 오류정정 M */
export async function generateQRPng(url: string, size = 360): Promise<Uint8Array> {
  const buf = await QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: size });
  return new Uint8Array(buf);
}

/**
 * 세션 URL 빌더.
 * - mode='grade'  → /grade/[session_id]  (강사 채점 페이지)
 * - mode='answer' → /answer/[session_id] (학생 직접 답 입력 페이지)
 *
 * QR 변형:
 *   variant='teacher' PDF 는 grade URL, variant='student' PDF 는 answer URL 사용.
 */
export function buildSessionUrl(
  sessionId: string,
  origin: string,
  mode: 'grade' | 'answer' = 'grade',
): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/${mode}/${sessionId}`;
}
