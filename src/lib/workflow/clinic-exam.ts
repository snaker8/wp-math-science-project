// ============================================================================
// Clinic Exam Generator - 클리닉 시험지 PDF 생성
// 오답 문제 + 쌍둥이 문제를 묶어 PDF로 변환
// ============================================================================

import type { TwinProblem, ClinicExam } from '@/types/workflow';

// ============================================================================
// Clinic Exam 데이터 생성
// ============================================================================

export interface ClinicExamProblem {
  sequence: number;
  type: 'original' | 'twin';
  problemId: string;
  typeCode: string;
  typeName: string;
  contentLatex: string;
  contentHtml: string;
  solutionLatex?: string;
  solutionHtml?: string;
  answer?: string;
  originalProblemId?: string; // twin인 경우 원본 ID
}

export interface ClinicExamData {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  subtitle?: string;
  problems: ClinicExamProblem[];
  includeOriginals: boolean;
  includeSolutions: boolean;
  createdAt: string;
  metadata: {
    totalProblems: number;
    originalCount: number;
    twinCount: number;
    typeBreakdown: Record<string, number>;
  };
}

/**
 * 클리닉 시험지 데이터 생성
 */
export function createClinicExamData(
  studentId: string,
  studentName: string,
  wrongProblems: Array<{
    id: string;
    contentLatex: string;
    contentHtml?: string;
    solutionLatex?: string;
    typeCode: string;
    typeName: string;
    answer?: string;
  }>,
  twinProblems: TwinProblem[],
  options: {
    title?: string;
    includeOriginals?: boolean;
    includeSolutions?: boolean;
  } = {}
): ClinicExamData {
  const {
    title = `${studentName} 클리닉 시험지`,
    includeOriginals = true,
    includeSolutions = false,
  } = options;

  const problems: ClinicExamProblem[] = [];
  let sequence = 1;

  // 원본 오답 문제 추가 (선택적)
  if (includeOriginals) {
    for (const problem of wrongProblems) {
      problems.push({
        sequence: sequence++,
        type: 'original',
        problemId: problem.id,
        typeCode: problem.typeCode,
        typeName: problem.typeName,
        contentLatex: problem.contentLatex,
        contentHtml: problem.contentHtml || '',
        solutionLatex: includeSolutions ? problem.solutionLatex : undefined,
        answer: problem.answer,
      });
    }
  }

  // 쌍둥이 문제 추가
  for (const twin of twinProblems) {
    const originalProblem = wrongProblems.find((p) => p.id === twin.originalProblemId);
    problems.push({
      sequence: sequence++,
      type: 'twin',
      problemId: twin.id,
      typeCode: twin.originalTypeCode,
      typeName: originalProblem?.typeName || '유사 문제',
      contentLatex: twin.contentLatex,
      contentHtml: twin.contentHtml,
      solutionLatex: includeSolutions ? twin.solutionLatex : undefined,
      solutionHtml: includeSolutions ? twin.solutionHtml : undefined,
      answer: twin.answer,
      originalProblemId: twin.originalProblemId,
    });
  }

  // 유형별 통계
  const typeBreakdown: Record<string, number> = {};
  for (const problem of problems) {
    typeBreakdown[problem.typeCode] = (typeBreakdown[problem.typeCode] || 0) + 1;
  }

  return {
    id: crypto.randomUUID(),
    studentId,
    studentName,
    title,
    subtitle: `생성일: ${new Date().toLocaleDateString('ko-KR')}`,
    problems,
    includeOriginals,
    includeSolutions,
    createdAt: new Date().toISOString(),
    metadata: {
      totalProblems: problems.length,
      originalCount: includeOriginals ? wrongProblems.length : 0,
      twinCount: twinProblems.length,
      typeBreakdown,
    },
  };
}

// ============================================================================
// PDF 템플릿 HTML 생성
// ============================================================================

export function generateClinicPdfHtml(examData: ClinicExamData): string {
  const problemsHtml = examData.problems
    .map(
      (problem) => `
        <div class="problem ${problem.type}">
          <div class="problem-header">
            <span class="problem-number">${problem.sequence}</span>
            <span class="problem-type ${problem.type === 'twin' ? 'twin-badge' : ''}">${
              problem.type === 'twin' ? '🔄 유사문제' : '📝 원본문제'
            }</span>
            <span class="type-code">${problem.typeCode}</span>
          </div>
          <div class="problem-content">
            ${problem.contentHtml || `<div class="latex">${problem.contentLatex}</div>`}
          </div>
          ${
            examData.includeSolutions && problem.solutionLatex
              ? `
            <div class="solution">
              <div class="solution-header">풀이</div>
              <div class="solution-content">
                ${problem.solutionHtml || problem.solutionLatex}
              </div>
              ${problem.answer ? `<div class="answer">정답: ${problem.answer}</div>` : ''}
            </div>
          `
              : ''
          }
        </div>
      `
    )
    .join('\n');

  return `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>${examData.title}</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Noto Sans KR', sans-serif;
          font-size: 11pt;
          line-height: 1.6;
          color: #1f2937;
          background: white;
        }

        .page {
          width: 210mm;
          min-height: 297mm;
          padding: 20mm;
          margin: 0 auto;
          background: white;
        }

        @media print {
          .page {
            padding: 15mm;
            page-break-after: always;
          }
        }

        /* 헤더 */
        .header {
          text-align: center;
          padding-bottom: 20px;
          border-bottom: 2px solid #1f2937;
          margin-bottom: 24px;
        }

        .header h1 {
          font-size: 20pt;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 8px;
        }

        .header .subtitle {
          font-size: 10pt;
          color: #6b7280;
        }

        .header .student-info {
          margin-top: 12px;
          font-size: 11pt;
        }

        /* 메타 정보 */
        .exam-meta {
          display: flex;
          justify-content: space-between;
          padding: 12px 16px;
          background: #f9fafb;
          border-radius: 8px;
          margin-bottom: 24px;
          font-size: 10pt;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* 문제 */
        .problem {
          margin-bottom: 24px;
          padding: 16px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          page-break-inside: avoid;
        }

        .problem.twin {
          border-color: #c7d2fe;
          background: #fafafe;
        }

        .problem-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e5e7eb;
        }

        .problem-number {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: #1f2937;
          color: white;
          border-radius: 50%;
          font-size: 12pt;
          font-weight: 700;
        }

        .problem-type {
          font-size: 9pt;
          padding: 2px 8px;
          border-radius: 4px;
          background: #e5e7eb;
          color: #4b5563;
        }

        .twin-badge {
          background: #eef2ff;
          color: #4f46e5;
        }

        .type-code {
          font-size: 9pt;
          color: #9ca3af;
          margin-left: auto;
        }

        .problem-content {
          font-size: 11pt;
          line-height: 1.8;
        }

        .problem-content .latex {
          font-family: 'Times New Roman', serif;
        }

        /* 풀이 */
        .solution {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px dashed #d1d5db;
        }

        .solution-header {
          font-size: 10pt;
          font-weight: 600;
          color: #4f46e5;
          margin-bottom: 8px;
        }

        .solution-content {
          font-size: 10pt;
          color: #4b5563;
        }

        .answer {
          margin-top: 8px;
          padding: 8px 12px;
          background: #dcfce7;
          border-radius: 4px;
          font-size: 10pt;
          font-weight: 600;
          color: #16a34a;
        }

        /* 푸터 */
        .footer {
          margin-top: 40px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 9pt;
          color: #9ca3af;
        }

        /* 답안 작성란 */
        .answer-space {
          margin-top: 16px;
          padding: 20px;
          border: 1px dashed #d1d5db;
          border-radius: 8px;
          min-height: 80px;
          background: #fafafa;
        }

        .answer-space-label {
          font-size: 9pt;
          color: #9ca3af;
          margin-bottom: 8px;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <header class="header">
          <h1>${examData.title}</h1>
          <div class="subtitle">${examData.subtitle || ''}</div>
          <div class="student-info">
            학생: <strong>${examData.studentName}</strong>
          </div>
        </header>

        <div class="exam-meta">
          <div class="meta-item">
            📋 총 ${examData.metadata.totalProblems}문제
          </div>
          ${examData.includeOriginals ? `<div class="meta-item">📝 원본 ${examData.metadata.originalCount}문제</div>` : ''}
          <div class="meta-item">
            🔄 유사문제 ${examData.metadata.twinCount}문제
          </div>
        </div>

        ${problemsHtml}

        <footer class="footer">
          과사람 완전학습 시스템 | 클리닉 시험지
        </footer>
      </div>
    </body>
    </html>
  `;
}

// ============================================================================
// PDF 생성 (서버사이드)
// ============================================================================

export async function generateClinicPdf(
  examData: ClinicExamData
): Promise<{ pdfUrl: string; blob?: Blob }> {
  const html = generateClinicPdfHtml(examData);

  // 클라이언트 사이드에서는 html2canvas + jspdf 사용
  // 서버 사이드에서는 puppeteer 등 사용 (여기서는 HTML 반환)

  // 임시: HTML을 Base64로 인코딩하여 반환
  const base64Html = Buffer.from(html).toString('base64');
  const dataUrl = `data:text/html;base64,${base64Html}`;

  return {
    pdfUrl: dataUrl,
  };
}

// ============================================================================
// ClinicExam 엔티티 생성
// ============================================================================

export function createClinicExam(
  examData: ClinicExamData,
  pdfUrl?: string
): ClinicExam {
  return {
    id: examData.id,
    studentId: examData.studentId,
    title: examData.title,
    wrongProblemIds: examData.problems
      .filter((p) => p.type === 'original')
      .map((p) => p.problemId),
    twinProblemIds: examData.problems
      .filter((p) => p.type === 'twin')
      .map((p) => p.problemId),
    status: 'GENERATED',
    pdfUrl,
    createdAt: examData.createdAt,
  };
}
