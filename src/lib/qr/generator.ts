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
 * 세션 URL 빌더 — origin + /grade/[session_id]
 * origin 을 인자로 받아 서버/클라이언트 어디서든 일관된 URL 생성.
 */
export function buildSessionUrl(sessionId: string, origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/grade/${sessionId}`;
}
