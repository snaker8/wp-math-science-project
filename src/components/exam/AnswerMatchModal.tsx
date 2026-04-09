'use client';

import React, { useState, useCallback } from 'react';
import { X, Upload, Loader2, Check, AlertTriangle, FileText } from 'lucide-react';

interface MatchResult {
  problemNumber: number;
  problemId: string;
  currentAnswer: string;
  newAnswer: string;
  currentSolution: string;
  newSolution: string;
  hasChange: boolean;
}

interface MatchResponse {
  examId: string;
  detectedType: string;
  totalProblems: number;
  parsedAnswers: number;
  parsedSolutions: number;
  changedCount: number;
  matches: MatchResult[];
  rawTextPreview: string;
}

interface AnswerMatchModalProps {
  isOpen: boolean;
  examId: string;
  onClose: () => void;
  onApplied: () => void;
}

export function AnswerMatchModal({ isOpen, examId, onClose, onApplied }: AnswerMatchModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set());

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setMatchResult(null);
      setError(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      setMatchResult(null);
      setError(null);
    }
  }, []);

  // 업로드 + OCR + 파싱 + 매칭 미리보기
  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/exams/${examId}/match-answers`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '매칭 실패');

      setMatchResult(data);
      // 변경이 있는 항목 전체 선택
      const changed = new Set(data.matches.filter((m: MatchResult) => m.hasChange).map((m: MatchResult) => m.problemNumber));
      setSelectedMatches(changed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsUploading(false);
    }
  };

  // 선택된 매칭 적용
  const handleApply = async () => {
    if (!matchResult) return;
    setIsApplying(true);
    setError(null);

    try {
      const toApply = matchResult.matches
        .filter(m => selectedMatches.has(m.problemNumber) && m.hasChange)
        .map(m => ({
          problemId: m.problemId,
          newAnswer: m.newAnswer || undefined,
          newSolution: m.newSolution || undefined,
        }));

      const res = await fetch(`/api/exams/${examId}/match-answers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches: toApply }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '적용 실패');

      alert(`${data.updatedCount}개 문제에 빠른답/해설이 적용되었습니다.`);
      onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsApplying(false);
    }
  };

  const toggleMatch = (num: number) => {
    setSelectedMatches(prev => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  const toggleAll = () => {
    if (!matchResult) return;
    const changed = matchResult.matches.filter(m => m.hasChange);
    if (selectedMatches.size === changed.length) {
      setSelectedMatches(new Set());
    } else {
      setSelectedMatches(new Set(changed.map(m => m.problemNumber)));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-subtle bg-surface-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-subtle">
          <h2 className="text-sm font-bold text-content-primary">빠른답 / 해설 업로드</h2>
          <button onClick={onClose} className="p-1 text-content-muted hover:text-content-secondary">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* 파일 선택 */}
          {!matchResult && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-subtle rounded-xl p-8 text-center hover:border-indigo-500/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById('answer-file-input')?.click()}
            >
              <input
                id="answer-file-input"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileSelect}
                className="hidden"
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText size={24} className="text-indigo-400" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-content-primary">{file.name}</p>
                    <p className="text-xs text-content-muted">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
              ) : (
                <div>
                  <Upload size={32} className="mx-auto text-content-muted mb-2" />
                  <p className="text-sm text-content-secondary">빠른답 또는 해설 파일을 드롭하세요</p>
                  <p className="text-xs text-content-muted mt-1">PDF, PNG, JPG 지원</p>
                </div>
              )}
            </div>
          )}

          {/* 업로드 버튼 */}
          {file && !matchResult && (
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <><Loader2 size={16} className="animate-spin" /> OCR + 매칭 분석 중...</>
              ) : (
                <><Upload size={16} /> 분석 시작</>
              )}
            </button>
          )}

          {/* 에러 */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <span className="text-xs text-red-400">{error}</span>
            </div>
          )}

          {/* 매칭 결과 */}
          {matchResult && (
            <>
              {/* 요약 */}
              <div className="flex items-center gap-4 text-xs">
                <span className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 font-medium">
                  감지: {matchResult.detectedType === 'quick_answer' ? '빠른답' : matchResult.detectedType === 'solution' ? '해설' : matchResult.detectedType === 'mixed' ? '빠른답+해설' : '미확인'}
                </span>
                <span className="text-content-muted">
                  빠른답 {matchResult.parsedAnswers}개 · 해설 {matchResult.parsedSolutions}개 · 변경 {matchResult.changedCount}개
                </span>
                <button onClick={toggleAll} className="ml-auto text-blue-400 hover:text-blue-300 font-medium">
                  {selectedMatches.size > 0 ? '전체 해제' : '전체 선택'}
                </button>
              </div>

              {/* 매칭 테이블 */}
              <div className="border border-subtle rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-raised border-b border-subtle">
                      <th className="px-3 py-2 text-left w-8"></th>
                      <th className="px-3 py-2 text-left w-10">#</th>
                      <th className="px-3 py-2 text-left">현재 답</th>
                      <th className="px-3 py-2 text-left">새 답</th>
                      <th className="px-3 py-2 text-left">해설</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchResult.matches.map(m => (
                      <tr
                        key={m.problemNumber}
                        className={`border-b border-subtle/50 ${m.hasChange ? 'bg-emerald-500/5' : ''}`}
                      >
                        <td className="px-3 py-2">
                          {m.hasChange && (
                            <button
                              onClick={() => toggleMatch(m.problemNumber)}
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                selectedMatches.has(m.problemNumber)
                                  ? 'border-emerald-500 bg-emerald-500'
                                  : 'border-zinc-600'
                              }`}
                            >
                              {selectedMatches.has(m.problemNumber) && <Check size={10} className="text-white" />}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 font-bold text-content-secondary">{m.problemNumber}</td>
                        <td className="px-3 py-2 text-content-muted">{m.currentAnswer || '-'}</td>
                        <td className={`px-3 py-2 font-medium ${m.newAnswer && m.newAnswer !== m.currentAnswer ? 'text-emerald-400' : 'text-content-muted'}`}>
                          {m.newAnswer || '-'}
                        </td>
                        <td className="px-3 py-2">
                          {m.newSolution ? (
                            <span className="text-blue-400">있음</span>
                          ) : (
                            <span className="text-content-muted">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 적용 버튼 */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setMatchResult(null); setFile(null); }}
                  className="text-xs text-content-muted hover:text-content-secondary"
                >
                  다시 업로드
                </button>
                <button
                  onClick={handleApply}
                  disabled={isApplying || selectedMatches.size === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {isApplying ? (
                    <><Loader2 size={14} className="animate-spin" /> 적용 중...</>
                  ) : (
                    <><Check size={14} /> {selectedMatches.size}개 적용</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
