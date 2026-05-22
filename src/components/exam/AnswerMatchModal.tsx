'use client';

import React, { useState, useCallback } from 'react';
import { X, Upload, Loader2, Check, AlertTriangle, FileText, ClipboardPaste } from 'lucide-react';

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

interface ProblemInfo {
  id: string;
  number: number;
  answer: string | number;  // 객관식은 ①~⑤ 문자, 단답식은 number 도 가능
}

interface AnswerMatchModalProps {
  isOpen: boolean;
  examId: string;
  problems?: ProblemInfo[];
  onClose: () => void;
  onApplied: () => void;
}

export function AnswerMatchModal({ isOpen, examId, problems, onClose, onApplied }: AnswerMatchModalProps) {
  const [mode, setMode] = useState<'text' | 'quick' | 'solution'>('text'); // ★ 기본값 텍스트 입력
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set());
  const [pasteText, setPasteText] = useState('');

  const MAX_FILES = 10;

  // 파일 이름 오름차순 정렬 (page-001, page-002, ... 순서 보장)
  const sortFiles = (arr: File[]) =>
    [...arr].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    setFiles(prev => sortFiles([...prev, ...picked].slice(0, MAX_FILES)));
    setMatchResult(null);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length === 0) return;
    setFiles(prev => sortFiles([...prev, ...dropped].slice(0, MAX_FILES)));
    setMatchResult(null);
    setError(null);
  }, []);

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // ★ 텍스트 붙여넣기 파싱 (답 추출기 형식)
  //   2026-05-18: **번호 기반 매칭** 추가 — "30. ③" 만 붙여넣으면 30번만 등록.
  //   누락된 일부 번호만 재등록하거나, 특정 번호만 개별 등록할 때 사용.
  //   모든 줄에 번호 prefix 가 있으면 번호 기반, 그렇지 않으면 기존 순서 기반.
  const handleTextParse = () => {
    if (!pasteText.trim() || !problems || problems.length === 0) {
      setError('텍스트를 붙여넣거나 문제가 없습니다');
      return;
    }

    // ★ 빈 줄도 보존 (빈 줄 = 해당 문제 답 없음 / 건너뛰기)
    // 단, 맨 앞/뒤의 빈 줄만 trim
    const lines = pasteText.replace(/^\n+|\n+$/g, '').split('\n');
    type ParsedLine = {
      num: number | null; // 번호 prefix 가 있으면 그 번호, 없으면 null
      type: 'shortAnswer' | 'narrative' | 'empty';
      answer: string;
    };
    const parsed: ParsedLine[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // ★ 빈 줄 = 건너뛰기 (해당 번호는 답 변경 없음)
      if (!trimmed) {
        parsed.push({ num: null, type: 'empty', answer: '' });
        continue;
      }

      // 형식 1: shortAnswer\t3 또는 narrative\tπ/3 (탭 또는 공백 2개 이상)
      const extractorMatch = trimmed.match(/^(shortAnswer|narrative)[\t\s]{1,}(.+)/);
      if (extractorMatch) {
        parsed.push({
          num: null,
          type: extractorMatch[1] as 'shortAnswer' | 'narrative',
          answer: extractorMatch[2].trim(),
        });
        continue;
      }

      // 형식 2: 1. 3 또는 1) 3 또는 30. ③ 또는 1. a=2,b=1,c=8
      //   ★ 번호도 추출 — 번호 기반 매칭에 사용
      const numMatch = trimmed.match(/^(\d+)[.)]\s*(.+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        const ans = numMatch[2].trim();
        const isPureNum = /^-?\d+(?:[.,]\d+)?$/.test(ans);
        parsed.push({
          num,
          type: isPureNum ? 'shortAnswer' : 'narrative',
          answer: ans, // ★ LaTeX/수식/좌표 그대로 보존
        });
        continue;
      }

      // 형식 3: 단순 숫자 (정수/음수/소수)
      if (/^-?\d+(?:[.,]\d+)?$/.test(trimmed)) {
        parsed.push({ num: null, type: 'shortAnswer', answer: trimmed });
        continue;
      }

      // 기타: 수식/좌표/LaTeX 등 → narrative로 원본 그대로 보존
      // 예: "a=2,b=1,c=8", "-4,-1,4", "\frac{3}{2}", "(x,y)=(2,3)"
      parsed.push({ num: null, type: 'narrative', answer: trimmed });
    }

    if (parsed.length === 0) {
      setError('파싱된 답이 없습니다');
      return;
    }

    // 문제 목록과 매칭
    const sortedProblems = [...problems].sort((a, b) => a.number - b.number);

    // ★ 번호 기반 매칭 분기: 비어있지 않은 줄 중 *모두* 번호 prefix 가 있으면 번호 기반.
    //   그렇지 않으면 기존 순서 기반 (백워드 호환). 빈 줄은 양쪽 모두 건너뛰기.
    const nonEmptyParsed = parsed.filter(p => p.type !== 'empty');
    const allHaveNum = nonEmptyParsed.length > 0 && nonEmptyParsed.every(p => p.num !== null);
    const matches: MatchResult[] = [];

    if (allHaveNum) {
      // ★ 번호 기반: 명시된 번호만 적용, 다른 번호는 변경 없음
      const byNum = new Map<number, ParsedLine>();
      for (const p of nonEmptyParsed) {
        if (p.num !== null) byNum.set(p.num, p);
      }
      for (const prob of sortedProblems) {
        const parsedItem = byNum.get(prob.number);
        const newAnswer = parsedItem?.answer || '';
        const currentAnswer = String(prob.answer || '');
        matches.push({
          problemNumber: prob.number,
          problemId: prob.id,
          currentAnswer,
          newAnswer,
          currentSolution: '',
          newSolution: '',
          hasChange: !!newAnswer && newAnswer !== currentAnswer,
        });
      }
    } else {
      // ★ 순서 기반 (기존): parsed 개수가 더 많으면 parsed 기준으로 생성
      const maxLen = Math.max(sortedProblems.length, parsed.length);
      for (let i = 0; i < maxLen; i++) {
        const p = sortedProblems[i];
        const parsedAnswer = parsed[i];
        const newAnswer = parsedAnswer?.answer || '';
        const currentAnswer = p ? String(p.answer || '') : '';
        // ★ empty 타입이면 답 변경 없음 (빈 줄로 건너뛰기)
        const isEmpty = parsedAnswer?.type === 'empty';
        matches.push({
          problemNumber: p?.number || (i + 1),
          problemId: p?.id || '',
          currentAnswer,
          newAnswer,
          currentSolution: '',
          newSolution: '',
          hasChange: !!p && !isEmpty && !!newAnswer && newAnswer !== currentAnswer,
        });
      }
    }

    const changedCount = matches.filter(m => m.hasChange).length;

    setMatchResult({
      examId,
      detectedType: 'text_paste',
      totalProblems: sortedProblems.length,
      parsedAnswers: parsed.length,
      parsedSolutions: 0,
      changedCount,
      matches,
      rawTextPreview: pasteText.slice(0, 200),
    });

    const changed = new Set(matches.filter(m => m.hasChange).map(m => m.problemNumber));
    setSelectedMatches(changed);
    setError(null);
  };

  // 업로드 + OCR + 파싱 + 매칭 미리보기
  const handleUpload = async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      for (const f of files) formData.append('file', f);
      const docType = mode === 'solution' ? 'solution' : 'quick_answer';
      formData.append('docType', docType);

      const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
      console.log(`[AnswerMatch] Uploading (${docType}): ${files.length}개 파일, 총 ${totalBytes} bytes`, files.map(f => f.name));
      const res = await fetch(`/api/exams/${examId}/match-answers`, {
        method: 'POST',
        body: formData,
      });

      let data: any;
      try {
        data = await res.json();
      } catch (parseErr) {
        const text = await res.text().catch(() => '');
        throw new Error(`응답 파싱 실패 (${res.status}): ${text.substring(0, 200)}`);
      }

      console.log('[AnswerMatch] Response:', res.status, data);

      if (!res.ok) throw new Error(data?.error || `매칭 실패 (${res.status})`);
      if (!data.matches) throw new Error('매칭 데이터가 없습니다. OCR 결과: ' + (data.rawTextPreview || '(비어 있음)'));

      setMatchResult(data);
      // ★ 자동 체크는 newAnswer/newSolution 가 있는 모든 행 — hasChange=false 도 포함.
      //   (currentAnswer === newAnswer 인 경우도 사용자가 "확인 적용" 의도일 수 있음.
      //   진단평가에서 일부 답이 적용 후 누락되는 사고 차단 — 가설 A 보강)
      const autoSelected = new Set<number>(
        data.matches
          .filter((m: MatchResult) => !!m.newAnswer || !!m.newSolution)
          .map((m: MatchResult) => m.problemNumber)
      );
      setSelectedMatches(autoSelected);
    } catch (err) {
      console.error('[AnswerMatch] Error:', err);
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
      // ★ hasChange filter 제거 — 사용자가 명시적으로 체크한 행은 모두 PUT 송신.
      //   동일값 update 라도 서버는 멱등 처리 + answer_user_edited 플래그 박힘.
      //   진단평가 빠른답 누락 사고 차단 (가설 A 보강).
      const toApply = matchResult.matches
        .filter(m => selectedMatches.has(m.problemNumber) && (!!m.newAnswer || !!m.newSolution))
        .map(m => ({
          problemId: m.problemId,
          newAnswer: m.newAnswer || undefined,
          newSolution: m.newSolution || undefined,
        }));

      console.log(`[AnswerMatch] PUT 송신: ${toApply.length}건`, toApply.slice(0, 5));

      const res = await fetch(`/api/exams/${examId}/match-answers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches: toApply }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '적용 실패');

      // ★ 서버 응답의 실패/스킵 사례 표면화 — 사고 시 즉시 식별 가능.
      // ★ 강등 사례 (객관식 모호값 → 빈값) 도 사용자에게 보고 — 2026-05-18 보완
      const failedList = Array.isArray(data.failedUpdates) ? data.failedUpdates : [];
      const coercedList = Array.isArray(data.coercedToEmpty) ? data.coercedToEmpty : [];

      // problemId → problemNumber 매핑
      const idToNum = new Map<string, number>();
      matchResult.matches.forEach(m => idToNum.set(m.problemId, m.problemNumber));

      const failedNumbers: number[] = failedList
        .map((f: { problemId: string }) => idToNum.get(f.problemId))
        .filter((n: number | undefined): n is number => !!n)
        .sort((a: number, b: number) => a - b);
      const coercedNumbers: Array<{ num: number; raw: string }> = coercedList
        .map((c: { problemId: string; rawAnswer: string }) => ({
          num: idToNum.get(c.problemId),
          raw: c.rawAnswer,
        }))
        .filter((c: { num: number | undefined; raw: string }): c is { num: number; raw: string } => !!c.num)
        .sort((a: { num: number }, b: { num: number }) => a.num - b.num);

      const lines: string[] = [`${data.updatedCount}개 적용 완료`];
      if (failedNumbers.length > 0) {
        console.error('[AnswerMatch] 일부 update 실패:', data.failedUpdates);
        lines.push(`❌ ${failedNumbers.length}개 실패 (번호: ${failedNumbers.join(', ')}) — 콘솔 확인`);
      }
      if (coercedNumbers.length > 0) {
        console.warn('[AnswerMatch] 객관식 모호값 → 빈값 강등:', coercedList);
        const detail = coercedNumbers.map((c: { num: number; raw: string }) => `${c.num}번(OCR: "${c.raw}")`).join(', ');
        lines.push(`⚠️ ${coercedNumbers.length}개는 OCR 답 모호 → 빈값 강등: ${detail}\n   → 텍스트 모드에서 "30. ③" 같이 직접 입력해 재등록 가능`);
      }
      alert(lines.join('\n\n'));
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
          <h2 className="text-sm font-bold text-content-primary">빠른답 / 해설</h2>
          <button onClick={onClose} className="p-1 text-content-muted hover:text-content-secondary">
            <X size={18} />
          </button>
        </div>

        {/* ★ 탭 선택 */}
        {!matchResult && (
          <div className="flex border-b border-subtle">
            <button
              onClick={() => { setMode('text'); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                mode === 'text'
                  ? 'text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              <ClipboardPaste size={14} />
              텍스트 붙여넣기
            </button>
            <button
              onClick={() => { setMode('quick'); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                mode === 'quick'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              <Upload size={14} />
              빠른답 업로드
            </button>
            <button
              onClick={() => { setMode('solution'); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                mode === 'solution'
                  ? 'text-amber-400 border-b-2 border-amber-500 bg-amber-500/5'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              <FileText size={14} />
              해설 업로드
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">

          {/* ★ 텍스트 붙여넣기 모드 */}
          {mode === 'text' && !matchResult && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-secondary font-medium">답 추출기 결과 붙여넣기</span>
                  <span className="text-[10px] text-content-muted">shortAnswer/narrative 또는 1. 3 형식</span>
                </div>
                {/* ★ 개별 번호 등록 안내 (2026-05-18) — 누락분 재등록·일부 번호만 등록 가능 */}
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] leading-relaxed text-content-secondary">
                  💡 <b>번호 명시하면 해당 번호만 등록</b> — 누락된 일부만 재등록할 때 사용.
                  <br />
                  예: <code className="text-emerald-400">30. ③</code> 만 붙여넣으면 <b>30번만</b> 등록됩니다.
                  번호 없이 답만 나열하면 1번부터 순서대로 매칭.
                </div>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`# 개별 번호만 등록 (번호 prefix 사용):\n30. ③\n32. 7\n\n# 또는 전체 일괄 등록 (번호 prefix 통일 or 생략):\n1. 3\n2. 2\n3. 4\n\n# 답 추출기 형식:\nshortAnswer\\t3\nnarrative\\tπ/3`}
                  className="w-full h-48 rounded-lg border border-subtle bg-surface-raised px-3 py-2.5 text-sm text-content-primary font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                  autoFocus
                />
              </div>
              <button
                onClick={handleTextParse}
                disabled={!pasteText.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-50"
              >
                <Check size={16} /> 파싱 + 미리보기
              </button>
            </>
          )}

          {/* 파일 업로드 모드 (빠른답 / 해설) */}
          {(mode === 'quick' || mode === 'solution') && !matchResult && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                className={`border-2 border-dashed border-subtle rounded-xl p-6 text-center transition-colors cursor-pointer ${
                  mode === 'solution' ? 'hover:border-amber-500/50' : 'hover:border-indigo-500/50'
                }`}
                onClick={() => document.getElementById('answer-file-input')?.click()}
              >
                <input
                  id="answer-file-input"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Upload size={32} className="mx-auto text-content-muted mb-2" />
                <p className="text-sm text-content-secondary">
                  {mode === 'solution' ? '해설지 파일을 드롭하세요' : '빠른답 파일을 드롭하세요'}
                </p>
                <p className="text-xs text-content-muted mt-1">PDF, PNG, JPG · 여러 장 선택 가능 (최대 {MAX_FILES}개)</p>
              </div>

              {files.length > 0 && (
                <div className="space-y-1.5 max-h-52 overflow-auto rounded-lg border border-subtle bg-surface-raised/50 p-2">
                  {files.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-raised">
                      <FileText size={14} className={`shrink-0 ${mode === 'solution' ? 'text-amber-400' : 'text-indigo-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-content-primary truncate">{f.name}</p>
                        <p className="text-[10px] text-content-muted">{(f.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        className="p-1 text-content-muted hover:text-red-400"
                        aria-label="파일 제거"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {files.length > 0 && (
                <button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-white font-medium text-sm transition-colors disabled:opacity-50 ${
                    mode === 'solution'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  {isUploading ? (
                    <><Loader2 size={16} className="animate-spin" /> {mode === 'solution' ? 'OCR + 해설 파싱' : 'OCR + 매칭 분석'} 중 ({files.length}장)...</>
                  ) : (
                    <><Upload size={16} /> {files.length}개 파일 분석 시작</>
                  )}
                </button>
              )}
            </>
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
                <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                  {matchResult.detectedType === 'text_paste' ? '텍스트 입력' :
                   matchResult.detectedType === 'quick_answer' ? '빠른답' :
                   matchResult.detectedType === 'solution' ? '해설' :
                   matchResult.detectedType === 'mixed' ? '빠른답+해설' : '미확인'}
                </span>
                <span className="text-content-muted">
                  답 {matchResult.parsedAnswers}개 · 변경 {matchResult.changedCount}개
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
                  onClick={() => { setMatchResult(null); setFiles([]); setPasteText(''); }}
                  className="text-xs text-content-muted hover:text-content-secondary"
                >
                  다시 입력
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
