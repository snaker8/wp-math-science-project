'use client';

// ============================================================================
// Exam PDF Template Component
// A4 용지 형식의 시험지 템플릿
// ============================================================================

import React, { forwardRef } from 'react';
import type { PDFProblem, PDFExamConfig } from '@/types/pdf';

interface ExamTemplateProps {
  problems: PDFProblem[];
  config: PDFExamConfig;
}

const ExamTemplate = forwardRef<HTMLDivElement, ExamTemplateProps>(
  ({ problems, config }, ref) => {
    // A4 크기 (mm to px 변환: 1mm = 3.78px at 96dpi)
    const A4_WIDTH = 210 * 3.78;  // 793.8px
    const A4_HEIGHT = 297 * 3.78; // 1122.66px

    // 2단 레이아웃용 문제 분할
    const splitProblems = () => {
      if (config.layout === 'single') {
        return [problems];
      }

      const mid = Math.ceil(problems.length / 2);
      return [problems.slice(0, mid), problems.slice(mid)];
    };

    const [leftColumn, rightColumn] = splitProblems();

    return (
      <div
        ref={ref}
        className="exam-template"
        style={{
          width: `${A4_WIDTH}px`,
          minHeight: `${A4_HEIGHT}px`,
          padding: `${config.margin.top}mm ${config.margin.right}mm ${config.margin.bottom}mm ${config.margin.left}mm`,
          backgroundColor: 'white',
          fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif",
          fontSize: `${config.fontSize}pt`,
          lineHeight: 1.6,
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
        {/* 워터마크 */}
        {config.watermark.enabled && (
          <div
            className="watermark"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(-30deg)',
              opacity: config.watermark.opacity,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          >
            {config.watermark.image ? (
              <img
                src={config.watermark.image}
                alt="Watermark"
                style={{
                  maxWidth: '400px',
                  maxHeight: '400px',
                }}
              />
            ) : config.watermark.text ? (
              <span
                style={{
                  fontSize: '72pt',
                  fontWeight: 'bold',
                  color: '#000',
                }}
              >
                {config.watermark.text}
              </span>
            ) : null}
          </div>
        )}

        {/* 헤더 */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '20px',
            paddingBottom: '15px',
            borderBottom: '2px solid #000',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* 좌측: 학원 로고 및 정보 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {config.instituteLogo && (
              <img
                src={config.instituteLogo}
                alt="Institute Logo"
                style={{
                  height: '50px',
                  width: 'auto',
                  objectFit: 'contain',
                }}
              />
            )}
            <div>
              {config.instituteName && (
                <div
                  style={{
                    fontSize: '12pt',
                    fontWeight: 'bold',
                    color: '#333',
                  }}
                >
                  {config.instituteName}
                </div>
              )}
              {config.date && (
                <div style={{ fontSize: '9pt', color: '#666' }}>
                  {config.date}
                </div>
              )}
            </div>
          </div>

          {/* 우측: 시험 정보 및 응시자 정보 */}
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: '18pt',
                fontWeight: 'bold',
                marginBottom: '8px',
              }}
            >
              {config.title}
            </div>
            {config.subtitle && (
              <div
                style={{
                  fontSize: '11pt',
                  color: '#555',
                  marginBottom: '10px',
                }}
              >
                {config.subtitle}
              </div>
            )}

            {/* 응시자 정보 필드 */}
            <div
              style={{
                display: 'flex',
                gap: '15px',
                justifyContent: 'flex-end',
                fontSize: '10pt',
              }}
            >
              {config.showClassField && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>반:</span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '50px',
                      borderBottom: '1px solid #000',
                    }}
                  />
                </div>
              )}
              {config.showNameField && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>성명:</span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '80px',
                      borderBottom: '1px solid #000',
                    }}
                  />
                </div>
              )}
              {config.showScoreField && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>점수:</span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '50px',
                      borderBottom: '1px solid #000',
                    }}
                  />
                  <span>/ 100</span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 본문 - 문제 영역 */}
        <main
          style={{
            display: config.layout === 'two-column' ? 'grid' : 'block',
            gridTemplateColumns: config.layout === 'two-column' ? '1fr 1fr' : '1fr',
            gap: '20px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {config.layout === 'two-column' ? (
            <>
              {/* 좌측 컬럼 */}
              <div className="column left-column">
                {leftColumn.map((problem) => (
                  <ProblemItem
                    key={problem.id}
                    problem={problem}
                    config={config}
                  />
                ))}
              </div>

              {/* 우측 컬럼 */}
              <div className="column right-column">
                {rightColumn?.map((problem) => (
                  <ProblemItem
                    key={problem.id}
                    problem={problem}
                    config={config}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="column single-column">
              {problems.map((problem) => (
                <ProblemItem
                  key={problem.id}
                  problem={problem}
                  config={config}
                />
              ))}
            </div>
          )}
        </main>

        {/* 수식 렌더링을 위한 스타일 */}
        <style jsx global>{`
          .exam-template .katex {
            font-size: 1.1em !important;
          }

          .exam-template .katex-display {
            margin: 0.8em 0 !important;
          }

          .exam-template .problem-content p {
            margin: 0.5em 0;
          }

          .exam-template .problem-content h1,
          .exam-template .problem-content h2,
          .exam-template .problem-content h3 {
            margin: 0.8em 0 0.4em;
          }

          .exam-template .problem-content img {
            max-width: 100%;
            height: auto;
          }

          .exam-template .problem-content table {
            border-collapse: collapse;
            margin: 0.5em 0;
          }

          .exam-template .problem-content table td,
          .exam-template .problem-content table th {
            border: 1px solid #000;
            padding: 4px 8px;
          }

          @media print {
            .exam-template {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            .watermark {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}</style>
      </div>
    );
  }
);

ExamTemplate.displayName = 'ExamTemplate';

// 개별 문제 컴포넌트
interface ProblemItemProps {
  problem: PDFProblem;
  config: PDFExamConfig;
}

function ProblemItem({ problem, config }: ProblemItemProps) {
  return (
    <div
      className="problem-item"
      style={{
        marginBottom: `${config.problemSpacing}px`,
        pageBreakInside: 'avoid',
      }}
    >
      {/* 문제 번호 및 배점 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '8px',
          marginBottom: '6px',
        }}
      >
        {config.showProblemNumbers && (
          <span
            style={{
              fontWeight: 'bold',
              fontSize: `${config.fontSize + 1}pt`,
            }}
          >
            {problem.number}.
          </span>
        )}
        {config.showProblemPoints && problem.points && (
          <span
            style={{
              fontSize: '9pt',
              color: '#666',
              backgroundColor: '#f0f0f0',
              padding: '1px 6px',
              borderRadius: '3px',
            }}
          >
            {problem.points}점
          </span>
        )}
      </div>

      {/* 문제 내용 */}
      <div
        className="problem-content"
        style={{
          paddingLeft: config.showProblemNumbers ? '18px' : '0',
        }}
        dangerouslySetInnerHTML={{ __html: problem.content }}
      />
    </div>
  );
}

export default ExamTemplate;
