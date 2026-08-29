'use client';

// ============================================================================
// GradingSheetUpload — 채점표 이미지 OCR 자동 채점 모달
//
// 흐름:
//   1) 사용자가 학생 답안표 사진(이미지/PDF) 업로드
//   2) POST /api/sessions/[id]/grading-sheet → OCR + 매칭 미리보기
//   3) 강사가 결과 확인 + 필요시 개별 row 수정
//   4) "채점 결과 저장" → PUT 으로 session_results upsert
// ============================================================================

import React, { useState } from 'react';
import { X, Upload, Loader2, Check, AlertCircle, CheckCircle2, XCircle, HelpCircle, Save } from 'lucide-react';

type ErrorCause = '개념' | '유형' | '계산' | '문장제' | '시간';
const ERROR_CAUSES: ErrorCause[] = ['개념', '유형', '계산', '문장제', '시간'];

interface MatchRow {
  seq: number;
  student_answer: string;
  normalized_student: string;
  correct_answer: string;
  is_correct: boolean | null;
  mode: 'objective' | 'numeric' | 'manual';
  found_in_session: boolean;
}

interface PreviewResponse {
  matches: MatchRow[];
  summary: {
    total: number;
    correct: number;
    wrong: number;
    needs_review: number;
    not_in_session: number;
  };
}

interface Props {
  sessionId: string;
  studentName: string;
  examTitle: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function GradingSheetUpload({
  sessionId, studentName, examTitle, onClose, onSaved,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  // 강사 수동 조정 — seq → { is_correct, error_cause }
  const [overrides, setOverrides] = useState<Record<number, { is_correct: boolean | null; error_cause: ErrorCause | null }>>({});

  const handleFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    // 형식 가드
    const ok = /^(image\/|application\/pdf)/.test(f.type) || /\.(jpg|jpeg|png|webp|pdf)$/i.test(f.name);
    if (!ok) {
      setError('이미지(JPG/PNG/WebP) 또는 PDF 만 업로드 가능합니다.');
      return;
    }
    setError(null);
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/sessions/${sessionId}/grading-sheet`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'OCR 실패');
      setPreview(data as PreviewResponse);
      // 미리보기를 overrides 초기값으로 복사
      const init: Record<number, { is_correct: boolean | null; error_cause: ErrorCause | null }> = {};
      for (const m of (data as PreviewResponse).matches) {
        init[m.seq] = { is_correct: m.is_correct, error_cause: null };
      }
      setOverrides(init);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const matches = preview.matches
        .filter(m => m.found_in_session)
        .map(m => {
          const o = overrides[m.seq] || { is_correct: m.is_correct, error_cause: null };
          // null (자동채점 보류) 은 저장에서 제외 — 강사가 명시 토글하지 않은 한
          if (o.is_correct === null) return null;
          return {
            sequence_number: m.seq,
            is_correct: o.is_correct,
            error_cause: o.is_correct === false ? o.error_cause : null,
            student_answer_text: m.student_answer,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (matches.length === 0) {
        setError('저장할 채점 결과가 없습니다. O/X 를 한 번씩 확정해주세요.');
        setBusy(false);
        return;
      }

      const res = await fetch(`/api/sessions/${sessionId}/grading-sheet`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      if (onSaved) onSaved();
      alert(`${data.saved}개 채점 결과 저장 완료`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleCorrect = (seq: number, isCorrect: boolean) => {
    setOverrides(prev => ({
      ...prev,
      [seq]: {
        is_correct: isCorrect,
        error_cause: isCorrect ? null : (prev[seq]?.error_cause ?? null),
      },
    }));
  };

  const setCause = (seq: number, cause: ErrorCause | null) => {
    setOverrides(prev => ({
      ...prev,
      [seq]: { ...prev[seq], error_cause: cause },
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-content-primary">채점표 이미지 자동 채점</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{studentName} · {examTitle}</p>
          </div>
          <button type="button" onClick={() => !busy && onClose()} className="text-zinc-500 hover:text-content-primary">
            <X size={20} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!preview ? (
            <>
              <div className="text-sm text-zinc-400">
                학생이 작성한 답안표 사진(또는 PDF)을 업로드하면 AI 가 번호별 답을 인식해 자동 채점합니다.
              </div>

              <label className="block border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-white/[.3] hover:bg-white/[.04] transition-colors">
                <Upload size={28} className="text-zinc-500 mx-auto mb-2" />
                <p className="text-sm text-zinc-300">파일 선택</p>
                <p className="text-[11px] text-zinc-500 mt-1">JPG / PNG / WebP / PDF</p>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                  disabled={busy}
                />
              </label>

              {file && (
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-sm text-zinc-300 flex items-center gap-2">
                  <Check size={14} className="text-emerald-400" />
                  <span className="flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-zinc-500">{(file.size / 1024).toFixed(0)} KB</span>
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-sm text-rose-300 flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5" /> {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || busy}
                className="w-full rounded-full bg-white hover:bg-zinc-200 disabled:opacity-50 text-black font-semibold py-3 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                AI 채점 시작
              </button>
            </>
          ) : (
            <>
              {/* 요약 */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2.5">
                  <div className="text-[10px] text-zinc-500 uppercase">전체</div>
                  <div className="text-xl font-bold text-content-primary">{preview.summary.total}</div>
                </div>
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2.5">
                  <div className="text-[10px] text-emerald-500 uppercase">정답</div>
                  <div className="text-xl font-bold text-emerald-400">{preview.summary.correct}</div>
                </div>
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5">
                  <div className="text-[10px] text-rose-500 uppercase">오답</div>
                  <div className="text-xl font-bold text-rose-400">{preview.summary.wrong}</div>
                </div>
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5">
                  <div className="text-[10px] text-amber-500 uppercase">검토 필요</div>
                  <div className="text-xl font-bold text-amber-400">{preview.summary.needs_review}</div>
                </div>
              </div>

              {/* 매칭 row 들 */}
              <div className="space-y-2">
                {preview.matches.map((m) => {
                  const o = overrides[m.seq] || { is_correct: m.is_correct, error_cause: null };
                  const isO = o.is_correct === true;
                  const isX = o.is_correct === false;
                  return (
                    <div
                      key={m.seq}
                      className={`rounded-lg border p-3 ${
                        !m.found_in_session
                          ? 'border-zinc-800 bg-zinc-900/50 opacity-50'
                          : isO
                            ? 'border-emerald-500/40 bg-emerald-500/5'
                            : isX
                              ? 'border-rose-500/40 bg-rose-500/5'
                              : 'border-amber-500/40 bg-amber-500/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-content-primary w-8 text-center">{m.seq}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-zinc-500 uppercase tracking-wider">학생답</div>
                          <div className="text-sm text-content-primary font-medium truncate">
                            {m.student_answer || <span className="text-zinc-600">—</span>}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-zinc-500 uppercase tracking-wider">정답</div>
                          <div className="text-sm text-zinc-300 truncate">
                            {m.correct_answer || <span className="text-zinc-600">—</span>}
                          </div>
                        </div>
                        {m.found_in_session ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleCorrect(m.seq, true)}
                              className={`px-3 py-1.5 rounded-lg font-bold text-sm transition-all ${
                                isO
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-white/5 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10'
                              }`}
                            >
                              O
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleCorrect(m.seq, false)}
                              className={`px-3 py-1.5 rounded-lg font-bold text-sm transition-all ${
                                isX
                                  ? 'bg-rose-500 text-white'
                                  : 'bg-white/5 text-rose-400 border border-rose-500/30 hover:bg-rose-500/10'
                              }`}
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-500 px-2 py-1 rounded bg-zinc-800">
                            세션에 없음
                          </span>
                        )}
                      </div>

                      {/* 오답 원인 칩 (X 일 때만) */}
                      {isX && (
                        <div className="flex items-center gap-1.5 mt-2 ml-12 flex-wrap">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">원인:</span>
                          {ERROR_CAUSES.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setCause(m.seq, o.error_cause === c ? null : c)}
                              className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                                o.error_cause === c
                                  ? 'border-white/[.14] bg-white/[.08] text-content-primary'
                                  : 'bg-white/5 text-zinc-400 border-zinc-700 hover:border-white/[.2] hover:text-content-primary'
                              }`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {error && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-sm text-rose-300 flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5" /> {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        {preview && (
          <div className="border-t border-zinc-800 px-5 py-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => { setPreview(null); setFile(null); setOverrides({}); }}
              disabled={busy}
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              다른 이미지 업로드
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="rounded-full bg-white hover:bg-zinc-200 disabled:opacity-50 text-black font-semibold px-4 py-2 flex items-center gap-2"
            >
              {busy ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              채점 결과 저장
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
