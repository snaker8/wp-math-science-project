'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  X, Search, Plus, Check, Loader2, BookOpen, Upload,
  ChevronDown, ChevronUp, Layers, FileStack,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';

// ============================================================================
// Types
// ============================================================================

interface SearchResult {
  id: string;
  content: string;
  answer: any;
  source: string;
  year: string;
  typeCode: string;
  typeName: string;
  difficulty: number;
  cognitiveDomain: string;
  alreadyInExam: boolean;
  images: any[];
}

interface GroupExam {
  id: string;
  title: string;
  problemIds: string[];
  problemCount: number;
}

interface AddProblemsModalProps {
  examId: string;
  onClose: () => void;
  onAdded: (count: number) => void;
}

// ============================================================================
// 난이도 뱃지 / 공통 문제 행
// ============================================================================

function DiffBadge({ d }: { d: number }) {
  const colors = ['', 'bg-green-600', 'bg-lime-600', 'bg-yellow-600', 'bg-orange-600', 'bg-red-600'];
  const labels = ['', '매우쉬움', '쉬움', '보통', '어려움', '매우어려움'];
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors[d] || 'bg-zinc-600'} text-white`}>
      {labels[d] || (d ? `난이도${d}` : '미분류')}
    </span>
  );
}

/** 선택 가능한 문제 한 행 (문제은행 탭 / 같은 그룹 탭 공용) */
function ProblemRow({ p, isSelected, isExpanded, onToggle, onExpand }: {
  p: SearchResult;
  isSelected: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  return (
    <div
      className={`rounded-lg border transition-colors ${
        p.alreadyInExam
          ? 'border-zinc-700 bg-zinc-800/50 opacity-50'
          : isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'
      }`}
    >
      <div className="flex items-start gap-2 p-3">
        <button
          onClick={() => !p.alreadyInExam && onToggle()}
          disabled={p.alreadyInExam}
          className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center ${
            p.alreadyInExam
              ? 'border-zinc-600 bg-zinc-700'
              : isSelected
              ? 'border-blue-500 bg-blue-500'
              : 'border-zinc-500 hover:border-blue-400'
          }`}
        >
          {(isSelected || p.alreadyInExam) && <Check className="w-3 h-3 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <DiffBadge d={p.difficulty} />
            {p.typeName && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-600 text-zinc-300">{p.typeName}</span>
            )}
            {p.source && <span className="text-[10px] text-zinc-500">{p.source}</span>}
            {p.alreadyInExam && <span className="text-[10px] text-yellow-500">이미 추가됨</span>}
          </div>
          <div className={`text-sm text-zinc-200 ${isExpanded ? '' : 'line-clamp-2'}`}>
            <MixedContentRenderer content={p.content} />
          </div>
        </div>

        <button onClick={onExpand} className="text-zinc-500 hover:text-zinc-300">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 같은 그룹 탭 — (1) 그룹 내 시험지 통째 합치기 + (2) 그룹 내 문제 개별 추가
// ============================================================================

function GroupTab({ examId, selectedIds, onToggle, onAdded, onClose }: {
  examId: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onAdded: (count: number) => void;
  onClose: () => void;
}) {
  const [exams, setExams] = useState<GroupExam[]>([]);
  const [problems, setProblems] = useState<SearchResult[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingExamId, setAddingExamId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/exams/${examId}/group-content`);
        const data = await res.json();
        setExams(data.exams || []);
        setProblems(data.problems || []);
        setGroupId(data.groupId ?? null);
      } catch (err) {
        console.error('group-content error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [examId]);

  const addWholeExam = useCallback(async (exam: GroupExam) => {
    if (exam.problemIds.length === 0) return;
    setAddingExamId(exam.id);
    try {
      const res = await fetch(`/api/exams/${examId}/problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemIds: exam.problemIds }),
      });
      const data = await res.json();
      if (data.success) {
        onAdded(data.added || 0);
        onClose();
      }
    } catch (err) {
      console.error('add whole exam error:', err);
    } finally {
      setAddingExamId(null);
    }
  }, [examId, onAdded, onClose]);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />불러오는 중...</div>;
  }

  if (!groupId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Layers className="w-10 h-10 text-zinc-600 mb-3" />
        <p className="text-zinc-300 font-medium mb-1">이 시험지는 폴더(그룹)에 속해있지 않습니다</p>
        <p className="text-zinc-500 text-sm">그룹으로 이동하면 같은 그룹의 시험지·문제를 합칠 수 있습니다. 위의 "문제은행 전체" 탭을 이용하세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 gap-4">
      {/* 그룹 내 시험지 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          <FileStack className="w-3.5 h-3.5" /> 그룹 내 시험지 ({exams.length}) — 통째로 합치기
        </div>
        {exams.length === 0 ? (
          <div className="text-sm text-zinc-500 px-1">같은 그룹에 다른 시험지가 없습니다.</div>
        ) : (
          <div className="space-y-1.5">
            {exams.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{e.title}</div>
                  <div className="text-[11px] text-zinc-500">{e.problemCount}문항</div>
                </div>
                <button
                  onClick={() => addWholeExam(e)}
                  disabled={addingExamId === e.id || e.problemCount === 0}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                >
                  {addingExamId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  통째로 추가
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 그룹 내 문제 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          <BookOpen className="w-3.5 h-3.5" /> 그룹 내 문제 ({problems.length}) — 개별 선택
        </div>
        {problems.length === 0 ? (
          <div className="text-sm text-zinc-500 px-1">그룹 내 문제가 없습니다.</div>
        ) : (
          <div className="space-y-1">
            {problems.map((p) => (
              <ProblemRow
                key={p.id}
                p={p}
                isSelected={selectedIds.has(p.id)}
                isExpanded={expandedId === p.id}
                onToggle={() => onToggle(p.id)}
                onExpand={() => setExpandedId(expandedId === p.id ? null : p.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 문제은행 전체 검색 탭
// ============================================================================

function BankTab({ examId, selectedIds, onToggle }: {
  examId: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const doSearch = useCallback(async () => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (difficulty) params.set('difficulty', difficulty);
      params.set('excludeExamId', examId);
      params.set('limit', '30');
      const res = await fetch(`/api/problems/search?${params}`);
      const data = await res.json();
      setResults(data.problems || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, [query, difficulty, examId]);

  useEffect(() => { doSearch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 p-3 border-b border-zinc-700">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="키워드로 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="bg-zinc-800 border border-zinc-600 rounded-lg text-sm text-white px-2"
        >
          <option value="">전체 난이도</option>
          <option value="1">매우쉬움</option>
          <option value="2">쉬움</option>
          <option value="3">보통</option>
          <option value="4">어려움</option>
          <option value="5">매우어려움</option>
        </select>
        <button
          onClick={doSearch}
          disabled={isSearching}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white flex items-center gap-1"
        >
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          검색
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {results.length === 0 && !isSearching && (
          <div className="text-center text-zinc-500 py-8">검색 결과가 없습니다</div>
        )}
        {results.map((p) => (
          <ProblemRow
            key={p.id}
            p={p}
            isSelected={selectedIds.has(p.id)}
            isExpanded={expandedId === p.id}
            onToggle={() => onToggle(p.id)}
            onExpand={() => setExpandedId(expandedId === p.id ? null : p.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 파일 업로드 탭
// ============================================================================

function UploadTab({ examId, onClose }: { examId: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <div className="w-full max-w-md text-center">
        <Upload className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
        <p className="text-zinc-200 text-lg font-medium mb-2">파일 업로드로 문제 추가</p>
        <p className="text-zinc-400 text-sm mb-6">
          기존 업로드 워크플로우에서 OCR 방식을 선택하고<br />
          처리된 문제가 이 시험지에 자동으로 추가됩니다.
        </p>
        <button
          onClick={() => { onClose(); window.location.href = `/dashboard/cloud?appendTo=${examId}`; }}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
        >
          <Upload className="w-5 h-5" />
          업로드 페이지로 이동
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 메인 모달
// ============================================================================

export default function AddProblemsModal({ examId, onClose, onAdded }: AddProblemsModalProps) {
  const [tab, setTab] = useState<'group' | 'bank' | 'upload'>('group');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsAdding(true);
    try {
      const res = await fetch(`/api/exams/${examId}/problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemIds: [...selectedIds] }),
      });
      const data = await res.json();
      if (data.success) {
        onAdded(data.added || 0);
        onClose();
      }
    } catch (err) {
      console.error('Add problems error:', err);
    } finally {
      setIsAdding(false);
    }
  }, [examId, selectedIds, onAdded, onClose]);

  const tabs = [
    { key: 'group' as const, label: '같은 그룹', Icon: Layers },
    { key: 'bank' as const, label: '문제은행 전체', Icon: BookOpen },
    { key: 'upload' as const, label: '파일 업로드', Icon: Upload },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-[700px] h-[600px] flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-700">
          <h2 className="text-lg font-bold text-white">문제 추가</h2>
          <div className="flex items-center gap-2">
            {tab !== 'upload' && selectedIds.size > 0 && (
              <button
                onClick={handleAddSelected}
                disabled={isAdding}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white"
              >
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {selectedIds.size}개 추가
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-zinc-700 rounded-lg">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-zinc-700">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                tab === key ? 'text-blue-400 border-b-2 border-blue-400' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* 탭 내용 */}
        <div className="flex-1 overflow-hidden">
          {tab === 'group' ? (
            <GroupTab examId={examId} selectedIds={selectedIds} onToggle={toggleSelect} onAdded={onAdded} onClose={onClose} />
          ) : tab === 'bank' ? (
            <BankTab examId={examId} selectedIds={selectedIds} onToggle={toggleSelect} />
          ) : (
            <UploadTab examId={examId} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
