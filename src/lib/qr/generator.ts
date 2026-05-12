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
