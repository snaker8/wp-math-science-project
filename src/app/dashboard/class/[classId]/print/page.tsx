'use client';

// ============================================================================
// 반 허브 ▸ 출력 — 시험지 여러 장을 한 번에 인쇄 (회차의 학생별 시험지 · 오답유사 학습)
// ----------------------------------------------------------------------------
// 매쓰홀릭 출력 탭(회차별 학습/오답유사 일괄 인쇄) 대응. docs/PLAN_COURSE_LAYER.md.
//   /dashboard/class/[classId]/print?exams=id1,id2,…&title=…
//
// 시험지 렌더는 ExamPaperView(클라우드 인쇄 엔진)를 그대로 쓴다 — 인쇄는 불가침.
// 「전체 인쇄」는 ExamPaperView 의 doPrint 와 같은 방식: 문서의 .exam-page 를 전부 #exam-print-root 로 복제 → window.print.
// ExamPaperView 가 하나라도 떠 있으면 인쇄 CSS 가 같이 떠 있으므로 별도 CSS 없이 된다.
// ============================================================================

import { Suspense, useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { useExamProblems } from '@/hooks/useExamProblems';
import { DEFAULT_EXAM_META, type ExamMeta } from '@/config/exam-templates';

const ExamPaperView = dynamic(
  () => import('@/components/exam-paper/ExamPaperView').then((m) => m.ExamPaperView),
  { ssr: false, loading: () => <div className="py-10 text-center text-sm text-content-tertiary">시험지 준비 중…</div> },
);

const MAX_EXAMS = 40;

function ExamBlock({ examId, templateId, meta, index }: { examId: string; templateId: string; meta: ExamMeta; index: number }) {
  const { problems, examInfo, isLoading } = useExamProblems(examId);
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-content-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" /> {index + 1}. 불러오는 중
      </div>
    );
  }
  return (
    <section className="border-b border-white/10 pb-6">
      <h2 className="px-4 pt-4 text-sm font-medium text-content-secondary">
        <span className="mr-2 tabular-nums text-content-muted">{index + 1}.</span>
        {examInfo?.title ?? '(시험지)'}
        <span className="ml-2 text-xs text-content-muted">{problems.length}문항</span>
      </h2>
      <ExamPaperView
        problems={problems}
        examTitle={examInfo?.title ?? ''}
        examId={examId}
        templateId={templateId}
        examMeta={meta}
        onOpenTemplateModal={() => {}}
      />
    </section>
  );
}

function BatchPrintInner() {
  const params = useParams<{ classId: string }>();
  const sp = useSearchParams();
  const classId = params?.classId ?? '';
  const title = sp.get('title') || '시험지 출력';
  const examIds = useMemo(
    () => Array.from(new Set((sp.get('exams') || '').split(',').map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s)))).slice(0, MAX_EXAMS),
    [sp],
  );
  const [templateId] = useState('simple');
  const [meta] = useState<ExamMeta>({ ...DEFAULT_EXAM_META });
  const [printing, setPrinting] = useState(false);

  // ExamPaperView.doPrint 와 같은 방식 — 문서의 모든 .exam-page 를 한 번에
  const printAll = useCallback(() => {
    const pages = document.querySelectorAll('.exam-page');
    if (pages.length === 0) return;
    const root = document.createElement('div');
    root.id = 'exam-print-root';
    pages.forEach((p) => root.appendChild(p.cloneNode(true)));
    document.body.appendChild(root);
    const prevTitle = document.title;
    document.title = `${title.replace(/[\\/:*?"<>|\n\r\t]/g, ' ').trim() || '시험지'} 문제지`;
    setPrinting(true);
    const cleanup = () => {
      document.title = prevTitle;
      try { document.body.removeChild(root); } catch { /* already removed */ }
      window.removeEventListener('afterprint', cleanup);
      setPrinting(false);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);
    const run = () => { try { window.print(); } catch { cleanup(); } };
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fonts?.ready) fonts.ready.then(run).catch(run); else run();
  }, [title]);

  return (
    <div className="min-h-screen bg-surface-base">
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-surface-base/95 px-4 py-2.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/dashboard/class/${classId}`} className="inline-flex items-center gap-1 text-sm text-content-tertiary hover:text-content-primary">
            <ArrowLeft className="h-4 w-4" /> 반 허브
          </Link>
          <h1 className="truncate text-sm font-semibold text-content-primary">{title}</h1>
          <span className="shrink-0 text-xs tabular-nums text-content-tertiary">시험지 {examIds.length}장</span>
        </div>
        <button
          onClick={printAll}
          disabled={examIds.length === 0 || printing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Printer className="h-3.5 w-3.5" /> 전체 인쇄
        </button>
      </div>

      {examIds.length === 0 ? (
        <p className="px-6 py-16 text-center text-sm text-content-muted">인쇄할 시험지가 없습니다. 반 허브 과제 탭의 회차 표에서 「출력」으로 들어오세요.</p>
      ) : (
        <div className="space-y-2">
          {examIds.map((id, i) => <ExamBlock key={id} examId={id} templateId={templateId} meta={meta} index={i} />)}
        </div>
      )}
    </div>
  );
}

export default function ClassBatchPrintPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-content-tertiary">불러오는 중</div>}>
      <BatchPrintInner />
    </Suspense>
  );
}
