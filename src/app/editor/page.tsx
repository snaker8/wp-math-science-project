'use client';

// ============================================================================
// Math Editor Demo Page - Tailwind CSS + PDF Export
// ============================================================================

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { EditorContent } from '@/types/editor';
import type { PDFProblem } from '@/types/pdf';

// 동적 임포트로 SSR 비활성화 (KaTeX, tiptap은 클라이언트에서만 동작)
const MathEditor = dynamic(() => import('@/components/editor/MathEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-xl border border-gray-200">
      <p className="text-gray-500">에디터 로딩 중...</p>
    </div>
  ),
});

// PDF 내보내기 버튼도 동적 임포트
const PDFExportButton = dynamic(
  () => import('@/components/pdf/PDFExportButton'),
  { ssr: false }
);

export default function EditorPage() {
  const [savedContent, setSavedContent] = useState<EditorContent | null>(null);
  const [currentContent, setCurrentContent] = useState<EditorContent | null>(null);

  const handleChange = (content: EditorContent) => {
    setCurrentContent(content);
    console.log('Content changed:', content.text.substring(0, 50) + '...');
  };

  const handleSave = (content: EditorContent) => {
    setSavedContent(content);
    setCurrentContent(content);
    console.log('Saved:', content);
  };

  const initialContent = `<h2>문제 1</h2><p>다음 함수의 극한값을 구하시오.</p><p><span class="math-inline" data-latex="\\\\lim_{x \\\\to 0} \\\\frac{\\\\sin x}{x}">$\\\\lim_{x \\\\to 0} \\\\frac{\\\\sin x}{x}$</span></p>`;

  // 에디터 콘텐츠를 PDF 문제 형식으로 변환
  const getProblems = useMemo((): PDFProblem[] => {
    const content = currentContent || savedContent;
    if (!content) {
      return [
        {
          id: '1',
          number: 1,
          content: '<p>문제를 입력하세요.</p>',
          points: 10,
        },
      ];
    }

    // 간단한 파싱: h2 태그로 문제 분리 또는 전체를 하나의 문제로 처리
    const html = content.html;
    const problemSections = html.split(/<h2[^>]*>/i).filter(Boolean);

    if (problemSections.length <= 1) {
      // 단일 문제
      return [
        {
          id: '1',
          number: 1,
          content: html,
          points: 10,
        },
      ];
    }

    // 여러 문제
    return problemSections.map((section, index) => ({
      id: String(index + 1),
      number: index + 1,
      content: index === 0 ? section : `<h2>${section}`,
      points: 10,
    }));
  }, [currentContent, savedContent]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 헤더 */}
      <header className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800 text-white py-8">
        <div className="max-w-[1200px] mx-auto px-6">
          <h1 className="text-[28px] font-bold mb-2">
            수학 전용 웹 에디터
          </h1>
          <p className="text-sm text-indigo-200">
            과사람 수학 문제은행 플랫폼
          </p>
        </div>
      </header>

      {/* 메인 */}
      <main className="max-w-[1200px] mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 md:gap-8">
        <div className="flex flex-col gap-5">
          {/* 에디터 헤더 */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              문제 편집기
            </h2>
            <div className="flex items-center gap-3">
              {/* PDF 내보내기 버튼 */}
              <PDFExportButton
                problems={getProblems}
                initialConfig={{
                  title: '수학 평가',
                  instituteName: '과사람 수학학원',
                }}
                variant="secondary"
                label="PDF 내보내기"
              />
              <button
                onClick={() => currentContent && handleSave(currentContent)}
                className="
                  px-5 py-2.5 text-sm font-medium text-white
                  bg-gradient-to-br from-indigo-500 to-indigo-600
                  border-none rounded-lg cursor-pointer
                  transition-all hover:shadow-lg hover:-translate-y-0.5
                  active:translate-y-0
                "
              >
                저장 (Ctrl+S)
              </button>
            </div>
          </div>

          {/* 에디터 */}
          <MathEditor
            initialContent={initialContent}
            onChange={handleChange}
            onSave={handleSave}
            placeholder="문제를 입력하세요..."
            minHeight="400px"
          />

          {/* 저장된 콘텐츠 미리보기 */}
          {savedContent && (
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                저장된 콘텐츠
              </h3>
              <details open>
                <summary className="
                  cursor-pointer px-3 py-2 bg-gray-50 rounded-md
                  text-[13px] font-medium text-gray-600
                  hover:bg-gray-100 transition-colors
                ">
                  HTML
                </summary>
                <pre className="
                  mt-2 p-3 bg-gray-800 text-gray-50 rounded-md
                  text-xs overflow-auto whitespace-pre-wrap break-all
                  max-h-[300px]
                ">
                  {savedContent.html}
                </pre>
              </details>
            </div>
          )}
        </div>

        {/* 사이드바 */}
        <aside className="bg-white rounded-xl p-5 border border-gray-200 h-fit lg:sticky lg:top-6 order-first lg:order-last">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            사용 방법
          </h3>
          <ul className="list-none p-0 m-0">
            {[
              { keys: 'Ctrl + M', action: '인라인 수식 삽입' },
              { keys: 'Ctrl + Shift + M', action: '블록 수식 삽입' },
              { keys: 'Ctrl + S', action: '저장' },
              { keys: '수식 더블클릭', action: '편집 모드' },
              { keys: 'Enter', action: '수식 저장' },
              { keys: 'Esc', action: '수식 편집 취소' },
            ].map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-2 py-2 text-[13px] text-gray-600 border-b border-gray-100 last:border-b-0"
              >
                <kbd className="
                  inline-block px-1.5 py-0.5 text-[11px] font-mono
                  bg-gray-100 border border-gray-300 rounded
                ">
                  {item.keys}
                </kbd>
                <span>{item.action}</span>
              </li>
            ))}
          </ul>

          <h4 className="text-sm font-semibold text-gray-700 mt-5 mb-3">
            LaTeX 예시
          </h4>
          <div className="flex flex-col gap-1.5">
            {['\\frac{a}{b}', '\\sqrt{x}', '\\sum_{i=1}^{n}', '\\int_{a}^{b}'].map((ex) => (
              <code
                key={ex}
                className="
                  px-2.5 py-1.5 text-xs font-mono
                  bg-gray-50 border border-gray-200 rounded
                  text-indigo-600
                "
              >
                {ex}
              </code>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
