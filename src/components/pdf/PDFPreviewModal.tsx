'use client';

// ============================================================================
// PDF Preview Modal
// PDF 미리보기 모달
// ============================================================================

import React, { useRef, useState, useEffect } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import ExamTemplate from './ExamTemplate';
import { downloadPDF } from '@/lib/pdf/generator';
import type { PDFProblem, PDFExamConfig } from '@/types/pdf';

interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  problems: PDFProblem[];
  config: PDFExamConfig;
}

export default function PDFPreviewModal({
  isOpen,
  onClose,
  problems,
  config,
}: PDFPreviewModalProps) {
  const templateRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.6);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    if (!templateRef.current) return;

    setIsGenerating(true);
    setProgress(0);

    try {
      await downloadPDF({
        element: templateRef.current,
        config,
        filename: `${config.title || 'exam'}.pdf`,
        onProgress: setProgress,
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.1, 1.5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.1, 0.3));
  const handleZoomReset = () => setZoom(0.6);

  return (
    <div className="preview-overlay">
      {/* 툴바 */}
      <div className="preview-toolbar">
        <div className="toolbar-left">
          <h3>PDF 미리보기</h3>
        </div>

        <div className="toolbar-center">
          <button onClick={handleZoomOut} title="축소">
            <ZoomOut size={18} />
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} title="확대">
            <ZoomIn size={18} />
          </button>
          <button onClick={handleZoomReset} title="원래 크기">
            <RotateCcw size={18} />
          </button>
        </div>

        <div className="toolbar-right">
          <button
            className="download-btn"
            onClick={handleDownload}
            disabled={isGenerating}
          >
            <Download size={18} />
            {isGenerating ? `생성 중... ${progress}%` : 'PDF 다운로드'}
          </button>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* 미리보기 영역 */}
      <div className="preview-container">
        <div
          className="preview-content"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
          }}
        >
          <ExamTemplate
            ref={templateRef}
            problems={problems}
            config={config}
          />
        </div>
      </div>

      <style jsx>{`
        .preview-overlay {
          position: fixed;
          inset: 0;
          background: #1f2937;
          display: flex;
          flex-direction: column;
          z-index: 1000;
        }

        .preview-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: #111827;
          border-bottom: 1px solid #374151;
        }

        .toolbar-left h3 {
          color: white;
          font-size: 16px;
          font-weight: 600;
        }

        .toolbar-center {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .toolbar-center button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background: #374151;
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          transition: background 0.2s;
        }

        .toolbar-center button:hover {
          background: #4b5563;
        }

        .zoom-level {
          color: white;
          font-size: 13px;
          font-weight: 500;
          min-width: 50px;
          text-align: center;
        }

        .toolbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .download-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .download-btn:hover:not(:disabled) {
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
        }

        .download-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          border-radius: 6px;
        }

        .close-btn:hover {
          background: #374151;
          color: white;
        }

        .preview-container {
          flex: 1;
          overflow: auto;
          padding: 40px;
          display: flex;
          justify-content: center;
        }

        .preview-content {
          transition: transform 0.2s ease;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        }
      `}</style>
    </div>
  );
}
