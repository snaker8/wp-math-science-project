'use client';

// ============================================================================
// Clinic Exam Page - 클리닉 시험지 생성 (Zero-Wrong Loop)
// 오답 문제 + 쌍둥이 문제 → PDF 변환
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  Users,
  ChevronDown,
  Download,
  Printer,
  Eye,
  Sparkles,
  RefreshCw,
  Check,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import type { TwinProblem, ClinicExam } from '@/types/workflow';
import { generateClinicPdfHtml, createClinicExamData } from '@/lib/workflow/clinic-exam';

// Mock 데이터
const mockStudents = [
  { id: 'student-1', name: '김철수' },
  { id: 'student-2', name: '이영희' },
  { id: 'student-3', name: '박민수' },
];

interface WrongProblem {
  id: string;
  typeCode: string;
  typeName: string;
  contentLatex: string;
  contentHtml?: string;
  solutionLatex?: string;
  answer?: string;
  gradingStatus: 'WRONG' | 'PARTIAL_WRONG';
}

// Mock 오답 문제
const mockWrongProblems: WrongProblem[] = [
  {
    id: 'prob-1',
    typeCode: 'MA1-EQU-002',
    typeName: '이차방정식의 풀이',
    contentLatex: 'x^2 - 5x + 6 = 0$의 두 근을 구하시오.',
    contentHtml: '<p>이차방정식 $x^2 - 5x + 6 = 0$의 두 근을 구하시오.</p>',
    solutionLatex: '$(x-2)(x-3)=0$이므로 $x=2$ 또는 $x=3$',
    answer: 'x = 2 또는 x = 3',
    gradingStatus: 'WRONG',
  },
  {
    id: 'prob-2',
    typeCode: 'MA2-LIM-001',
    typeName: '삼각함수의 극한',
    contentLatex: '\\lim_{x \\to 0} \\frac{\\sin 3x}{x}$의 값을 구하시오.',
    contentHtml: '<p>$\\lim_{x \\to 0} \\frac{\\sin 3x}{x}$의 값을 구하시오.</p>',
    solutionLatex: '$\\lim_{x \\to 0} \\frac{\\sin 3x}{x} = 3 \\cdot \\lim_{x \\to 0} \\frac{\\sin 3x}{3x} = 3$',
    answer: '3',
    gradingStatus: 'PARTIAL_WRONG',
  },
  {
    id: 'prob-3',
    typeCode: 'CAL-INT-002',
    typeName: '정적분의 계산',
    contentLatex: '\\int_0^2 (x^2 + 1) dx$의 값을 구하시오.',
    contentHtml: '<p>$\\int_0^2 (x^2 + 1) dx$의 값을 구하시오.</p>',
    solutionLatex: '$\\left[\\frac{x^3}{3} + x\\right]_0^2 = \\frac{8}{3} + 2 = \\frac{14}{3}$',
    answer: '14/3',
    gradingStatus: 'WRONG',
  },
];

export default function ClinicExamPage() {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(mockStudents[0].id);
  const [wrongProblems, setWrongProblems] = useState<WrongProblem[]>(mockWrongProblems);
  const [selectedProblems, setSelectedProblems] = useState<Set<string>>(
    new Set(mockWrongProblems.map((p) => p.id))
  );
  const [generatedTwins, setGeneratedTwins] = useState<TwinProblem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [clinicExam, setClinicExam] = useState<ClinicExam | null>(null);

  // 옵션
  const [includeOriginals, setIncludeOriginals] = useState(true);
  const [includeSolutions, setIncludeSolutions] = useState(false);
  const [examTitle, setExamTitle] = useState('클리닉 시험지');

  const previewRef = useRef<HTMLIFrameElement>(null);
  const selectedStudent = mockStudents.find((s) => s.id === selectedStudentId);

  // 문제 선택 토글
  const toggleProblem = (problemId: string) => {
    setSelectedProblems((prev) => {
      const next = new Set(prev);
      if (next.has(problemId)) {
        next.delete(problemId);
      } else {
        next.add(problemId);
      }
      return next;
    });
  };

  // 쌍둥이 문제 생성
  const handleGenerateTwins = useCallback(async () => {
    if (selectedProblems.size === 0) return;

    setIsGenerating(true);

    try {
      const response = await fetch('/api/workflow/twin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemIds: Array.from(selectedProblems),
          studentId: selectedStudentId,
          studentName: selectedStudent?.name,
          options: {
            difficultyAdjustment: 0,
            preserveStructure: true,
          },
          useLLM: true,
          generateClinic: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate twins');
      }

      const data = await response.json();
      setGeneratedTwins(data.twinProblems);
    } catch (error) {
      console.error('Error generating twins:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedProblems, selectedStudentId, selectedStudent]);

  // PDF 미리보기
  const handlePreview = useCallback(() => {
    if (generatedTwins.length === 0 && !includeOriginals) {
      alert('먼저 쌍둥이 문제를 생성하거나 원본 문제를 포함해주세요.');
      return;
    }

    const selectedWrongProblems = wrongProblems.filter((p) =>
      selectedProblems.has(p.id)
    );

    const examData = createClinicExamData(
      selectedStudentId,
      selectedStudent?.name || '',
      selectedWrongProblems,
      generatedTwins,
      {
        title: examTitle || `${selectedStudent?.name} ${examTitle}`,
        includeOriginals,
        includeSolutions,
      }
    );

    const htmlContent = generateClinicPdfHtml(examData);

    // iframe에 HTML 로드
    if (previewRef.current) {
      const doc = previewRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();
      }
    }

    setShowPreview(true);
    setClinicExam({
      id: examData.id,
      studentId: selectedStudentId,
      title: examData.title,
      wrongProblemIds: selectedWrongProblems.map((p) => p.id),
      twinProblemIds: generatedTwins.map((t) => t.id),
      status: 'GENERATED',
      createdAt: examData.createdAt,
    });
  }, [
    wrongProblems,
    selectedProblems,
    generatedTwins,
    selectedStudentId,
    selectedStudent,
    examTitle,
    includeOriginals,
    includeSolutions,
  ]);

  // PDF 다운로드
  const handleDownload = useCallback(() => {
    if (!previewRef.current?.contentDocument) return;

    const htmlContent = previewRef.current.contentDocument.documentElement.outerHTML;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clinic_${selectedStudent?.name}_${new Date().toISOString().split('T')[0]}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }, [selectedStudent]);

  // 인쇄
  const handlePrint = useCallback(() => {
    previewRef.current?.contentWindow?.print();
  }, []);

  return (
    <div className="clinic-page">
      {/* 헤더 */}
      <header className="page-header">
        <div className="header-content">
          <h1>
            <FileText size={28} />
            클리닉 시험지 생성
          </h1>
          <p>오답 문제를 분석하여 맞춤형 유사 문제 시험지를 생성합니다.</p>
        </div>

        <div className="header-controls">
          <div className="select-wrapper">
            <Users size={16} />
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
            >
              {mockStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* 왼쪽: 문제 선택 및 옵션 */}
        <div className="config-panel">
          {/* 오답 문제 목록 */}
          <section className="problem-section">
            <h3>오답/부분오답 문제 ({wrongProblems.length}개)</h3>
            <div className="problem-list">
              {wrongProblems.map((problem) => (
                <div
                  key={problem.id}
                  className={`problem-item ${selectedProblems.has(problem.id) ? 'selected' : ''}`}
                  onClick={() => toggleProblem(problem.id)}
                >
                  <div className="problem-checkbox">
                    {selectedProblems.has(problem.id) ? (
                      <Check size={14} />
                    ) : (
                      <div className="checkbox-empty" />
                    )}
                  </div>
                  <div className="problem-info">
                    <span className="type-code">{problem.typeCode}</span>
                    <span className="type-name">{problem.typeName}</span>
                  </div>
                  <span className={`status-badge ${problem.gradingStatus.toLowerCase()}`}>
                    {problem.gradingStatus === 'WRONG' ? '오답' : '부분오답'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 생성 옵션 */}
          <section className="options-section">
            <h3>시험지 옵션</h3>

            <div className="option-group">
              <label>시험지 제목</label>
              <input
                type="text"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="클리닉 시험지"
              />
            </div>

            <div className="option-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeOriginals}
                  onChange={(e) => setIncludeOriginals(e.target.checked)}
                />
                <span>원본 오답 문제 포함</span>
              </label>
            </div>

            <div className="option-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeSolutions}
                  onChange={(e) => setIncludeSolutions(e.target.checked)}
                />
                <span>풀이 포함</span>
              </label>
            </div>
          </section>

          {/* 생성된 쌍둥이 문제 */}
          {generatedTwins.length > 0 && (
            <section className="twins-section">
              <h3>
                <Sparkles size={16} />
                생성된 유사 문제 ({generatedTwins.length}개)
              </h3>
              <div className="twins-list">
                {generatedTwins.map((twin, idx) => (
                  <div key={twin.id} className="twin-item">
                    <span className="twin-number">{idx + 1}</span>
                    <span className="twin-type">{twin.originalTypeCode}</span>
                    <button
                      className="remove-twin"
                      onClick={() =>
                        setGeneratedTwins((prev) => prev.filter((t) => t.id !== twin.id))
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 액션 버튼 */}
          <div className="action-buttons">
            <button
              className="btn-generate"
              onClick={handleGenerateTwins}
              disabled={isGenerating || selectedProblems.size === 0}
            >
              {isGenerating ? (
                <RefreshCw size={16} className="spinning" />
              ) : (
                <Sparkles size={16} />
              )}
              <span>쌍둥이 문제 생성</span>
            </button>

            <button
              className="btn-preview"
              onClick={handlePreview}
              disabled={generatedTwins.length === 0 && !includeOriginals}
            >
              <Eye size={16} />
              <span>미리보기</span>
            </button>
          </div>
        </div>

        {/* 오른쪽: 미리보기 */}
        <div className={`preview-panel ${showPreview ? 'show' : ''}`}>
          {showPreview ? (
            <>
              <div className="preview-toolbar">
                <h3>시험지 미리보기</h3>
                <div className="toolbar-actions">
                  <button onClick={handlePrint}>
                    <Printer size={16} />
                    <span>인쇄</span>
                  </button>
                  <button className="primary" onClick={handleDownload}>
                    <Download size={16} />
                    <span>다운로드</span>
                  </button>
                </div>
              </div>
              <div className="preview-container">
                <iframe
                  ref={previewRef}
                  title="Clinic Exam Preview"
                  className="preview-iframe"
                />
              </div>
            </>
          ) : (
            <div className="preview-placeholder">
              <FileText size={48} />
              <h4>시험지 미리보기</h4>
              <p>쌍둥이 문제를 생성하고 미리보기를 클릭하세요.</p>
            </div>
          )}
        </div>
      </main>

      <style jsx>{`
        .clinic-page {
          min-height: 100vh;
          background: #f3f4f6;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 32px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
        }

        .header-content h1 {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 0 0 8px;
          font-size: 22px;
          font-weight: 700;
          color: #1f2937;
        }

        .header-content p {
          margin: 0;
          font-size: 13px;
          color: #6b7280;
        }

        .header-controls {
          display: flex;
          gap: 12px;
        }

        .select-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: #f9fafb;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          color: #374151;
        }

        .select-wrapper select {
          border: none;
          background: transparent;
          font-size: 13px;
          font-weight: 500;
          color: #1f2937;
          cursor: pointer;
          appearance: none;
        }

        .main-content {
          display: grid;
          grid-template-columns: 400px 1fr;
          gap: 24px;
          padding: 24px 32px;
          max-width: 1600px;
          margin: 0 auto;
        }

        .config-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .problem-section,
        .options-section,
        .twins-section {
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          padding: 20px;
        }

        .problem-section h3,
        .options-section h3,
        .twins-section h3 {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 16px;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .problem-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .problem-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f9fafb;
          border: 2px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .problem-item:hover {
          background: #f3f4f6;
        }

        .problem-item.selected {
          background: #eef2ff;
          border-color: #4f46e5;
        }

        .problem-checkbox {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #4f46e5;
          color: white;
        }

        .checkbox-empty {
          width: 18px;
          height: 18px;
          border: 2px solid #d1d5db;
          border-radius: 4px;
        }

        .problem-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .type-code {
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
        }

        .type-name {
          font-size: 13px;
          color: #1f2937;
        }

        .status-badge {
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 600;
          border-radius: 4px;
        }

        .status-badge.wrong {
          color: #dc2626;
          background: #fee2e2;
        }

        .status-badge.partial_wrong {
          color: #ea580c;
          background: #ffedd5;
        }

        .option-group {
          margin-bottom: 12px;
        }

        .option-group label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          color: #6b7280;
          margin-bottom: 6px;
        }

        .option-group input[type="text"] {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .checkbox-label input {
          width: 16px;
          height: 16px;
          accent-color: #4f46e5;
        }

        .checkbox-label span {
          font-size: 13px;
          color: #374151;
        }

        .twins-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .twin-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
        }

        .twin-number {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          color: #16a34a;
          background: #dcfce7;
          border-radius: 50%;
        }

        .twin-type {
          flex: 1;
          font-size: 12px;
          color: #15803d;
        }

        .remove-twin {
          padding: 4px;
          background: none;
          border: none;
          color: #dc2626;
          cursor: pointer;
          opacity: 0.6;
        }

        .remove-twin:hover {
          opacity: 1;
        }

        .action-buttons {
          display: flex;
          gap: 12px;
        }

        .btn-generate,
        .btn-preview {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 20px;
          font-size: 14px;
          font-weight: 600;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-generate {
          color: white;
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
        }

        .btn-generate:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .btn-preview {
          color: #374151;
          background: white;
          border: 1px solid #d1d5db;
        }

        .btn-preview:hover:not(:disabled) {
          background: #f9fafb;
        }

        .btn-generate:disabled,
        .btn-preview:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .preview-panel {
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          overflow: hidden;
          min-height: 600px;
        }

        .preview-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }

        .preview-toolbar h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .toolbar-actions {
          display: flex;
          gap: 8px;
        }

        .toolbar-actions button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toolbar-actions button:hover {
          background: #f3f4f6;
        }

        .toolbar-actions button.primary {
          color: white;
          background: #4f46e5;
          border-color: #4f46e5;
        }

        .toolbar-actions button.primary:hover {
          background: #4338ca;
        }

        .preview-container {
          height: calc(100% - 60px);
        }

        .preview-iframe {
          width: 100%;
          height: 100%;
          min-height: 540px;
          border: none;
        }

        .preview-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 500px;
          color: #9ca3af;
          text-align: center;
        }

        .preview-placeholder h4 {
          margin: 16px 0 8px;
          font-size: 16px;
          font-weight: 600;
          color: #6b7280;
        }

        .preview-placeholder p {
          margin: 0;
          font-size: 13px;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 1024px) {
          .main-content {
            grid-template-columns: 1fr;
          }

          .preview-panel {
            order: -1;
          }
        }
      `}</style>
    </div>
  );
}
