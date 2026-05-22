'use client';

// ============================================================================
// /test-science — 과학 자산화 Gemini POC 테스트
// ============================================================================
// 두 모드 비교:
//   A. 통짜 (whole)     → PDF 전체를 Gemini 한 번 호출 (좌표 환각 잦음)
//   B. per-problem      → YOLO 로 문제 분할 후 각 문제만 Gemini (정확도 ↑↑)
//
// 같은 파일을 두 모드로 돌려서 결과 직접 비교.

import { useState } from 'react';

type Mode = 'whole' | 'perproblem';

// ====== 통짜 모드 타입 ======
interface FigureBBox {
  pageIdx: number;
  x: number;
  y: number;
  w: number;
  h: number;
  placement?: number;
  descriptionHint?: string;
}
interface WholeProblem {
  number: number;
  content: string;
  choices: string[];
  hasFigure: boolean;
  figures?: FigureBBox[];
  pageHint?: number;
  pointsHint?: number;
  answerHint?: string;
}
interface CVPageFigures {
  pageIdx: number;
  width: number;
  height: number;
  figures: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    cropBase64?: string;
    cropWidth?: number;
    cropHeight?: number;
  }>;
}
interface WholeResult {
  success: boolean;
  model?: string;
  problems?: WholeProblem[];
  cvPageFigures?: CVPageFigures[];
  usage?: {
    promptTokens?: number;
    candidatesTokens?: number;
    thoughtsTokens?: number;
    totalTokens?: number;
  };
  elapsedMs?: number;
  finishReason?: string;
  error?: string;
}

// ====== per-problem 모드 타입 ======
interface PerProblemFigure {
  x: number;
  y: number;
  w: number;
  h: number;
  cropBase64?: string;
  cropWidth?: number;
  cropHeight?: number;
}
interface PerProblem {
  number: number;
  content: string;
  choices: string[];
  hasFigure: boolean;
  pointsHint?: number;
  answerHint?: string;
  confidence?: number;
  pageIdx: number;
  bbox: { x: number; y: number; w: number; h: number };
  detectionIdx: number;
  problemCropBase64: string;
  figures?: PerProblemFigure[];
  error?: string;
}
interface PerProblemResult {
  success: boolean;
  problems: PerProblem[];
  pageCount: number;
  problemCount: number;
  model?: string;
  totalUsage: {
    promptTokens: number;
    candidatesTokens: number;
    thoughtsTokens: number;
    totalTokens: number;
  };
  elapsedMs: number;
  error?: string;
}

export default function TestSciencePage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('perproblem');
  const [loading, setLoading] = useState(false);
  const [wholeResult, setWholeResult] = useState<WholeResult | null>(null);
  const [perResult, setPerResult] = useState<PerProblemResult | null>(null);
  const [clientElapsedMs, setClientElapsedMs] = useState<number | null>(null);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setWholeResult(null);
    setPerResult(null);
    setClientElapsedMs(null);

    const t0 = performance.now();
    const fd = new FormData();
    fd.append('file', file);

    try {
      const endpoint =
        mode === 'whole'
          ? '/api/workflow/upload-science-gemini'
          : '/api/workflow/upload-science-perproblem';
      const res = await fetch(endpoint, { method: 'POST', body: fd });
      const json = await res.json();
      setClientElapsedMs(Math.round(performance.now() - t0));
      if (mode === 'whole') setWholeResult(json);
      else setPerResult(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setClientElapsedMs(Math.round(performance.now() - t0));
      if (mode === 'whole') setWholeResult({ success: false, error: msg });
      else
        setPerResult({
          success: false,
          problems: [],
          pageCount: 0,
          problemCount: 0,
          totalUsage: { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0 },
          elapsedMs: 0,
          error: msg,
        });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">과학 자산화 Gemini POC 테스트</h1>
        <p className="text-zinc-400 text-sm mb-6">
          두 가지 OCR 방식 비교. <strong>통짜</strong>: PDF 전체를 Gemini 한 번 호출.
          <strong className="ml-2">per-problem</strong>: YOLO 로 문제 분할 후 각 문제만 Gemini 호출 (작은 영역 → 정확도 ↑↑).
        </p>

        {/* 모드 토글 */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-5 mb-4">
          <div className="text-[11px] text-zinc-500 mb-2">분석 모드</div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode('whole')}
              className={`px-4 py-2 rounded text-sm font-bold transition-colors ${
                mode === 'whole'
                  ? 'bg-amber-500 text-white'
                  : 'bg-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              통짜 (whole-page)
            </button>
            <button
              onClick={() => setMode('perproblem')}
              className={`px-4 py-2 rounded text-sm font-bold transition-colors ${
                mode === 'perproblem'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              per-problem (YOLO + 분할)
            </button>
          </div>

          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setWholeResult(null);
              setPerResult(null);
            }}
            className="block w-full text-sm text-zinc-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-bold file:bg-cyan-500 file:text-white hover:file:bg-cyan-600"
          />
          {file && (
            <div className="mt-3 text-xs text-zinc-400">
              선택됨: <span className="text-zinc-200 font-mono">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className={`mt-4 px-5 py-2 rounded text-white font-bold text-sm disabled:opacity-30 disabled:cursor-not-allowed ${
              mode === 'perproblem' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            {loading
              ? mode === 'perproblem'
                ? '처리 중... (YOLO + 문제별 Gemini, 30~120초)'
                : '처리 중... (Gemini 통짜, 15~60초)'
              : `업로드 + ${mode === 'perproblem' ? 'per-problem 분석' : '통짜 분석'}`}
          </button>
        </div>

        {/* 통짜 결과 */}
        {wholeResult && <WholeResultView result={wholeResult} clientMs={clientElapsedMs} />}

        {/* per-problem 결과 */}
        {perResult && <PerProblemResultView result={perResult} clientMs={clientElapsedMs} />}
      </div>
    </div>
  );
}

// =========================================================================
// 통짜 결과 뷰
// =========================================================================

function WholeResultView({ result, clientMs }: { result: WholeResult; clientMs: number | null }) {
  if (!result.success) {
    return (
      <div className="rounded-xl border border-red-700 bg-red-900/20 p-4 mb-3 text-red-300">
        <div className="font-bold mb-1">통짜 모드 실패</div>
        <pre className="text-xs whitespace-pre-wrap">{result.error}</pre>
      </div>
    );
  }
  const totalCvFigures = result.cvPageFigures?.reduce((sum, p) => sum + p.figures.length, 0) ?? 0;
  return (
    <>
      <div className="rounded-xl border border-amber-700 bg-amber-900/10 p-5 mb-4">
        <div className="text-[11px] text-amber-400 mb-2 font-bold">통짜 (whole-page) + OpenCV 결과</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="문제 수 (Gemini)" value={`${result.problems?.length ?? 0}`} />
          <Stat label="그림 수 (OpenCV)" value={`${totalCvFigures}`} />
          <Stat label="모델" value={result.model || '-'} />
          <Stat label="처리 시간 (클라)" value={`${clientMs ?? '-'}ms`} />
          <Stat label="finishReason" value={result.finishReason || '-'} />
          <Stat label="입력 토큰" value={`${result.usage?.promptTokens ?? '-'}`} />
          <Stat label="출력 토큰" value={`${result.usage?.candidatesTokens ?? '-'}`} />
          <Stat label="총 토큰" value={`${result.usage?.totalTokens ?? '-'}`} />
        </div>
      </div>

      {/* OpenCV 그림 검출 결과 — 페이지별 그리드 */}
      {result.cvPageFigures && result.cvPageFigures.length > 0 && (
        <div className="rounded-xl border border-cyan-700 bg-cyan-900/10 p-5 mb-4">
          <div className="text-[11px] text-cyan-400 mb-3 font-bold">
            OpenCV 그림 검출 ({totalCvFigures}건) — 픽셀 분석 기반, LLM 환각 없음
          </div>
          {result.cvPageFigures.map((page) => (
            <div key={page.pageIdx} className="mb-4 last:mb-0">
              <div className="text-[11px] text-zinc-400 mb-2">
                Page {page.pageIdx + 1} ({page.width}×{page.height}px) — {page.figures.length}개 그림
              </div>
              {page.figures.length === 0 ? (
                <div className="text-[12px] text-zinc-500 italic">(그림 검출 없음)</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {page.figures.map((fig, i) => (
                    <div key={i} className="rounded border border-zinc-700 bg-zinc-900/50 p-2">
                      <div className="text-[10px] text-zinc-500 mb-1 font-mono">
                        ({fig.x.toFixed(3)}, {fig.y.toFixed(3)}) {fig.w.toFixed(3)}×{fig.h.toFixed(3)}
                      </div>
                      {fig.cropBase64 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`data:image/png;base64,${fig.cropBase64}`}
                          alt={`figure ${i + 1}`}
                          className="w-full rounded border border-zinc-600 bg-white"
                        />
                      ) : (
                        <div className="text-[11px] text-zinc-500 italic">(no crop)</div>
                      )}
                      {fig.cropWidth && fig.cropHeight && (
                        <div className="mt-1 text-[10px] text-zinc-500">
                          {fig.cropWidth}×{fig.cropHeight}px
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {result.problems?.map((p) => <WholeProblemCard key={p.number} problem={p} />)}
    </>
  );
}

function WholeProblemCard({ problem }: { problem: WholeProblem }) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/30 p-4 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center">
          {problem.number}
        </span>
        {problem.hasFigure && (
          <span className="px-2 py-0.5 rounded text-[11px] bg-amber-500/20 text-amber-300">hasFigure</span>
        )}
        {problem.pointsHint && (
          <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-700 text-zinc-300">{problem.pointsHint}점</span>
        )}
        <div className="ml-auto text-[11px] text-zinc-500">choices: {problem.choices.length}</div>
      </div>
      <pre className="whitespace-pre-wrap text-[13px] text-zinc-200 bg-zinc-900/50 p-3 rounded font-sans leading-relaxed mb-2">
        {problem.content}
      </pre>
      {problem.choices.length > 0 && (
        <div className="space-y-1">
          {problem.choices.map((c, i) => (
            <div key={i} className="flex gap-2 items-baseline text-[13px]">
              <span className="text-cyan-400 font-bold w-6">{['①', '②', '③', '④', '⑤'][i] || `(${i + 1})`}</span>
              <span className="text-zinc-200 font-mono">{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// per-problem 결과 뷰
// =========================================================================

function PerProblemResultView({ result, clientMs }: { result: PerProblemResult; clientMs: number | null }) {
  if (!result.success && result.problems.length === 0) {
    return (
      <div className="rounded-xl border border-red-700 bg-red-900/20 p-4 mb-3 text-red-300">
        <div className="font-bold mb-1">per-problem 모드 실패</div>
        <pre className="text-xs whitespace-pre-wrap">{result.error}</pre>
      </div>
    );
  }
  return (
    <>
      <div className="rounded-xl border border-emerald-700 bg-emerald-900/10 p-5 mb-4">
        <div className="text-[11px] text-emerald-400 mb-2 font-bold">per-problem 결과</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="페이지" value={`${result.pageCount}`} />
          <Stat label="문제 수" value={`${result.problemCount}`} />
          <Stat label="모델" value={result.model || '-'} />
          <Stat label="처리 시간 (클라)" value={`${clientMs ?? '-'}ms`} />
          <Stat label="입력 토큰" value={`${result.totalUsage.promptTokens}`} />
          <Stat label="출력 토큰" value={`${result.totalUsage.candidatesTokens}`} />
          <Stat label="thinking" value={`${result.totalUsage.thoughtsTokens}`} />
          <Stat label="총 토큰" value={`${result.totalUsage.totalTokens}`} />
        </div>
      </div>
      {result.problems.map((p, i) => <PerProblemCard key={`${p.pageIdx}_${p.detectionIdx}_${i}`} problem={p} />)}
    </>
  );
}

function PerProblemCard({ problem }: { problem: PerProblem }) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/30 p-4 mb-3">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center">
          {problem.number}
        </span>
        <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-700 text-zinc-300">
          p.{problem.pageIdx + 1}
        </span>
        {problem.hasFigure && (
          <span className="px-2 py-0.5 rounded text-[11px] bg-amber-500/20 text-amber-300">hasFigure</span>
        )}
        {problem.pointsHint && (
          <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-700 text-zinc-300">{problem.pointsHint}점</span>
        )}
        {problem.confidence != null && (
          <span
            className={`px-2 py-0.5 rounded text-[11px] ${
              problem.confidence >= 0.8
                ? 'bg-emerald-500/20 text-emerald-300'
                : problem.confidence >= 0.5
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-red-500/20 text-red-300'
            }`}
          >
            conf {problem.confidence.toFixed(2)}
          </span>
        )}
        {problem.error && (
          <span className="px-2 py-0.5 rounded text-[11px] bg-red-500/20 text-red-300">error</span>
        )}
        <div className="ml-auto text-[11px] text-zinc-500">choices: {problem.choices.length}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 왼쪽: 원본 crop (YOLO 가 잘라낸 문제 영역) */}
        <div>
          <div className="text-[11px] text-zinc-500 mb-1">YOLO 크롭 (원본)</div>
          {problem.problemCropBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${problem.problemCropBase64}`}
              alt={`문제 ${problem.number} 크롭`}
              className="w-full rounded border border-zinc-600 bg-white"
            />
          ) : (
            <div className="text-[12px] text-zinc-500 italic bg-zinc-900/30 p-3 rounded">(크롭 없음)</div>
          )}
          <div className="mt-1 text-[10px] text-zinc-500 font-mono">
            bbox: ({problem.bbox.x.toFixed(3)}, {problem.bbox.y.toFixed(3)}) {problem.bbox.w.toFixed(3)}×{problem.bbox.h.toFixed(3)}
          </div>
        </div>

        {/* 오른쪽: Gemini OCR 결과 */}
        <div>
          <div className="text-[11px] text-emerald-400 mb-1">Gemini 추출 결과</div>
          {problem.error && (
            <pre className="text-[11px] text-red-300 bg-red-900/20 p-2 rounded whitespace-pre-wrap">{problem.error}</pre>
          )}
          <pre className="whitespace-pre-wrap text-[13px] text-zinc-200 bg-zinc-900/50 p-3 rounded font-sans leading-relaxed mb-3">
            {problem.content || '(빈 본문)'}
          </pre>
          {problem.choices.length > 0 && (
            <div>
              <div className="text-[11px] text-zinc-500 mb-1">choices</div>
              <div className="space-y-1">
                {problem.choices.map((c, i) => (
                  <div key={i} className="flex gap-2 items-baseline text-[13px]">
                    <span className="text-cyan-400 font-bold w-6">{['①', '②', '③', '④', '⑤'][i] || `(${i + 1})`}</span>
                    <span className="text-zinc-200 font-mono">{c}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 문제 안 OpenCV figures (lenient — <보기> 같은 텍스트 박스도 포함될 수 있음) */}
      {problem.figures && problem.figures.length > 0 && (
        <div className="mt-3 rounded border border-cyan-700 bg-cyan-900/10 p-3">
          <div className="text-[11px] text-cyan-300 mb-2 font-bold">
            문제 안 OpenCV 검출 ({problem.figures.length}건)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {problem.figures.map((fig, i) => (
              <div key={i} className="rounded border border-zinc-700 bg-zinc-900/50 p-2">
                <div className="text-[10px] text-zinc-500 mb-1 font-mono">
                  ({fig.x.toFixed(2)}, {fig.y.toFixed(2)}) {fig.w.toFixed(2)}×{fig.h.toFixed(2)}
                  {fig.cropWidth && fig.cropHeight && ` · ${fig.cropWidth}×${fig.cropHeight}px`}
                </div>
                {fig.cropBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/png;base64,${fig.cropBase64}`}
                    alt={`figure ${i + 1}`}
                    className="w-full rounded border border-zinc-600 bg-white"
                  />
                ) : (
                  <div className="text-[11px] text-zinc-500 italic">(no crop)</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-500 mb-0.5">{label}</div>
      <div className="text-zinc-100 font-mono text-sm">{value}</div>
    </div>
  );
}
