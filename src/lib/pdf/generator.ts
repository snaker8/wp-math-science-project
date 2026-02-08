// ============================================================================
// PDF Generator Utility
// html2canvas + jsPDF를 사용한 고품질 PDF 생성
// ============================================================================

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { PDFExamConfig } from '@/types/pdf';

interface GeneratePDFOptions {
  element: HTMLElement;
  config: PDFExamConfig;
  filename?: string;
  onProgress?: (progress: number) => void;
}

export async function generatePDF({
  element,
  config,
  filename = 'exam.pdf',
  onProgress,
}: GeneratePDFOptions): Promise<Blob> {
  onProgress?.(10);

  // 1. 수식이 완전히 렌더링될 때까지 대기
  await waitForMathRendering(element);
  onProgress?.(20);

  // 2. html2canvas 설정 (고해상도)
  
  const canvas = await html2canvas(element, {
    scale: 2, // 고해상도 (2x)
    useCORS: true, // 외부 이미지 허용
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    // 수식 렌더링 최적화
    onclone: (clonedDoc: Document) => {
      // KaTeX 스타일 복사
      const katexStyles = document.querySelectorAll('link[href*="katex"], style');
      katexStyles.forEach((style) => {
        const clone = style.cloneNode(true);
        clonedDoc.head.appendChild(clone);
      });

      // 폰트 로딩 대기
      return new Promise((resolve) => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => resolve(undefined));
        } else {
          setTimeout(() => resolve(undefined), 100);
        }
      });
    },
  } as any);
  onProgress?.(60);

  // 3. PDF 생성
  const imgData = canvas.toDataURL('image/png', 1.0);

  // A4 크기 (mm)
  const pdfWidth = config.pageSize === 'A4' ? 210 : 215.9; // A4 or Letter
  const pdfHeight = config.pageSize === 'A4' ? 297 : 279.4;

  // 캔버스 비율 계산
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const ratio = imgWidth / imgHeight;

  // PDF 페이지에 맞추기
  let finalWidth = pdfWidth;
  let finalHeight = pdfWidth / ratio;

  // 여러 페이지 필요한 경우 처리
  const pdf = new jsPDF({
    orientation: config.orientation,
    unit: 'mm',
    format: config.pageSize.toLowerCase() as 'a4' | 'letter',
  });

  onProgress?.(80);

  // 단일 페이지인 경우
  if (finalHeight <= pdfHeight) {
    pdf.addImage(imgData, 'PNG', 0, 0, finalWidth, finalHeight);
  } else {
    // 여러 페이지 분할
    let position = 0;
    let remainingHeight = imgHeight;
    const pageHeightInPixels = (pdfHeight / pdfWidth) * imgWidth;

    let pageCount = 0;
    while (remainingHeight > 0) {
      if (pageCount > 0) {
        pdf.addPage();
      }

      // 현재 페이지에 해당하는 부분 추출
      const sourceY = position;
      const sourceHeight = Math.min(pageHeightInPixels, remainingHeight);

      // 캔버스에서 해당 부분만 추출
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = imgWidth;
      pageCanvas.height = sourceHeight;
      const ctx = pageCanvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(
          canvas,
          0,
          sourceY,
          imgWidth,
          sourceHeight,
          0,
          0,
          imgWidth,
          sourceHeight
        );

        const pageImgData = pageCanvas.toDataURL('image/png', 1.0);
        const pageImgHeight = (sourceHeight / imgWidth) * pdfWidth;

        pdf.addImage(pageImgData, 'PNG', 0, 0, pdfWidth, pageImgHeight);
      }

      position += sourceHeight;
      remainingHeight -= sourceHeight;
      pageCount++;
    }
  }

  onProgress?.(100);

  // Blob으로 반환
  return pdf.output('blob');
}

/**
 * PDF 직접 다운로드
 */
export async function downloadPDF(options: GeneratePDFOptions): Promise<void> {
  const blob = await generatePDF(options);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = options.filename || 'exam.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * 수식 렌더링 완료 대기
 */
async function waitForMathRendering(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    // KaTeX 요소가 있는지 확인
    const mathElements = element.querySelectorAll('.katex, .katex-display, .MathJax');

    if (mathElements.length === 0) {
      resolve();
      return;
    }

    // 모든 수식이 렌더링될 때까지 대기
    const checkRendering = () => {
      const allRendered = Array.from(mathElements).every((el) => {
        // KaTeX 요소의 크기가 0이 아닌지 확인
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      if (allRendered) {
        // 추가 대기 (안정화)
        setTimeout(resolve, 100);
      } else {
        requestAnimationFrame(checkRendering);
      }
    };

    checkRendering();
  });
}

/**
 * 이미지를 Base64로 변환
 */
export function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
