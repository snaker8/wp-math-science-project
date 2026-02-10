'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
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
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface BookGroup {
  id: string;
  name: string;
  children?: BookGroup[];
  isExpanded?: boolean;
  examCount?: number;
}

interface ExamFile {
  id: string;
  order: number;
  fileName: string;
  hasImage: boolean;
  problemCount: number;
}

type SortField = 'order' | 'name' | 'problems';
type SortDir = 'asc' | 'desc';

// ============================================================================
// Mock Data
// ============================================================================

const subjectOptions = [
  '공통수학1 [2022개정]',
  '공통수학2 [2022개정]',
  '수학I [2022개정]',
  '수학II [2022개정]',
  '미적분 [2022개정]',
  '확률과 통계 [2022개정]',
];

const mockBookGroups: BookGroup[] = [
  {
    id: 'bg1',
    name: '[공통수학1] 기출문제',
    isExpanded: true,
    examCount: 3,
    children: [
      {
        id: 'bg1-1',
        name: '[공통수학1 시중교재]',
        isExpanded: true,
        examCount: 1,
        children: [
          { id: 'bg1-1-1', name: '내신고쟁이', examCount: 5 },
        ],
      },
    ],
  },
  {
    id: 'bg2',
    name: '[공통수학1] 모의고사',
    isExpanded: false,
    examCount: 8,
    children: [
      { id: 'bg2-1', name: '2024학년도', examCount: 4 },
      { id: 'bg2-2', name: '2023학년도', examCount: 4 },
    ],
  },
  {
    id: 'bg3',
    name: '[공통수학2] 기출문제',
    isExpanded: false,
    examCount: 5,
  },
];

function generateMockExams(groupName: string): ExamFile[] {
  const schools = [
    '금곡고등학교(부산 북구)',
    '용인고등학교(부산 동래구)',
    '내성고등학교(부산 금정구)',
    '부산외국어고등학교(부산 남구)',
    '해운대고등학교(부산 해운대구)',
  ];
  const types = ['기말', '중간', '1학기', '2학기'];
  const subjects = ['공통수학', '통합과학', '공통수학1', '공통수학2'];

  return Array.from({ length: 3 + Math.floor(Math.random() * 4) }, (_, i) => ({
    id: `exam-${i}`,
    order: i + 1,
    fileName: `${schools[i % schools.length]} 2025 1-1 ${types[i % types.length]} ${subjects[i % subjects.length]}_${1800 + Math.floor(Math.random() * 100)}.pdf`,
    hasImage: Math.random() > 0.3,
    problemCount: 15 + Math.floor(Math.random() * 20),
  }));
}

// ============================================================================
// Sub-Components
// ============================================================================

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
  // --- State ---
  const [subject, setSubject] = useState(subjectOptions[0]);
  const [bookGroups, setBookGroups] = useState<BookGroup[]>(mockBookGroups);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('order');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Resizable panels
  const [leftWidth, setLeftWidth] = useState(28); // percentage
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Generate exams for selected group
  const exams = useMemo(() => {
    if (!selectedId) return [];
    return generateMockExams(selectedName);
  }, [selectedId, selectedName]);

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
      </div>

      {/* Main Split Panel */}
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
                  <p className="text-sm text-zinc-500">데이터가 없습니다.</p>
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
                        <span className="w-24 flex justify-center">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-3 py-1 text-xs font-medium text-indigo-400">
                            <Sparkles className="h-3 w-3" />
                            {exam.problemCount}문항
                          </span>
                        </span>
                        <span className="w-14 flex justify-center">
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </span>
                      </div>
                    ))}
                    {filteredExams.length === 0 && (
                      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <Search className="h-8 w-8 text-zinc-700" />
                        <p className="text-sm text-zinc-500">
                          {searchQuery ? '검색 결과가 없습니다' : '시험지가 없습니다'}
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
    </div>
  );
}
