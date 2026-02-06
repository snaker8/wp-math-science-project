'use client';

// ============================================================================
// PDF Export Button
// PDF 내보내기 통합 컴포넌트
// ============================================================================

import React, { useState, useRef, useCallback } from 'react';
import { FileDown } from 'lucide-react';
import PDFOptionsModal from './PDFOptionsModal';
import PDFPreviewModal from './PDFPreviewModal';
import ExamTemplate from './ExamTemplate';
import { downloadPDF } from '@/lib/pdf/generator';
import type { PDFProblem, PDFExamConfig } from '@/types/pdf';
import { DEFAULT_PDF_CONFIG } from '@/types/pdf';

interface PDFExportButtonProps {
  // 문제 데이터를 제공하는 함수 또는 배열
  problems: PDFProblem[] | (() => PDFProblem[]);
  // 초기 설정
  initialConfig?: Partial<PDFExamConfig>;
  // 버튼 스타일
  variant?: 'primary' | 'secondary' | 'icon';
  // 버튼 텍스트
  label?: string;
  // 비활성화
  disabled?: boolean;
  // 클래스명
  className?: string;
}

export default function PDFExportButton({
  problems,
  initialConfig,
  variant = 'primary',
  label = 'PDF 내보내기',
  disabled = false,
  className = '',
}: PDFExportButtonProps) {
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<PDFExamConfig>({
    ...DEFAULT_PDF_CONFIG,
    ...initialConfig,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  // 숨겨진 렌더링 영역을 위한 ref
  const hiddenTemplateRef = useRef<HTMLDivElement>(null);

  // 문제 데이터 가져오기
  const getProblems = useCallback((): PDFProblem[] => {
    if (typeof problems === 'function') {
      return problems();
    }
    return problems;
  }, [problems]);

  // 옵션 모달 열기
  const handleOpenOptions = () => {
    setShowOptionsModal(true);
  };

  // 미리보기 열기
  const handlePreview = (config: PDFExamConfig) => {
    setCurrentConfig(config);
    setShowOptionsModal(false);
    setShowPreviewModal(true);
  };

  // PDF 생성 및 다운로드
  const handleGenerate = async (config: PDFExamConfig) => {
    setCurrentConfig(config);
    setIsGenerating(true);
    setProgress(0);

    try {
      // 숨겨진 영역에 템플릿 렌더링 후 PDF 생성
      if (hiddenTemplateRef.current) {
        await downloadPDF({
          element: hiddenTemplateRef.current,
          config,
          filename: `${config.title || 'exam'}.pdf`,
          onProgress: setProgress,
        });
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  const buttonClasses = {
    primary: `
      inline-flex items-center gap-2 px-5 py-2.5
      bg-gradient-to-br from-indigo-500 to-indigo-600
      text-white font-medium text-sm
      border-none rounded-lg cursor-pointer
      transition-all hover:shadow-lg hover:-translate-y-0.5
      disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0
    `,
    secondary: `
      inline-flex items-center gap-2 px-4 py-2
      bg-white border border-gray-300
      text-gray-700 font-medium text-sm
      rounded-lg cursor-pointer
      transition-all hover:bg-gray-50 hover:border-gray-400
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
    icon: `
      inline-flex items-center justify-center
      w-10 h-10 bg-white border border-gray-300
      text-gray-700 rounded-lg cursor-pointer
      transition-all hover:bg-gray-50 hover:border-gray-400
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
  };

  return (
    <>
      {/* 내보내기 버튼 */}
      <button
        onClick={handleOpenOptions}
        disabled={disabled || isGenerating}
        className={`${buttonClasses[variant]} ${className}`}
      >
        <FileDown size={18} />
        {variant !== 'icon' && label}
      </button>

      {/* 옵션 모달 */}
      <PDFOptionsModal
        isOpen={showOptionsModal}
        onClose={() => setShowOptionsModal(false)}
        onGenerate={handleGenerate}
        onPreview={handlePreview}
        initialConfig={initialConfig}
        isGenerating={isGenerating}
        progress={progress}
      />

      {/* 미리보기 모달 */}
      <PDFPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        problems={getProblems()}
        config={currentConfig}
      />

      {/* 숨겨진 렌더링 영역 (PDF 생성용) */}
      <div
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <ExamTemplate
          ref={hiddenTemplateRef}
          problems={getProblems()}
          config={currentConfig}
        />
      </div>
    </>
  );
}
