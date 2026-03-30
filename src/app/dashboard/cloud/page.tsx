'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  Eye,
  FolderInput,
  Check,
  Download,
  BookOpen,
  BookMarked,
  ClipboardList,
  GraduationCap,
  Shield,
  Lock,
  ChevronLeft,
  AlertTriangle,
  KeyRound,
} from 'lucide-react';
import CloudFlowUploader from '@/components/workflow/CloudFlowUploader';
import { supabaseBrowser } from '@/lib/supabase/client';

// ============================================================================
// Types
// ============================================================================

interface DBBookGroup {
  id: string;
  name: string;
  parent_id: string | null;
  subject: string | null;
  sort_order: number;
  institute_id: string | null;
  created_by: string | null;
  created_at: string;
}

interface TreeNode {
  id: string;
  name: string;
  parentId: string | null;
  subject: string | null;
  children: TreeNode[];
  isExpanded: boolean;
  examCount: number;
  isVirtual?: boolean; // "전체 시험지", "미분류" 등 가상 노드
}

interface ExamFile {
  id: string;
  order: number;
  fileName: string;
  hasImage: boolean;
  problemCount: number;
  bookGroupId: string | null;
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
  bookGroupId: string | null;
  subject: string;
  examType: string;
  grade: string;
  createdAt: string;
}

type SortField = 'order' | 'name' | 'problems';
type SortDir = 'asc' | 'desc';

// ============================================================================
// Build tree from flat DB groups + exams
// ============================================================================

function buildTreeFromDB(groups: DBBookGroup[], exams: DBExam[]): TreeNode[] {
  // 그룹별 시험지 수 계산
  const examCountMap = new Map<string, number>();
  let unclassifiedCount = 0;

  for (const exam of exams) {
    if (exam.bookGroupId) {
      examCountMap.set(exam.bookGroupId, (examCountMap.get(exam.bookGroupId) || 0) + 1);
    } else {
      unclassifiedCount++;
    }
  }

  // flat → tree 변환
  const nodeMap = new Map<string, TreeNode>();
  for (const g of groups) {
    nodeMap.set(g.id, {
      id: g.id,
      name: g.name,
      parentId: g.parent_id,
      subject: g.subject,
      children: [],
      isExpanded: false,
      examCount: examCountMap.get(g.id) || 0,
    });
  }

  const roots: TreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 가상 노드: 전체 시험지
  const allNode: TreeNode = {
    id: 'all',
    name: '전체 시험지',
    parentId: null,
    subject: null,
    children: [],
    isExpanded: true,
    examCount: exams.length,
    isVirtual: true,
  };

  // 가상 노드: 미분류 (book_group_id가 null인 시험지)
  const unclassifiedNode: TreeNode = {
    id: 'unclassified',
    name: '미분류',
    parentId: null,
    subject: null,
    children: [],
    isExpanded: false,
    examCount: unclassifiedCount,
    isVirtual: true,
  };

  const tree: TreeNode[] = [allNode];
  if (roots.length > 0) tree.push(...roots);
  if (unclassifiedCount > 0) tree.push(unclassifiedNode);

  return tree;
}

// 트리에서 특정 그룹 + 모든 자손 그룹의 ID를 수집
function collectGroupIds(node: TreeNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...collectGroupIds(child));
  }
  return ids;
}

// ============================================================================
// Sub-Components
// ============================================================================

const subjectOptions = [
  '전체',
  '── 수학 ──',
  '공통수학1',
  '공통수학2',
  '수학1',
  '수학2',
  '미적분',
  '확률과통계',
  '기하',
  '── 과학 ──',
  '공통과학1',
  '공통과학2',
  '물리학1',
  '물리학2',
  '화학1',
  '화학2',
  '생명과학1',
  '생명과학2',
  '지구과학1',
  '지구과학2',
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
        className="flex h-9 items-center gap-2 rounded-lg border bg-surface-card px-3 text-sm font-medium text-content-secondary hover:bg-surface-raised transition-colors"
      >
        <span className="truncate max-w-[200px]">{value}</span>
        <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[240px] rounded-lg border bg-surface-card py-1 shadow-xl">
            {options.map((opt) => {
              const isSeparator = opt.startsWith('──');
              if (isSeparator) {
                return (
                  <div key={opt} className="px-4 py-1.5 text-[11px] font-bold text-content-tertiary border-t border-subtle mt-1 pt-2">
                    {opt.replace(/──\s?/g, '').trim()}
                  </div>
                );
              }
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { onChange(opt); setOpen(false); }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-surface-raised transition-colors ${value === opt ? 'bg-surface-raised text-cyan-400 font-medium' : 'text-content-secondary'}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// 그룹 3점 메뉴
const GroupContextMenu: React.FC<{
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
        className="rounded p-1 text-content-tertiary hover:bg-surface-raised hover:text-content-primary transition-colors opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1 min-w-[140px] rounded-lg border bg-surface-card py-1 shadow-xl">
            {onAddChild && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAddChild(); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-content-secondary hover:bg-surface-raised hover:text-content-primary"
              >
                <FolderPlus className="h-3.5 w-3.5" /> 하위 그룹 추가
              </button>
            )}
            {onRename && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRename(); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-content-secondary hover:bg-surface-raised hover:text-content-primary"
              >
                <Pencil className="h-3.5 w-3.5" /> 이름 변경
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-surface-raised hover:text-red-300"
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

// 파일 3점 메뉴 (참조사이트 스타일)
const FileContextMenu: React.FC<{
  onRename: () => void;
  onView: () => void;
  onMove: () => void;
  onDownload: () => void;
  onDelete: () => void;
}> = ({ onRename, onView, onMove, onDownload, onDelete }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="rounded-lg p-1.5 text-content-tertiary hover:bg-surface-raised hover:text-content-primary transition-colors opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1 min-w-[160px] rounded-lg border bg-surface-card py-1 shadow-xl">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRename(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-content-secondary hover:bg-surface-raised hover:text-content-primary"
            >
              <Pencil className="h-3.5 w-3.5" /> 파일명 수정
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onView(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-content-secondary hover:bg-surface-raised hover:text-content-primary"
            >
              <Eye className="h-3.5 w-3.5" /> 문제 보기
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMove(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-content-secondary hover:bg-surface-raised hover:text-content-primary"
            >
              <FolderInput className="h-3.5 w-3.5" /> 그룹 이동
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDownload(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-content-secondary hover:bg-surface-raised hover:text-content-primary"
            >
              <Download className="h-3.5 w-3.5" /> 원본 다운로드
            </button>
            <div className="my-1 border-t border-subtle" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-surface-raised hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" /> 파일 삭제
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// 트리 노드 (재귀)
const TreeNodeComponent: React.FC<{
  node: TreeNode;
  level: number;
  selectedId: string | null;
  renamingId: string | null;
  renameValue: string;
  onSelect: (id: string, name: string) => void;
  onToggle: (id: string) => void;
  onRename: (id: string) => void;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string, name: string) => void;
}> = ({ node, level, selectedId, renamingId, renameValue, onSelect, onToggle, onRename, onRenameChange, onRenameConfirm, onRenameCancel, onAddChild, onDelete }) => {
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;
  const isExpanded = node.isExpanded;
  const isRenaming = renamingId === node.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-cyan-500/10 text-cyan-400'
            : 'text-content-secondary hover:bg-surface-raised/50'
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => {
          if (hasChildren) onToggle(node.id);
          onSelect(node.id, node.name);
        }}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-content-tertiary" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-content-tertiary" />
          )
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        {isExpanded || isSelected ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-cyan-500" />
        ) : (
          <Folder className="h-4 w-4 flex-shrink-0 text-content-tertiary" />
        )}
        {isRenaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameConfirm();
              if (e.key === 'Escape') onRenameCancel();
            }}
            onBlur={onRenameConfirm}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="flex-1 bg-surface-raised border border-cyan-500/50 rounded px-1.5 py-0.5 text-[13px] text-content-primary outline-none"
          />
        ) : (
          <span className={`flex-1 truncate text-[13px] ${isSelected ? 'font-semibold' : 'font-medium'}`}>
            {node.name}
          </span>
        )}
        {node.examCount > 0 && !isRenaming && (
          <span className="text-[10px] text-content-muted mr-1">{node.examCount}</span>
        )}
        {!node.isVirtual && !isRenaming && (
          <GroupContextMenu
            onRename={() => onRename(node.id)}
            onAddChild={level < 3 ? () => onAddChild(node.id) : undefined}
            onDelete={() => onDelete(node.id, node.name)}
          />
        )}
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              renamingId={renamingId}
              renameValue={renameValue}
              onSelect={onSelect}
              onToggle={onToggle}
              onRename={onRename}
              onRenameChange={onRenameChange}
              onRenameConfirm={onRenameConfirm}
              onRenameCancel={onRenameCancel}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// 그룹 이동 모달
const MoveToGroupModal: React.FC<{
  groups: DBBookGroup[];
  currentGroupId: string | null;
  onMove: (groupId: string | null) => void;
  onClose: () => void;
}> = ({ groups, currentGroupId, onMove, onClose }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm mx-4 bg-surface-card border rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-subtle px-5 py-3">
          <h3 className="text-sm font-bold text-content-primary">그룹 이동</h3>
          <button type="button" onClick={onClose} className="text-content-secondary hover:text-content-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto p-3 space-y-1">
          <button
            type="button"
            onClick={() => onMove(null)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
              currentGroupId === null ? 'bg-cyan-500/10 text-cyan-400' : 'text-content-secondary hover:bg-surface-raised'
            }`}
          >
            <Folder className="h-3.5 w-3.5" />
            미분류
            {currentGroupId === null && <Check className="h-3 w-3 ml-auto" />}
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onMove(g.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                currentGroupId === g.id ? 'bg-cyan-500/10 text-cyan-400' : 'text-content-secondary hover:bg-surface-raised'
              }`}
            >
              <Folder className="h-3.5 w-3.5" />
              {g.name}
              {currentGroupId === g.id && <Check className="h-3 w-3 ml-auto" />}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

// 북그룹 생성 모달 (참조사이트 스타일)
const GROUP_TYPES = [
  { id: 'textbook', label: '교과서', desc: '정규 수업을 위한 기본 학습 자료', icon: BookOpen },
  { id: 'workbook', label: '문제집', desc: '심화/복습용 연습 문제 모음', icon: BookMarked },
  { id: 'exam', label: '시험지', desc: '실전 대비 모의 시험지와 평가 자료', icon: ClipboardList },
  { id: 'mock', label: '모의고사', desc: '실제 시험과 동일한 구성의 모의고사', icon: GraduationCap },
] as const;

const CreateGroupModal: React.FC<{
  parentId: string | null; // null이면 최상위 그룹
  onSave: (data: { name: string; groupType: string; parentId: string | null }) => Promise<void>;
  onClose: () => void;
}> = ({ parentId, onSave, onClose }) => {
  const [groupType, setGroupType] = useState<string>('exam');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), groupType, parentId });
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg mx-4 bg-surface-card border rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-indigo-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <FolderPlus className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {parentId ? '하위 그룹 생성' : '북그룹 생성'}
              </h3>
              <p className="text-xs text-white/70">교재와 자료를 카테고리별로 정리해 학습 흐름을 완성하세요.</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* 그룹 타입 */}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-3">그룹타입</label>
            <div className="grid grid-cols-2 gap-3">
              {GROUP_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = groupType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setGroupType(type.id)}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/30'
                        : 'border bg-surface-raised/50 hover:border-content-muted hover:bg-surface-raised'
                    }`}
                  >
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-cyan-500/20 text-cyan-400' : 'bg-surface-raised/50 text-content-tertiary'
                    }`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold ${isSelected ? 'text-cyan-400' : 'text-content-secondary'}`}>
                        {type.label}
                      </div>
                      <div className="text-[11px] text-content-tertiary leading-tight mt-0.5">{type.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 이름 입력 */}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-2">북그룹 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="예) 2학년 1학기 교과서"
              autoFocus
              className="w-full rounded-xl border bg-surface-raised/50 px-4 py-3 text-sm text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            />
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* 버튼 */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border bg-surface-raised px-5 py-2.5 text-sm font-medium text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-surface-raised disabled:text-content-tertiary px-5 py-2.5 text-sm font-bold text-white transition-colors shadow-lg shadow-cyan-500/20 disabled:shadow-none"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ============================================================================
// Main Page Component
// ============================================================================

export default function CloudPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appendToExamId = searchParams.get('appendTo') || undefined;

  // --- DB Data ---
  const [dbExams, setDbExams] = useState<DBExam[]>([]);
  const [dbGroups, setDbGroups] = useState<DBBookGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- Upload Modal ---
  const [showUploadModal, setShowUploadModal] = useState(!!appendToExamId);
  const [userId, setUserId] = useState<string>('');
  // --- Source List (출처 목록 보기) ---
  const [showSourceList, setShowSourceList] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('');

  // --- Move Modal ---
  const [movingExam, setMovingExam] = useState<{ id: string; bookGroupId: string | null } | null>(null);

  // --- Delete Confirm Modal (2-step + PIN) ---
  const [deleteModal, setDeleteModal] = useState<{
    type: 'single' | 'all';
    examId?: string;
    examName?: string;
    step: 1 | 2;
  } | null>(null);
  const [deletePinInput, setDeletePinInput] = useState('');
  const [deletePinError, setDeletePinError] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // --- PIN Change Modal ---
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinOld, setPinOld] = useState('');
  const [pinNew, setPinNew] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinChangeError, setPinChangeError] = useState('');

  // --- Create Group Modal ---
  const [showCreateGroup, setShowCreateGroup] = useState<{ parentId: string | null } | null>(null);

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
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>('all');
  const [selectedName, setSelectedName] = useState<string>('전체 시험지');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('order');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // --- Rename state ---
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingExamId, setRenamingExamId] = useState<string | null>(null);
  const [renameExamValue, setRenameExamValue] = useState('');

  // Resizable panels
  const [leftWidth, setLeftWidth] = useState(28);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- 확장 상태 보존 ---
  const expandedIdsRef = useRef<Set<string>>(new Set(['all']));

  // --- DB에서 데이터 가져오기 ---
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);

      const subjectParam = subject !== '전체' ? `?subject=${encodeURIComponent(subject)}` : '';

      // 북그룹 + 시험지 병렬 fetch (no-store: 삭제 후 최신 데이터 보장)
      const [groupsRes, examsRes] = await Promise.all([
        fetch(`/api/book-groups${subjectParam}`, { cache: 'no-store' }),
        fetch('/api/exams', { cache: 'no-store' }),
      ]);

      if (!groupsRes.ok) throw new Error(`BookGroups HTTP ${groupsRes.status}`);
      if (!examsRes.ok) throw new Error(`Exams HTTP ${examsRes.status}`);

      const groupsData = await groupsRes.json();
      const examsData = await examsRes.json();

      console.log('[Cloud] ★ /api/exams 응답:', JSON.stringify(examsData).substring(0, 500));
      console.log('[Cloud] ★ /api/book-groups 응답:', JSON.stringify(groupsData).substring(0, 500));

      const groups: DBBookGroup[] = groupsData.groups || [];
      const exams: DBExam[] = examsData.exams || [];
      console.log(`[Cloud] ★ groups: ${groups.length}개, exams: ${exams.length}개`);

      setDbGroups(groups);
      setDbExams(exams);

      // 트리 생성
      const tree = buildTreeFromDB(groups, exams);

      // 확장 상태 복원
      const restoreExpanded = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => ({
          ...n,
          isExpanded: expandedIdsRef.current.has(n.id),
          children: restoreExpanded(n.children),
        }));

      setTreeNodes(restoreExpanded(tree));
    } catch (err) {
      console.error('[Cloud] Failed to load data:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [subject]);

  // 초기 로드 + 과목 변경 시 재로드
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 페이지 복귀 시 데이터 재로드
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchData]);

  // --- Panel Resize ---
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

  // --- Tree Toggle ---
  const toggleNode = useCallback((id: string) => {
    setTreeNodes((prev) => {
      const toggle = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => {
          if (n.id === id) {
            const newExpanded = !n.isExpanded;
            if (newExpanded) expandedIdsRef.current.add(id);
            else expandedIdsRef.current.delete(id);
            return { ...n, isExpanded: newExpanded };
          }
          if (n.children.length > 0) return { ...n, children: toggle(n.children) };
          return n;
        });
      return toggle(prev);
    });
  }, []);

  const handleSelect = useCallback((id: string, name: string) => {
    setSelectedId(id);
    setSelectedName(name);
    setSearchQuery('');
  }, []);

  // --- Count total book groups ---
  const countGroups = (nodes: TreeNode[]): number =>
    nodes.reduce((sum, n) => sum + (n.isVirtual ? 0 : 1) + countGroups(n.children), 0);
  const totalGroups = countGroups(treeNodes);

  // --- 그룹 CRUD handlers (DB API 호출) ---

  // 최상위 그룹 추가 (모달 열기)
  const handleAddRootGroup = useCallback(() => {
    setShowCreateGroup({ parentId: null });
  }, []);

  // 하위 그룹 추가 (모달 열기)
  const handleAddChild = useCallback((parentId: string) => {
    setShowCreateGroup({ parentId });
  }, []);

  // 모달에서 저장 시 API 호출
  const handleCreateGroupSave = useCallback(async (data: { name: string; groupType: string; parentId: string | null }) => {
    const res = await fetch('/api/book-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        parentId: data.parentId,
        groupType: data.groupType,
        subject: subject !== '전체' ? subject : undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || err.detail || '그룹 생성에 실패했습니다.');
    }
    // 부모 그룹 확장
    if (data.parentId) {
      expandedIdsRef.current.add(data.parentId);
    }
    setShowCreateGroup(null);
    await fetchData();
  }, [fetchData, subject]);

  // 그룹 이름 변경 시작
  const handleStartRenameGroup = useCallback((id: string) => {
    const findName = (nodes: TreeNode[]): string => {
      for (const n of nodes) {
        if (n.id === id) return n.name;
        const found = findName(n.children);
        if (found) return found;
      }
      return '';
    };
    setRenamingGroupId(id);
    setRenameValue(findName(treeNodes));
  }, [treeNodes]);

  // 그룹 이름 변경 확인
  const handleConfirmRenameGroup = useCallback(async () => {
    if (!renamingGroupId || !renameValue.trim()) {
      setRenamingGroupId(null);
      return;
    }

    try {
      const res = await fetch(`/api/book-groups/${renamingGroupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`이름 변경 실패: ${err.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      console.error('[Cloud] Rename group error:', err);
    }

    setRenamingGroupId(null);
    await fetchData();
  }, [renamingGroupId, renameValue, fetchData]);

  // 그룹 삭제
  const handleDeleteGroup = useCallback(async (id: string, name: string) => {
    if (!confirm(`"${name}" 그룹을 삭제하시겠습니까? 하위 그룹도 함께 삭제됩니다.`)) return;

    try {
      const res = await fetch(`/api/book-groups/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(`삭제 실패: ${err.error || '알 수 없는 오류'}`);
        return;
      }
      // 선택된 그룹이 삭제된 경우 "전체"로 이동
      if (selectedId === id) {
        setSelectedId('all');
        setSelectedName('전체 시험지');
      }
      await fetchData();
    } catch (err) {
      console.error('[Cloud] Delete group error:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  }, [selectedId, fetchData]);

  // --- 선택된 그룹의 시험지 목록 ---
  const findNodeById = useCallback((nodes: TreeNode[], id: string): TreeNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
    return null;
  }, []);

  // 과목 필터 적용된 시험지
  const subjectFilteredExams = useMemo(() => {
    if (subject === '전체') return dbExams;
    return dbExams.filter((e) => e.subject === subject);
  }, [dbExams, subject]);

  const exams: ExamFile[] = useMemo(() => {
    if (!selectedId || subjectFilteredExams.length === 0) return [];

    let filtered: DBExam[];

    if (selectedId === 'all') {
      filtered = subjectFilteredExams;
    } else if (selectedId === 'unclassified') {
      filtered = subjectFilteredExams.filter((e) => !e.bookGroupId);
    } else {
      // 선택된 그룹 + 자손 그룹의 시험지
      const node = findNodeById(treeNodes, selectedId);
      if (node) {
        const groupIds = new Set(collectGroupIds(node));
        filtered = subjectFilteredExams.filter((e) => e.bookGroupId && groupIds.has(e.bookGroupId));
      } else {
        filtered = [];
      }
    }

    return filtered.map((exam, idx) => ({
      id: exam.id,
      order: idx + 1,
      fileName: exam.fileName || exam.title,
      hasImage: exam.hasImage,
      problemCount: exam.problemCount,
      bookGroupId: exam.bookGroupId,
      createdAt: exam.createdAt,
    }));
  }, [selectedId, subjectFilteredExams, treeNodes, findNodeById]);

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

  // --- PIN 헬퍼 ---
  const getAdminPin = useCallback(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gsaram_admin_pin') || '1234';
    }
    return '1234';
  }, []);

  // --- 시험지 삭제 (모달 오픈) ---
  const handleDeleteExam = useCallback((examId: string, examName: string) => {
    setDeleteModal({ type: 'single', examId, examName, step: 1 });
    setDeletePinInput('');
    setDeletePinError(false);
    setDeleteModalError('');
  }, []);

  // --- 시험지 이름 변경 ---
  const handleStartRenameExam = useCallback((examId: string, currentName: string) => {
    setRenamingExamId(examId);
    setRenameExamValue(currentName);
  }, []);

  const handleConfirmRenameExam = useCallback(async () => {
    if (!renamingExamId || !renameExamValue.trim()) {
      setRenamingExamId(null);
      return;
    }

    try {
      const res = await fetch(`/api/exams/${renamingExamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: renameExamValue.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`이름 변경 실패: ${err.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      console.error('[Cloud] Rename exam error:', err);
    }

    setRenamingExamId(null);
    await fetchData();
  }, [renamingExamId, renameExamValue, fetchData]);

  // --- 시험지 그룹 이동 ---
  const handleMoveExam = useCallback(async (newGroupId: string | null) => {
    if (!movingExam) return;

    try {
      const res = await fetch(`/api/exams/${movingExam.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookGroupId: newGroupId }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`이동 실패: ${err.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      console.error('[Cloud] Move exam error:', err);
    }

    setMovingExam(null);
    await fetchData();
  }, [movingExam, fetchData]);

  // --- 전체 삭제 (모달 오픈) ---
  const handleDeleteAllVisible = useCallback(() => {
    if (filteredExams.length === 0) return;
    setDeleteModal({ type: 'all', step: 1 });
    setDeletePinInput('');
    setDeletePinError(false);
    setDeleteModalError('');
  }, [filteredExams]);

  // --- Step 1 → Step 2 이동 ---
  const handleDeleteNext = useCallback(() => {
    setDeleteModal((prev) => (prev ? { ...prev, step: 2 } : null));
    setDeletePinInput('');
    setDeletePinError(false);
    setDeleteModalError('');
  }, []);

  // --- Step 2: PIN 확인 후 삭제 실행 ---
  const handleDeleteConfirm = useCallback(async () => {
    if (deletePinInput !== getAdminPin()) {
      setDeletePinError(true);
      return;
    }
    setIsDeleting(true);
    setDeleteModalError('');
    try {
      if (deleteModal?.type === 'single' && deleteModal.examId) {
        const res = await fetch(`/api/exams/${deleteModal.examId}`, { method: 'DELETE' });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const msg = errData.error || '알 수 없는 오류';
          setDeleteModalError(`삭제 실패: ${msg}`);
          console.error('[Cloud] Delete failed:', msg, errData.detail || '');
          return; // 모달 열린 채로 에러 표시
        }
        setDbExams((prev) => prev.filter((e) => e.id !== deleteModal.examId));
      } else if (deleteModal?.type === 'all') {
        const results = await Promise.allSettled(
          filteredExams.map((exam) => fetch(`/api/exams/${exam.id}`, { method: 'DELETE' }))
        );
        const successCount = results.filter(
          (r) => r.status === 'fulfilled' && (r.value as Response).ok
        ).length;
        const failCount = filteredExams.length - successCount;
        console.log(`[Cloud] 전체 삭제: ${successCount}/${filteredExams.length}개 완료`);
        if (failCount > 0) {
          setDeleteModalError(`${successCount}개 삭제 완료, ${failCount}개 실패. 서버 로그를 확인하세요.`);
          await fetchData();
          return;
        }
      }
      setDeleteModal(null);
      await fetchData();
    } catch (err) {
      console.error('[Cloud] Delete error:', err);
      setDeleteModalError('삭제 중 오류가 발생했습니다. 네트워크를 확인하세요.');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteModal, deletePinInput, filteredExams, fetchData, getAdminPin]);

  // --- PIN 변경 ---
  const handlePinChange = useCallback(() => {
    if (pinOld !== getAdminPin()) {
      setPinChangeError('현재 PIN이 올바르지 않습니다.');
      return;
    }
    if (pinNew.length < 4) {
      setPinChangeError('PIN은 최소 4자리 이상이어야 합니다.');
      return;
    }
    if (pinNew !== pinConfirm) {
      setPinChangeError('새 PIN이 일치하지 않습니다.');
      return;
    }
    localStorage.setItem('gsaram_admin_pin', pinNew);
    setShowPinModal(false);
    setPinOld(''); setPinNew(''); setPinConfirm(''); setPinChangeError('');
    alert('관리자 PIN이 변경되었습니다.');
  }, [pinOld, pinNew, pinConfirm, getAdminPin]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface-base text-content-primary">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between gap-4 px-6 py-3 border-b border-subtle/50">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-content-primary">과사람클라우드 관리</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-content-tertiary">과목</span>
            <SubjectDropdown value={subject} options={subjectOptions} onChange={setSubject} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setPinOld(''); setPinNew(''); setPinConfirm(''); setPinChangeError(''); setShowPinModal(true); }}
            className="flex items-center gap-1.5 rounded-lg border bg-surface-raised/60 px-3 py-2 text-xs text-content-tertiary hover:text-content-primary hover:bg-surface-raised transition-colors"
            title="관리자 PIN 변경"
          >
            <KeyRound className="h-3.5 w-3.5" />
            PIN 설정
          </button>
          <button
            type="button"
            onClick={() => setShowSourceList(!showSourceList)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
              showSourceList
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
                : 'bg-surface-raised/60 text-content-tertiary hover:text-content-primary hover:bg-surface-raised'
            }`}
            title="업로드된 출처 목록"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            출처 목록
          </button>
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-bold text-white transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Upload className="h-4 w-4" />
            자료 업로드
          </button>
          <span className="text-[11px] text-content-muted">
            <Database className="inline h-3 w-3 mr-1" />
            DB 시험지 {dbExams.length}건
          </span>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
          <span className="text-sm text-content-secondary">시험지 데이터 로딩 중...</span>
        </div>
      )}

      {/* Error State */}
      {!isLoading && loadError && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 text-sm mb-2">데이터 로딩 실패: {loadError}</p>
            <button
              onClick={() => fetchData()}
              className="text-xs text-cyan-400 hover:underline"
            >
              새로고침
            </button>
          </div>
        </div>
      )}

      {/* ======== Source List Panel (출처 목록) ======== */}
      <AnimatePresence>
        {showSourceList && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-subtle/50 bg-surface-card/50"
          >
            <div className="px-6 py-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-cyan-400" />
                  업로드된 출처 목록 ({dbExams.length}건)
                </h3>
                <div className="flex items-center gap-2">
                  {/* 과목 필터 */}
                  {(() => {
                    const subjects = [...new Set(dbExams.map(e => e.subject || '미지정'))].sort();
                    return subjects.length > 1 ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setSourceFilter('')}
                          className={`px-2 py-0.5 rounded text-[10px] transition-colors ${!sourceFilter ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-surface-raised/60 text-content-muted hover:text-content-primary'}`}
                        >전체</button>
                        {subjects.map(s => (
                          <button
                            key={s}
                            onClick={() => setSourceFilter(s)}
                            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${sourceFilter === s ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-surface-raised/60 text-content-muted hover:text-content-primary'}`}
                          >{s}</button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  <button onClick={() => setShowSourceList(false)} className="p-1 rounded hover:bg-surface-raised">
                    <X className="h-4 w-4 text-content-muted" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
                {dbExams
                  .filter(e => !sourceFilter || (e.subject || '미지정') === sourceFilter)
                  .map(exam => {
                    // 중복 체크: 같은 title이 2개 이상이면 표시
                    const dupeCount = dbExams.filter(e => e.title === exam.title).length;
                    return (
                      <div
                        key={exam.id}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] group cursor-pointer transition-colors ${
                          dupeCount > 1
                            ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50'
                            : 'bg-surface-raised/60 border-subtle/50 hover:border-cyan-500/30'
                        }`}
                        onClick={() => {
                          setShowSourceList(false);
                          router.push(`/dashboard/cloud/${exam.id}`);
                        }}
                        title={`${exam.title}\n과목: ${exam.subject || '미지정'}\n유형: ${exam.examType || '미지정'}\n학년: ${exam.grade || '미지정'}\n생성: ${exam.createdAt ? new Date(exam.createdAt).toLocaleDateString('ko-KR') : '?'}`}
                      >
                        <FileText className={`h-3 w-3 flex-shrink-0 ${dupeCount > 1 ? 'text-amber-400' : 'text-content-muted'}`} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`truncate ${dupeCount > 1 ? 'text-amber-300' : 'text-content-secondary group-hover:text-cyan-400'}`}>
                            {exam.title || exam.fileName}
                          </span>
                          <span className="text-[9px] text-content-muted truncate">
                            {exam.subject || ''} {exam.grade || ''} {exam.examType || ''}
                          </span>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className="text-[9px] text-content-muted">{exam.problemCount}문제</span>
                          {dupeCount > 1 && (
                            <span className="text-[8px] text-amber-400 font-bold">중복{dupeCount}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
              {dbExams.length === 0 && (
                <p className="text-xs text-content-muted py-4 text-center">업로드된 자료가 없습니다</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              className="w-full max-w-2xl mx-4 bg-surface-card border rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
                <div>
                  <h2 className="text-lg font-bold text-content-primary">자료 업로드</h2>
                  <p className="text-xs text-content-tertiary mt-0.5">PDF/이미지를 업로드하면 OCR + GPT-4o가 자동으로 분석합니다.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="rounded-lg p-1.5 text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* Modal Body */}
              <div className="p-6">
                <CloudFlowUploader
                  userId={userId}
                  bookGroupId={selectedId && selectedId !== 'all' && selectedId !== 'unclassified' ? selectedId : undefined}
                  appendToExamId={appendToExamId}
                  autoNavigateToAnalyze={!appendToExamId}
                  existingFileNames={dbExams.map(e => e.title || e.fileName)}
                  onComplete={(results) => {
                    console.log('Upload complete', results);
                    setShowUploadModal(false);
                    fetchData();
                    // appendTo가 있으면 기존 시험지로 이동
                    if (appendToExamId) {
                      router.push(`/dashboard/cloud/${appendToExamId}`);
                    }
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======== Move Modal ======== */}
      <AnimatePresence>
        {movingExam && (
          <MoveToGroupModal
            groups={dbGroups}
            currentGroupId={movingExam.bookGroupId}
            onMove={handleMoveExam}
            onClose={() => setMovingExam(null)}
          />
        )}
      </AnimatePresence>

      {/* ======== Create Group Modal ======== */}
      <AnimatePresence>
        {showCreateGroup && (
          <CreateGroupModal
            parentId={showCreateGroup.parentId}
            onSave={handleCreateGroupSave}
            onClose={() => setShowCreateGroup(null)}
          />
        )}
      </AnimatePresence>

      {/* ======== Delete Confirm Modal (2-step + PIN) ======== */}
      <AnimatePresence>
        {deleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) setDeleteModal(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-2xl border bg-surface-card shadow-2xl mx-4 overflow-hidden"
            >
              {/* ── Step Indicator ── */}
              <div className="flex items-center gap-0 border-b border-subtle">
                <div className={`flex-1 py-2.5 text-center text-xs font-semibold transition-colors ${deleteModal.step === 1 ? 'bg-red-900/20 text-red-400' : 'text-content-muted'}`}>
                  1단계 · 삭제 확인
                </div>
                <div className="h-full w-px bg-surface-raised" />
                <div className={`flex-1 py-2.5 text-center text-xs font-semibold transition-colors ${deleteModal.step === 2 ? 'bg-red-900/20 text-red-400' : 'text-content-muted'}`}>
                  2단계 · 관리자 PIN
                </div>
              </div>

              {/* ════ STEP 1: 삭제 대상 확인 ════ */}
              {deleteModal.step === 1 && (
                <>
                  <div className="flex items-center gap-3 px-6 py-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-900/30 border border-red-900/50">
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-content-primary">
                        {deleteModal.type === 'all' ? '시험지 전체 삭제' : '시험지 삭제'}
                      </h3>
                      <p className="text-xs text-content-tertiary mt-0.5">이 작업은 되돌릴 수 없습니다</p>
                    </div>
                  </div>

                  <div className="px-6 pb-4 space-y-3">
                    {deleteModal.type === 'all' ? (
                      <>
                        <p className="text-sm text-content-secondary">
                          현재 표시된 <span className="font-bold text-red-400">{filteredExams.length}개</span> 시험지를 모두 삭제합니다.
                        </p>
                        <div className="rounded-lg border border-subtle bg-surface-raised/40 divide-y divide-subtle/60 max-h-44 overflow-y-auto">
                          {filteredExams.slice(0, 10).map((exam) => (
                            <div key={exam.id} className="flex items-center gap-2 px-3 py-2">
                              <FileText className="h-3.5 w-3.5 text-content-tertiary flex-shrink-0" />
                              <span className="text-xs text-content-secondary truncate">{exam.fileName}</span>
                            </div>
                          ))}
                          {filteredExams.length > 10 && (
                            <div className="px-3 py-2.5 text-xs text-content-muted text-center">
                              외 {filteredExams.length - 10}개 더...
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-subtle bg-surface-raised/40 px-4 py-3 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-content-tertiary flex-shrink-0" />
                        <span className="text-sm text-content-secondary truncate">
                          {deleteModal.examName}
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-content-muted">
                      ※ 연결된 문제 데이터, 시험 기록도 함께 삭제됩니다.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-3 border-t border-subtle px-6 py-4">
                    <button
                      type="button"
                      onClick={() => setDeleteModal(null)}
                      className="rounded-lg border bg-surface-raised px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteNext}
                      className="flex items-center gap-2 rounded-lg bg-surface-raised hover:bg-surface-raised px-4 py-2 text-sm font-bold text-content-primary transition-colors"
                    >
                      다음
                      <ChevronLeft className="h-4 w-4 rotate-180" />
                    </button>
                  </div>
                </>
              )}

              {/* ════ STEP 2: 관리자 PIN 입력 ════ */}
              {deleteModal.step === 2 && (
                <>
                  <div className="flex items-center gap-3 px-6 py-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-900/30 border border-amber-900/50">
                      <Shield className="h-5 w-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-content-primary">관리자 PIN 확인</h3>
                      <p className="text-xs text-content-tertiary mt-0.5">삭제를 진행하려면 관리자 PIN을 입력하세요</p>
                    </div>
                  </div>

                  <div className="px-6 pb-4 space-y-3">
                    {/* 삭제 대상 요약 */}
                    <div className="rounded-lg border border-red-900/30 bg-red-900/10 px-3 py-2 flex items-center gap-2">
                      <Trash2 className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                      <span className="text-xs text-red-400">
                        {deleteModal.type === 'all'
                          ? `${filteredExams.length}개 시험지 전체 삭제`
                          : `"${deleteModal.examName}" 삭제`}
                      </span>
                    </div>

                    {/* PIN 입력 */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-content-secondary">관리자 PIN</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-tertiary" />
                        <input
                          type="password"
                          value={deletePinInput}
                          onChange={(e) => {
                            setDeletePinInput(e.target.value);
                            setDeletePinError(false);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleDeleteConfirm(); }}
                          placeholder="PIN 입력"
                          autoFocus
                          className={`w-full rounded-lg border pl-9 pr-4 py-2.5 text-sm bg-surface-raised text-content-primary placeholder-content-muted outline-none transition-colors ${
                            deletePinError
                              ? 'border-red-500 focus:border-red-400'
                              : 'border focus:border-cyan-500'
                          }`}
                        />
                      </div>
                      {deletePinError && (
                        <p className="text-xs text-red-400 flex items-center gap-1">
                          <X className="h-3 w-3" />
                          PIN이 올바르지 않습니다.
                        </p>
                      )}
                    </div>

                    {/* PIN 변경 링크 */}
                    <button
                      type="button"
                      onClick={() => { setDeleteModal(null); setShowPinModal(true); }}
                      className="text-xs text-content-muted hover:text-content-secondary flex items-center gap-1 transition-colors"
                    >
                      <KeyRound className="h-3 w-3" />
                      PIN 변경
                    </button>

                    <p className="text-xs text-content-muted">초기 PIN: 1234</p>

                    {/* 인라인 에러 메시지 */}
                    {deleteModalError && (
                      <div className="rounded-lg border border-red-900/40 bg-red-900/15 px-3 py-2 flex items-start gap-2">
                        <X className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-400 leading-relaxed">{deleteModalError}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-subtle px-6 py-4">
                    <button
                      type="button"
                      onClick={() => setDeleteModal((prev) => (prev ? { ...prev, step: 1 } : null))}
                      disabled={isDeleting}
                      className="flex items-center gap-1.5 text-sm text-content-tertiary hover:text-content-primary transition-colors disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      이전
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setDeleteModal(null)}
                        disabled={isDeleting}
                        className="rounded-lg border bg-surface-raised px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors disabled:opacity-50"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteConfirm}
                        disabled={isDeleting || !deletePinInput}
                        className="flex items-center gap-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:bg-surface-raised disabled:text-content-tertiary px-4 py-2 text-sm font-bold text-white transition-colors"
                      >
                        {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {isDeleting ? '삭제 중...' : '삭제 확인'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======== PIN Change Modal ======== */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowPinModal(false); setPinOld(''); setPinNew(''); setPinConfirm(''); setPinChangeError(''); } }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-sm rounded-2xl border bg-surface-card shadow-2xl mx-4"
            >
              <div className="flex items-center gap-3 border-b border-subtle px-6 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-900/30 border border-cyan-900/50">
                  <KeyRound className="h-4 w-4 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-content-primary">관리자 PIN 변경</h3>
                  <p className="text-xs text-content-tertiary mt-0.5">삭제 작업에 필요한 PIN을 변경합니다</p>
                </div>
              </div>

              <div className="px-6 py-4 space-y-3">
                {[
                  { label: '현재 PIN', value: pinOld, setter: setPinOld, placeholder: '현재 PIN 입력' },
                  { label: '새 PIN (4자리 이상)', value: pinNew, setter: setPinNew, placeholder: '새 PIN 입력' },
                  { label: '새 PIN 확인', value: pinConfirm, setter: setPinConfirm, placeholder: '새 PIN 재입력' },
                ].map(({ label, value, setter, placeholder }) => (
                  <div key={label} className="space-y-1.5">
                    <label className="text-xs font-medium text-content-secondary">{label}</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-tertiary" />
                      <input
                        type="password"
                        value={value}
                        onChange={(e) => { setter(e.target.value); setPinChangeError(''); }}
                        placeholder={placeholder}
                        className="w-full rounded-lg border pl-9 pr-4 py-2.5 text-sm bg-surface-raised text-content-primary placeholder-content-muted outline-none focus:border-cyan-500 transition-colors"
                      />
                    </div>
                  </div>
                ))}
                {pinChangeError && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <X className="h-3 w-3" />
                    {pinChangeError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-subtle px-6 py-4">
                <button
                  type="button"
                  onClick={() => { setShowPinModal(false); setPinOld(''); setPinNew(''); setPinConfirm(''); setPinChangeError(''); }}
                  className="rounded-lg border bg-surface-raised px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handlePinChange}
                  disabled={!pinOld || !pinNew || !pinConfirm}
                  className="flex items-center gap-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:bg-surface-raised disabled:text-content-tertiary px-4 py-2 text-sm font-bold text-white transition-colors"
                >
                  <Check className="h-4 w-4" />
                  PIN 변경
                </button>
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
            <div className="flex items-center justify-between rounded-2xl border border-subtle bg-surface-card/90 px-4 py-2.5 flex-shrink-0">
              <span className="rounded-full border bg-surface-raised px-3 py-1 text-[11px] font-semibold text-content-secondary">
                북그룹 {totalGroups}개
              </span>
              <button
                type="button"
                onClick={handleAddRootGroup}
                className="flex items-center gap-2 rounded-full border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-content-secondary transition-all hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-content-muted bg-surface-card text-content-secondary">
                  <Plus className="h-3 w-3" />
                </span>
                <span>최상위 북그룹 추가</span>
              </button>
            </div>

            {/* Tree Panel */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-card/90">
              <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 p-2">
                {treeNodes.length > 0 ? (
                  <div className="space-y-0.5">
                    {treeNodes.map((node) => (
                      <TreeNodeComponent
                        key={node.id}
                        node={node}
                        level={0}
                        selectedId={selectedId}
                        renamingId={renamingGroupId}
                        renameValue={renameValue}
                        onSelect={handleSelect}
                        onToggle={toggleNode}
                        onRename={handleStartRenameGroup}
                        onRenameChange={setRenameValue}
                        onRenameConfirm={handleConfirmRenameGroup}
                        onRenameCancel={() => setRenamingGroupId(null)}
                        onAddChild={handleAddChild}
                        onDelete={handleDeleteGroup}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2">
                    <Smile className="h-12 w-12 text-cyan-500/50" />
                    <p className="text-sm text-content-tertiary">업로드된 시험지가 없습니다.</p>
                    <p className="text-xs text-content-muted">문제를 업로드하면 자동으로 표시됩니다.</p>
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
            <div className="flex h-8 w-3 items-center justify-center rounded-sm border bg-surface-raised hover:bg-surface-raised transition-colors">
              <GripVertical className="h-3 w-3 text-content-tertiary" />
            </div>
          </div>

          {/* ======== Right Panel: File List ======== */}
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden pl-2">
            <div className="flex h-full flex-col rounded-2xl border border-subtle bg-surface-card/90">
              {selectedId ? (
                <>
                  {/* Content Header */}
                  <div className="flex items-center justify-between border-b border-subtle px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
                        <FileText className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-content-primary truncate">{selectedName}</h2>
                        <p className="text-[11px] text-content-tertiary">
                          총 {exams.length}건 · 표시 {filteredExams.length}건
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Search */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary" />
                        <input
                          type="text"
                          placeholder="파일명으로 검색..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-8 w-48 rounded-lg border bg-surface-raised/50 pl-8 pr-3 text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      </div>
                      {/* Sort */}
                      <button
                        type="button"
                        onClick={() => toggleSort('name')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border bg-surface-raised/50 text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors"
                        title="정렬"
                      >
                        <ListFilter className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSort('order')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border bg-surface-raised/50 text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors"
                        title="순서 정렬"
                      >
                        {sortDir === 'asc' ? <ArrowUpDown className="h-3.5 w-3.5" /> : <ArrowDownUp className="h-3.5 w-3.5" />}
                      </button>
                      {/* Action buttons */}
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border bg-surface-raised/50 text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors"
                        title="복사"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border bg-surface-raised/50 text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors"
                        title="내보내기"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteAllVisible}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-red-900/50 bg-red-900/10 px-2.5 text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors text-xs font-medium"
                        title="현재 보이는 시험지 전체 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        전체 삭제
                      </button>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                    {/* Table Header */}
                    <div className="sticky top-0 z-10 flex items-center border-b border-subtle bg-surface-raised/60 backdrop-blur px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-content-tertiary">
                      <span
                        className="w-14 text-center cursor-pointer hover:text-content-primary"
                        onClick={() => toggleSort('order')}
                      >
                        순서
                      </span>
                      <span
                        className="flex-1 pl-3 cursor-pointer hover:text-content-primary"
                        onClick={() => toggleSort('name')}
                      >
                        파일명
                      </span>
                      <span
                        className="w-24 text-center cursor-pointer hover:text-content-primary"
                        onClick={() => toggleSort('problems')}
                      >
                        문제 수
                      </span>
                      <span className="w-20 text-center">작업</span>
                    </div>

                    {/* Table Body */}
                    <div className="divide-y divide-subtle/40">
                      {filteredExams.map((exam) => (
                        <div
                          key={exam.id}
                          className="group flex items-center px-5 py-3 hover:bg-surface-raised/30 transition-colors cursor-pointer"
                          onClick={() => router.push(`/dashboard/cloud/${exam.id}`)}
                        >
                          <span className="w-14 text-center">
                            <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md bg-surface-raised px-1.5 text-[11px] font-bold text-content-secondary">
                              #{exam.order}
                            </span>
                          </span>
                          <div className="flex-1 flex items-center gap-2 pl-3 min-w-0">
                            {renamingExamId === exam.id ? (
                              <input
                                type="text"
                                value={renameExamValue}
                                onChange={(e) => setRenameExamValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleConfirmRenameExam();
                                  if (e.key === 'Escape') setRenamingExamId(null);
                                }}
                                onBlur={handleConfirmRenameExam}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                                className="flex-1 bg-surface-raised border border-cyan-500/50 rounded px-2 py-1 text-[13px] text-content-primary outline-none"
                              />
                            ) : (
                              <span className="truncate text-[13px] text-content-secondary font-medium">
                                {exam.fileName}
                              </span>
                            )}
                            {exam.hasImage && renamingExamId !== exam.id && (
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
                          <span className="w-20 flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteExam(exam.id, exam.fileName);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 hover:bg-red-900/20 hover:text-red-400 transition-colors"
                              title="시험지 삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <FileContextMenu
                              onRename={() => handleStartRenameExam(exam.id, exam.fileName)}
                              onView={() => router.push(`/dashboard/cloud/${exam.id}`)}
                              onMove={() => setMovingExam({ id: exam.id, bookGroupId: exam.bookGroupId })}
                              onDownload={() => {
                                // TODO: Storage 연동 후 실제 파일 다운로드
                                alert('원본 파일 다운로드 기능은 Storage 연동 후 사용 가능합니다.');
                              }}
                              onDelete={() => handleDeleteExam(exam.id, exam.fileName)}
                            />
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
