// ============================================================================
// Mathpix API Service
// ============================================================================

import type { MathpixRequestOptions, MathpixResponse } from '@/types/ocr';

const MATHPIX_API_URL = 'https://api.mathpix.com/v3/text';

/**
 * Mathpix API 클라이언트
 */
export class MathpixClient {
  private appId: string;
  private appKey: string;

  constructor() {
    this.appId = process.env.MATHPIX_APP_ID!;
    this.appKey = process.env.MATHPIX_APP_KEY!;

    if (!this.appId || !this.appKey) {
      throw new Error('Mathpix API credentials not configured');
    }
  }

  /**
   * 이미지/PDF를 Mathpix API로 전송하여 OCR 처리
   */
  async processImage(imageData: string | Buffer, options?: Partial<MathpixRequestOptions>): Promise<MathpixResponse> {
    // Base64 데이터 URL 형식으로 변환
    const src = this.prepareImageSource(imageData);

    const requestBody: MathpixRequestOptions = {
      src,
      formats: ['text', 'data', 'latex_styled'],
      data_options: {
        include_latex: true,
        include_asciimath: false,
        include_mathml: false,
        include_svg: false,
        include_table_html: true,
      },
      include_line_data: true,
      include_word_data: false,
      ...options,
    };

    const response = await fetch(MATHPIX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'app_id': this.appId,
        'app_key': this.appKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new MathpixError(
        `Mathpix API error: ${response.status}`,
        'MATHPIX_API_ERROR',
        { status: response.status, body: errorText }
      );
    }

    const result: MathpixResponse = await response.json();

    if (result.error) {
      throw new MathpixError(
        result.error_info?.message || result.error,
        'MATHPIX_PROCESSING_ERROR',
        { error_info: result.error_info }
      );
    }

    return result;
  }

  /**
   * PDF 파일 처리 (멀티 페이지)
   */
  async processPDF(pdfBuffer: Buffer): Promise<MathpixResponse[]> {
    console.log('[Mathpix] Processing PDF, buffer size:', pdfBuffer.length, 'bytes');

    // PDF 전체를 하나의 요청으로 처리 (Mathpix v3/pdf 엔드포인트)
    const response = await this.processPDFBatch(pdfBuffer);

    console.log('[Mathpix] PDF response received:', {
      hasText: !!response.text,
      textLength: response.text?.length || 0,
      hasLatexStyled: !!response.latex_styled,
      latexStyledLength: response.latex_styled?.length || 0,
      confidence: response.confidence,
    });

    if (response.text) {
      console.log('[Mathpix] First 500 chars of response text:', response.text.substring(0, 500));
    }

    return [response];
  }


  /**
   * PDF 배치 처리 (Mathpix PDF 엔드포인트)
   */
  private async processPDFBatch(pdfBuffer: Buffer): Promise<MathpixResponse> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
    formData.append('file', blob, 'document.pdf');

    // Mathpix PDF API 옵션 (.mmd 결과는 처리 후 자동으로 제공됨)
    const optionsPayload = {
      math_inline_delimiters: ['$', '$'],
      math_display_delimiters: ['$$', '$$'],
      rm_spaces: true,
    };


    formData.append('options_json', JSON.stringify(optionsPayload));

    console.log('[Mathpix] Sending PDF to API...');

    const response = await fetch('https://api.mathpix.com/v3/pdf', {
      method: 'POST',
      headers: {
        'app_id': this.appId,
        'app_key': this.appKey,
      },
      body: formData,
    });

    console.log('[Mathpix] API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Mathpix] API error response:', errorText);
      throw new MathpixError(
        `Mathpix PDF API error: ${response.status}`,
        'MATHPIX_PDF_ERROR',
        { status: response.status, body: errorText }
      );
    }

    // PDF 처리는 비동기 작업일 수 있음 - 폴링 필요
    const result = await response.json();
    console.log('[Mathpix] Initial response:', JSON.stringify(result).substring(0, 500));

    // pdf_id가 반환되면 결과 폴링
    if (result.pdf_id) {
      console.log('[Mathpix] Got pdf_id:', result.pdf_id, '- starting polling...');
      return await this.pollPDFResult(result.pdf_id);
    }

    console.log('[Mathpix] No pdf_id in response, returning result directly');
    return result;
  }


  /**
   * PDF 처리 결과 폴링
   */
  private async pollPDFResult(pdfId: string, maxAttempts = 30): Promise<MathpixResponse> {
    const pollUrl = `https://api.mathpix.com/v3/pdf/${pdfId}`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`[Mathpix] Polling attempt ${attempt + 1}/${maxAttempts}...`);

      const response = await fetch(pollUrl, {
        headers: {
          'app_id': this.appId,
          'app_key': this.appKey,
        },
      });

      const result = await response.json();
      console.log(`[Mathpix] Poll status: ${result.status}`);

      if (result.status === 'completed') {
        // Mathpix Markdown 결과 가져오기 (.mmd 형식)
        console.log('[Mathpix] Fetching .mmd result...');
        const authHeaders = {
          'app_id': this.appId,
          'app_key': this.appKey,
        };

        const mmdResponse = await fetch(`${pollUrl}.mmd`, { headers: authHeaders });
        const mmdText = await mmdResponse.text();
        console.log(`[Mathpix] Got MMD text, length: ${mmdText.length} chars`);

        // lines.json 가져오기 (페이지별 라인 데이터 + bbox)
        let linesData = undefined;
        try {
          console.log('[Mathpix] Fetching .lines.json for bbox data...');
          const linesResponse = await fetch(`${pollUrl}.lines.json`, { headers: authHeaders });
          if (linesResponse.ok) {
            linesData = await linesResponse.json();
            const pageCount = linesData?.pages?.length || 0;
            const totalLines = linesData?.pages?.reduce((sum: number, p: any) => sum + (p.lines?.length || 0), 0) || 0;
            console.log(`[Mathpix] Got lines.json: ${pageCount} pages, ${totalLines} lines`);
          } else {
            console.warn('[Mathpix] lines.json fetch failed:', linesResponse.status);
          }
        } catch (linesErr) {
          console.warn('[Mathpix] lines.json fetch error (non-fatal):', linesErr);
        }

        return {
          request_id: pdfId,
          text: mmdText,
          latex_styled: mmdText,
          confidence: result.confidence || 0.9,
          lines_data: linesData,
        };
      }


      if (result.status === 'error') {
        throw new MathpixError(
          'PDF processing failed',
          'MATHPIX_PDF_PROCESSING_FAILED',
          result
        );
      }

      // 2초 대기 후 재시도
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new MathpixError(
      'PDF processing timeout',
      'MATHPIX_PDF_TIMEOUT',
      { pdfId }
    );
  }

  /**
   * 이미지 소스 준비 (Base64 Data URL 형식)
   */
  private prepareImageSource(imageData: string | Buffer): string {
    if (typeof imageData === 'string') {
      // 이미 Data URL 형식인 경우
      if (imageData.startsWith('data:')) {
        return imageData;
      }
      // URL인 경우
      if (imageData.startsWith('http')) {
        return imageData;
      }
      // Base64 문자열인 경우
      return `data:image/png;base64,${imageData}`;
    }

    // Buffer인 경우 Base64로 변환
    const base64 = imageData.toString('base64');
    const mimeType = this.detectMimeType(imageData);
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * MIME 타입 감지
   */
  private detectMimeType(buffer: Buffer): string {
    // Magic bytes로 파일 타입 감지
    const header = buffer.slice(0, 4);

    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
      return 'image/png';
    }
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return 'image/jpeg';
    }
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
      return 'image/gif';
    }
    if (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) {
      return 'application/pdf';
    }

    return 'image/png'; // 기본값
  }
}

/**
 * Mathpix 에러 클래스
 */
export class MathpixError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'MathpixError';
    this.code = code;
    this.details = details;
  }
}

// 싱글톤 인스턴스
let mathpixClient: MathpixClient | null = null;

export function getMathpixClient(): MathpixClient {
  if (!mathpixClient) {
    mathpixClient = new MathpixClient();
  }
  return mathpixClient;
}
