'use client';

// 표지 만들기 — 시험지 없이 표지 한 장만 꾸며 인쇄·PDF 로 뽑는다.
//
// 왜 (2026-11-03 대표): "표지만 따로 만들어 쓸 수 있게도 할 수 있어야 할 거 같다".
//   그전엔 표지가 시험지 인쇄 화면(ExamPaperView) 안에만 있어 시험지를 먼저 열어야 했다.
//   표지 그리기(CoverPage)·옵션(CoverPanel)·저장한 표지·이미지 라이브러리(공용 포함)는 그대로 재사용 —
//   여기서 저장한 표지는 시험지 화면의 「저장한 표지」에도 똑같이 뜬다(같은 /api/print/covers).
//   인쇄·PDF 는 ExamPaperView 와 같은 방식: .exam-page 복제 → #exam-print-root → window.print / /api/print/pdf.
import React, { useCallback, useRef, useState } from 'react';
import { Printer, FileDown, Loader2 } from 'lucide-react';
import { CoverPage, CoverPanel, DEFAULT_COVER, type CoverSettings } from '@/components/exam-paper/CoverPage';
import { DEFAULT_EXAM_META } from '@/config/exam-templates';

const A4_W = 794;
const A4_H = 1123;
const ACCENTS = ['#334155', '#1e3a8a', '#0f766e', '#7c3aed', '#be123c', '#b45309', '#111827'];

export default function CoverMakerPage() {
  const [cover, setCover] = useState<CoverSettings>({ ...DEFAULT_COVER, on: true });
  const [accent, setAccent] = useState<string>(ACCENTS[0]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const fileTitle = useCallback(() => {
    const t = (cover.title || '').replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    return t ? `${t} 표지` : '표지';
  }, [cover.title]);

  const buildPrintRoot = useCallback((): HTMLDivElement | null => {
    const src = pageRef.current?.querySelector('.exam-page.exam-cover');
    if (!src) return null;
    const root = document.createElement('div');
    root.id = 'exam-print-root';
    root.appendChild(src.cloneNode(true));
    return root;
  }, []);

  const handlePrint = useCallback(() => {
    const root = buildPrintRoot();
    if (!root) return;
    document.body.appendChild(root);
    const prevTitle = document.title;
    document.title = fileTitle();
    const cleanup = () => {
      document.title = prevTitle;
      try { document.body.removeChild(root); } catch { /* already removed */ }
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);
    const run = () => { try { window.print(); } catch { cleanup(); } };
    if ((document as any).fonts?.ready) (document as any).fonts.ready.then(run).catch(run);
    else run();
  }, [buildPrintRoot, fileTitle]);

  const handlePdf = useCallback(async () => {
    if (pdfBusy) return;
    const root = buildPrintRoot();
    if (!root) return;
    setPdfBusy(true);
    try {
      if ((document as any).fonts?.ready) { try { await (document as any).fonts.ready; } catch { /* ignore */ } }
      const { serializePrintDocument, packPdfRequest } = await import('@/lib/pdf/serialize-print-document');
      const title = fileTitle();
      const html = await serializePrintDocument(root, title);
      const packed = await packPdfRequest({ html, filename: title });
      const res = await fetch('/api/print/pdf', { method: 'POST', headers: packed.headers, body: packed.body });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `PDF 생성 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${title}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      alert(`PDF 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPdfBusy(false);
    }
  }, [pdfBusy, buildPrintRoot, fileTitle]);

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-0 w-full">
      {/* 왼쪽 — 옵션 */}
      <aside className="flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/10 p-4">
        <div>
          <h1 className="text-base font-semibold text-content-primary">표지 만들기</h1>
          <p className="mt-1 text-[11px] leading-relaxed text-content-tertiary">
            시험지 없이 표지 한 장만 만듭니다. 시험지가 없으니 비운 칸은 비어서 나옵니다 — 제목·부제목·정보 줄은 직접 적어 주세요.
            저장한 표지는 시험지 인쇄 화면에서도 그대로 불러올 수 있습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handlePrint}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/15 px-3 py-2 text-xs text-content-primary hover:bg-white/10">
            <Printer className="h-3.5 w-3.5" /> 인쇄
          </button>
          <button type="button" onClick={() => void handlePdf()} disabled={pdfBusy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-50">
            {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} PDF 다운로드
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-content-secondary">
          <span>강조색</span>
          {ACCENTS.map((c) => (
            <button key={c} type="button" onClick={() => setAccent(c)} title={c}
              className={`h-5 w-5 rounded-full border ${accent === c ? 'border-white ring-2 ring-white/40' : 'border-white/20'}`}
              style={{ background: c }} />
          ))}
        </div>
        <CoverPanel value={cover} onChange={(next) => setCover({ ...next, on: true })} />
      </aside>

      {/* 오른쪽 — A4 미리보기 */}
      <main className="flex min-w-0 flex-1 justify-center overflow-auto bg-surface-raised/30 py-6">
        <div ref={pageRef} style={{ zoom: 0.8 }}>
          <CoverPage settings={cover} examTitle="" meta={DEFAULT_EXAM_META} problemCount={0} accent={accent} width={A4_W} height={A4_H} />
        </div>
      </main>

      {/* 인쇄 — ExamPaperView 의 표지 인쇄 규칙과 같다 (전면 이미지, 패딩 0, A4 한 장) */}
      <style jsx global>{`
        .exam-page.exam-cover img { max-height: none; height: 100%; object-fit: cover; object-position: center top; }
        #exam-print-root { display: none; }
        @media print {
          body > *:not(#exam-print-root) { display: none !important; }
          #exam-print-root { display: block !important; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
          #exam-print-root .exam-page {
            width: 210mm !important; height: 297mm !important; min-height: 297mm !important; max-height: 297mm !important;
            margin: 0 !important; padding: 0 !important; box-shadow: none !important; border-radius: 0 !important;
            overflow: hidden !important; background: white !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          #exam-print-root .exam-page.exam-cover img { max-height: none !important; height: 100% !important; object-fit: cover !important; object-position: center top !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </div>
  );
}
