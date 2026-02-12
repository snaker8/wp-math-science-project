'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  FolderOpen,
  Folder,
  MoreHorizontal,
  Search,
  ListFilter,
  ArrowUpDown,
  ArrowDownUp,
  Copy,
  FileDown,
  Trash2,
  Image as ImageIcon,
  FileText,
  Smile,
  GripVertical,
  Sparkles,
  Pencil,
  FolderPlus,
  Loader2,
  Database,
  Upload,
  X,
} from 'lucide-react';
import CloudFlowUploader from '@/components/workflow/CloudFlowUploader';
import { supabaseBrowser } from '@/lib/supabase/client';

// ============================================================================
// Types
// ============================================================================

interface BookGroup {
  id: string;
  name: string;
  children?: BookGroup[];
  isExpanded?: boolean;
  examCount?: number;
  examIds?: string[]; // 이 그룹에 속한 시험지 ID 목록
}

interface ExamFile {
  id: string;
  order: number;
  fileName: string;
  hasImage: boolean;
  problemCount: number;
  createdAt?: string;
}

interface DBExam {
  id: string;
  title: string;
  fileName: string;
  status: string;
  problemCount: number;
  hasImage: boolean;
  school: string;
  year: string;
  createdAt: string;
}

type SortField = 'order' | 'name' | 'problems';
type SortDir = 'asc' | 'desc';

// ============================================================================
// DB 시험지 데이터에서 북그룹 트리 자동 생성
// ============================================================================

function buildBookGroupsFromExams(exams: DBExam[]): BookGroup[] {
  if (exams.length === 0) return [];

  // 전체 시험지 그룹
  const allGroup: BookGroup = {
    id: 'all',
    name: '전체 시험지',
    isExpanded: true,
    examCount: exams.length,
    examIds: exams.map(e => e.id),
  };

  // source_name (title)에서 과목/학교 기준으로 그룹 생성
  const schoolGroups = new Map<string, { ids: string[]; count: number }>();
  const yearGroups = new Map<string, { ids: string[]; count: number }>();

  for (const exam of exams) {
    // 학교별 그룹
    const school = exam.school || '기타';
    if (!schoolGroups.has(school)) {
      schoolGroups.set(school, { ids: [], count: 0 });
    }
    schoolGroups.get(school)!.ids.push(exam.id);
    schoolGroups.get(school)!.count++;

    // 연도별 그룹
    const year = exam.year || '기타';
    if (!yearGroups.has(year)) {
      yearGroups.set(year, { ids: [], count: 0 });
    }
    yearGroups.get(year)!.ids.push(exam.id);
    yearGroups.get(year)!.count++;
  }

  // 학교별 하위 그룹 생성
  const schoolChildren: BookGroup[] = Array.from(schoolGroups.entries())
    .filter(([name]) => name !== '기타')
    .map(([name, data], i) => ({
      id: `school-${i}`,
      name,
      examCount: data.count,
      examIds: data.ids,
    }));

  // 연도별 하위 그룹 생성
  const yearChildren: BookGroup[] = Array.from(yearGroups.entries())
    .filter(([name]) => name !== '기타')
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([name, data], i) => ({
      id: `year-${i}`,
      name: `${name}학년도`,
      examCount: data.count,
      examIds: data.ids,
    }));

  const groups: BookGroup[] = [allGroup];

  if (schoolChildren.length > 0) {
    groups.push({
      id: 'by-school',
      name: '학교별',
      isExpanded: false,
      examCount: schoolChildren.reduce((s, c) => s + (c.examCount || 0), 0),
      children: schoolChildren,
    });
  }

  if (yearChildren.length > 0) {
    groups.push({
      id: 'by-year',
      name: '연도별',
      isExpanded: false,
      examCount: yearChildren.reduce((s, c) => s + (c.examCount || 0), 0),
      children: yearChildren,
    });
  }

  return groups;
}

// ============================================================================
// Sub-Components
// ============================================================================

const subjectOptions = [
  '전체',
  '공통수학1 [2022개정]',
  '공통수학2 [2022개정]',
  '수학I [2022개정]',
  '수학II [2022개정]',
  '미적분 [2022개정]',
  '확률과 통계 [2022개정]',
];

// 과목 드롭다운
const SubjectDropdown: React.FC<{
  value: string;
  options: string[];
  onChange: (v: string) => void;
}> = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
      >
        <span className="truncate max-w-[200px]">{value}</span>
        <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[240px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors ${value === opt ? 'bg-zinc-800 text-cyan-400 font-medium' : 'text-zinc-400'}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// 3점 메뉴
const ContextMenu: React.FC<{
  onRename?: () => void;
  onAddChild?: () => void;
  onDelete?: () => void;
}> = ({ onRename, onAddChild, onDelete }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1 min-w-[140px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
            {onAddChild && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAddChild(); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <FolderPlus className="h-3.5 w-3.5" /> 하위 그룹 추가
              </button>
            )}
            {onRename && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRename(); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <Pencil className="h-3.5 w-3.5" /> 이름 변경
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-zinc-800 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" /> 삭제
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// 트리 노드 (재귀)
const TreeNode: React.FC<{
  node: BookGroup;
  level: number;
  selectedId: string | null;
  onSelect: (id: string, name: string) => void;
  onToggle: (id: string) => void;
}> = ({ node, level, selectedId, onSelect, onToggle }) => {
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;
  const isExpanded = node.isExpanded;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-cyan-500/10 text-cyan-400'
            : 'text-zinc-400 hover:bg-zinc-800/50'
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => {
          if (hasChildren) onToggle(node.id);
          onSelect(node.id, node.name);
        }}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
          )
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        {isExpanded || isSelected ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-cyan-500" />
        ) : (
          <Folder className="h-4 w-4 flex-shrink-0 text-zinc-500" />
        )}
        <span className={`flex-1 truncate text-[13px] ${isSelected ? 'font-semibold' : 'font-medium'}`}>
          {node.name}
        </span>
        {node.examCount !== undefined && node.examCount > 0 && (
          <span className="text-[10px] text-zinc-600 mr-1">{node.examCount}</span>
        )}
        <ContextMenu
          onRename={() => {}}
          onAddChild={hasChildren || level < 2 ? () => {} : undefined}
          onDelete={() => {}}
        />
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Page Component
// ============================================================================

export default function CloudPage() {
  const router = useRouter();

  // --- DB Data ---
  const [dbExams, setDbExams] = useState<DBExam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- Upload Modal ---
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [userId, setUserId] = useState<string>('');

  // Fetch User ID for uploader
  useEffect(() => {
    const fetchUser = async () => {
      if (supabaseBrowser) {
        const { data: { user } } = await supabaseBrowser.auth.getUser();
        if (user) setUserId(user.id);
      }
    };
    fetchUser();
  }, []);

  // --- State ---
  const [subject, setSubject] = useState(subjectOptions[0]);
  const [bookGroups, setBookGroups] = useState<BookGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('order');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Resizable panels
  const [leftWidth, setLeftWidth] = useState(28); // percentage
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- DB에서 시험지 목록 가져오기 ---
  const fetchExams = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/exams');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const exams: DBExam[] = data.exams || [];
      setDbExams(exams);

      // 시험지 데이터에서 북그룹 트리 생성
      const groups = buildBookGroupsFromExams(exams);
      setBookGroups(groups);

      // 전체 시험지 그룹 자동 선택
      if (groups.length > 0) {
        setSelectedId(groups[0].id);
        setSelectedName(groups[0].name);
      }
    } catch (err) {
      console.error('[Cloud] Failed to load exams:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  // 페이지 복귀 시 데이터 재로드 (다른 페이지 갔다 돌아올 때)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchExams();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchExams]);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.max(20, Math.min(45, pct)));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Toggle tree expand
  const toggleNode = useCallback((id: string) => {
    const toggle = (groups: BookGroup[]): BookGroup[] =>
      groups.map((g) => {
        if (g.id === id) return { ...g, isExpanded: !g.isExpanded };
        if (g.children) return { ...g, children: toggle(g.children) };
        return g;
      });
    setBookGroups((prev) => toggle(prev));
  }, []);

  const handleSelect = useCallback((id: string, name: string) => {
    setSelectedId(id);
    setSelectedName(name);
    setSearchQuery('');
  }, []);

  // Count total book groups
  const countGroups = (groups: BookGroup[]): number =>
    groups.reduce((sum, g) => sum + 1 + (g.children ? countGroups(g.children) : 0), 0);
  const totalGroups = countGroups(bookGroups);

  // 선택된 그룹에 해당하는 시험지 목록 가져오기
  const findGroupById = useCallback((groups: BookGroup[], id: string): BookGroup | null => {
    for (const g of groups) {
      if (g.id === id) return g;
      if (g.children) {
        const found = findGroupById(g.children, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const exams: ExamFile[] = useMemo(() => {
    if (!selectedId || dbExams.length === 0) return [];

    const selectedGroup = findGroupById(bookGroups, selectedId);
    const allowedIds = selectedGroup?.examIds;

    // 해당 그룹의 시험지만 필터
    const filtered = allowedIds
      ? dbExams.filter((e) => allowedIds.includes(e.id))
      : dbExams;

    return filtered.map((exam, idx) => ({
      id: exam.id,
      order: idx + 1,
      fileName: exam.fileName || exam.title,
      hasImage: exam.hasImage,
      problemCount: exam.problemCount,
      createdAt: exam.createdAt,
    }));
  }, [selectedId, dbExams, bookGroups, findGroupById]);

  const filteredExams = useMemo(() => {
    let result = exams;
    if (searchQuery) {
      result = result.filter((e) => e.fileName.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'order') cmp = a.order - b.order;
      else if (sortField === 'name') cmp = a.fileName.localeCompare(b.fileName);
      else if (sortField === 'problems') cmp = a.problemCount - b.problemCount;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [exams, searchQuery, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // --- 시험지 삭제 ---
  const handleDeleteExam = useCallback(async (examId: string, examName: string) => {
    if (!confirm(`"${examName}" 시험지를 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/exams/${examId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(`삭제 실패: ${err.error || '알 수 없는 오류'}`);
        return;
      }

      // 로컬 상태에서 즉시 제거
      setDbExams(prev => {
        const updated = prev.filter(e => e.id !== examId);
        // 북그룹 트리도 갱신
        const groups = buildBookGroupsFromExams(updated);
        setBookGroups(groups);
        return updated;
      });
    } catch (err) {
      console.error('[Cloud] Delete error:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  }, []);

  // --- 헤더 삭제 버튼: 현재 보이는 시험지 전체 삭제 ---
  const handleDeleteAllVisible = useCallback(async () => {
    if (filteredExams.length === 0) return;
    if (!confirm(`현재 표시된 ${filteredExams.length}개 시험지를 모두 삭제하시겠습니까?`)) return;

    try {
      const results = await Promise.allSettled(
        filteredExams.map(exam =>
          fetch(`/api/exams/${exam.id}`, { method: 'DELETE' })
        )
      );

      const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as Response).ok).length;

      // 로컬 상태에서 삭제된 항목 제거
      const deletedIds = new Set(filteredExams.map(e => e.id));
      setDbExams(prev => {
        const updated = prev.filter(e => !deletedIds.has(e.id));
        const groups = buildBookGroupsFromExams(updated);
        setBookGroups(groups);
        return updated;
      });

      if (successCount < filteredExams.length) {
        alert(`${successCount}/${filteredExams.length}개 삭제 완료 (일부 실패)`);
      }
    } catch (err) {
      console.error('[Cloud] Bulk delete error:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  }, [filteredExams]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between gap-4 px-6 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-white">과사람클라우드 관리</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">과목</span>
            <SubjectDropdown value={subject} options={subjectOptions} onChange={setSubject} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-bold text-white transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Upload className="h-4 w-4" />
            자료 업로드
          </button>
          <span className="text-[11px] text-zinc-600">
            <Database className="inline h-3 w-3 mr-1" />
            DB 시험지 {dbExams.length}건
          </span>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
          <span className="text-sm text-zinc-400">시험지 데이터 로딩 중...</span>
        </div>
      )}

      {/* Error State */}
      {!isLoading && loadError && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 text-sm mb-2">데이터 로딩 실패: {loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-cyan-400 hover:underline"
            >
              새로고침
            </button>
          </div>
        </div>
      )}

      {/* ======== Upload Modal ======== */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowUploadModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl mx-4 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
                <div>
                  <h2 className="text-lg font-bold text-white">자료 업로드</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">PDF/이미지를 업로드하면 OCR + GPT-4o가 자동으로 분석합니다.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* Modal Body */}
              <div className="p-6">
                <CloudFlowUploader
                  userId={userId}
                  autoNavigateToAnalyze={true}
                  onComplete={(results) => {
                    console.log('Upload complete', results);
                    setShowUploadModal(false);
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Split Panel */}
      {!isLoading && !loadError && (
        <div ref={containerRef} className="flex flex-1 min-h-0 px-4 py-3 gap-0">
          {/* ======== Left Panel: Tree ======== */}
          <div
            className="flex flex-col gap-3 overflow-hidden pr-2"
            style={{ width: `${leftWidth}%`, flexShrink: 0 }}
          >
            {/* Top Bar: Group Count + Add Button */}
            <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/90 px-4 py-2.5 flex-shrink-0">
              <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-[11px] font-semibold text-zinc-400">
                북그룹 {totalGroups}개
              </span>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-400 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-600 bg-zinc-900 text-zinc-400">
                  <Plus className="h-3 w-3" />
                </span>
                <span>최상위 북그룹 추가</span>
              </button>
            </div>

            {/* Tree Panel */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90">
              <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 p-2">
                {bookGroups.length > 0 ? (
                  <div className="space-y-0.5">
                    {bookGroups.map((group) => (
                      <TreeNode
                        key={group.id}
                        node={group}
                        level={0}
                        selectedId={selectedId}
                        onSelect={handleSelect}
                        onToggle={toggleNode}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2">
                    <Smile className="h-12 w-12 text-cyan-500/50" />
                    <p className="text-sm text-zinc-500">업로드된 시험지가 없습니다.</p>
                    <p className="text-xs text-zinc-600">문제를 업로드하면 자동으로 표시됩니다.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ======== Resize Handle ======== */}
          <div
            className="flex w-3 flex-shrink-0 cursor-col-resize items-center justify-center"
            onMouseDown={handleMouseDown}
          >
            <div className="flex h-8 w-3 items-center justify-center rounded-sm border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 transition-colors">
              <GripVertical className="h-3 w-3 text-zinc-500" />
            </div>
          </div>

          {/* ======== Right Panel: File List ======== */}
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden pl-2">
            <div className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/90">
              {selectedId ? (
                <>
                  {/* Content Header */}
                  <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
                        <FileText className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-white truncate">{selectedName}</h2>
                        <p className="text-[11px] text-zinc-500">
                          총 {exams.length}건 · 표시 {filteredExams.length}건
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Search */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="파일명으로 검색..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-8 w-48 rounded-lg border border-zinc-700 bg-zinc-800/50 pl-8 pr-3 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      </div>
                      {/* Sort */}
                      <button
                        type="button"
                        onClick={() => toggleSort('name')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                        title="정렬"
                      >
                        <ListFilter className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSort('order')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                        title="순서 정렬"
                      >
                        {sortDir === 'asc' ? <ArrowUpDown className="h-3.5 w-3.5" /> : <ArrowDownUp className="h-3.5 w-3.5" />}
                      </button>
                      {/* Action buttons */}
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                        title="복사"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                        title="내보내기"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteAllVisible}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-900/50 bg-red-900/10 text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                    {/* Table Header */}
                    <div className="sticky top-0 z-10 flex items-center border-b border-zinc-800 bg-zinc-800/60 backdrop-blur px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      <span
                        className="w-14 text-center cursor-pointer hover:text-zinc-300"
                        onClick={() => toggleSort('order')}
                      >
                        순서
                      </span>
                      <span
                        className="flex-1 pl-3 cursor-pointer hover:text-zinc-300"
                        onClick={() => toggleSort('name')}
                      >
                        파일명
                      </span>
                      <span
                        className="w-24 text-center cursor-pointer hover:text-zinc-300"
                        onClick={() => toggleSort('problems')}
                      >
                        문제 수
                      </span>
                      <span className="w-14 text-center">작업</span>
                    </div>

                    {/* Table Body */}
                    <div className="divide-y divide-zinc-800/40">
                      {filteredExams.map((exam) => (
                        <div
                          key={exam.id}
                          className="group flex items-center px-5 py-3 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                          onClick={() => router.push(`/dashboard/cloud/${exam.id}`)}
                        >
                          <span className="w-14 text-center">
                            <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md bg-zinc-800 px-1.5 text-[11px] font-bold text-zinc-400">
                              #{exam.order}
                            </span>
                          </span>
                          <div className="flex-1 flex items-center gap-2 pl-3 min-w-0">
                            <span className="truncate text-[13px] text-zinc-300 font-medium">
                              {exam.fileName}
                            </span>
                            {exam.hasImage && (
                              <span className="flex items-center gap-1 rounded-md border border-cyan-500/20 bg-cyan-500/5 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400 flex-shrink-0">
                                <ImageIcon className="h-3 w-3" />
                                이미지 포함
                              </span>
                            )}
                          </div>
                          <span className="w-28 flex justify-center">
                            {exam.problemCount > 0 ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-3 py-1 text-xs font-medium text-indigo-400">
                                <Sparkles className="h-3 w-3" />
                                {exam.problemCount}문항
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/dashboard/cloud/${exam.id}`);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
                              >
                                <Sparkles className="h-3 w-3" />
                                작업하기
                              </button>
                            )}
                          </span>
                          <span className="w-14 flex justify-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteExam(exam.id, exam.fileName);
                              }}
                              className="rounded-lg p-1.5 text-zinc-500 hover:bg-red-900/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                              title="삭제"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </span>
                        </div>
                      ))}
                      {filteredExams.length === 0 && (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                          <Search className="h-8 w-8 text-zinc-700" />
                          <p className="text-sm text-zinc-500">
                            {searchQuery ? '검색 결과가 없습니다' : '이 그룹에 시험지가 없습니다'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* Empty State */
                <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800">
                    <Smile className="h-10 w-10 text-cyan-500/50" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-zinc-300">둘러볼 북그룹을 선택해 주세요</p>
                    <p className="text-sm text-zinc-500">왼쪽 트리에서 북그룹을 클릭하면 시험지가 이곳에 표시됩니다.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
