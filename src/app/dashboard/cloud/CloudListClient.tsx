'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSubjectTrack } from '@/contexts/SubjectTrackContext';
import { trackHref } from '@/lib/track/href';
import { DEFAULT_SUBJECT_TRACK } from '@/lib/subject-track';
import { useOrganizationName } from '@/hooks/useUserScope';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  FolderOpen,
  Folder,
  MoreHorizontal,
  Search,
  ListFilter,
  LayoutGrid,
  List,
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
// ★ 업로드 모달 안에서만 쓰는 무거운 업로더 — dynamic import (열 때만 로드)
const CloudFlowUploader = dynamic(() => import('@/components/workflow/CloudFlowUploader'), { ssr: false });
import { supabaseBrowser } from '@/lib/supabase/client';
import { extractSchoolName } from '@/lib/utils/school-extract';
import { ExamFacetBar } from '@/components/cloud/ExamFacetBar';
import {
  parseExamTitle,
  matchesFacets,
  hasAnyFacet,
  buildFacetOptions,
  EMPTY_FACET_SELECTION,
  type ExamFacetSelection,
} from '@/lib/exams/parse-exam-title';
// ★ 폴더 트리 순수 로직 — 분리(회귀 테스트 대상). cloud-tree.test.ts 참조.
import {
  buildTreeFromDB,
  collectGroupIds,
  applyExpandedState,
  collectDescendantGroupIds,
  type DBBookGroup,
  type DBExam,
  type TreeNode,
} from './cloud-tree';

// ============================================================================
// Types
// ============================================================================

interface ExamFile {
  id: string;
  order: number;
  fileName: string;
  hasImage: boolean;
  problemCount: number;
  bookGroupId: string | null;
  createdAt?: string;
  grade?: string;
  subject?: string | null;
  year?: string;
  difficulty?: { low: number; mid: number; high: number; total: number } | null;
  /** 카드 액자에 그릴 1번 문제 본문 첫 토막. 없으면 문서 모티브로 폴백 */
  previewText?: string;
  // ★ 출처별 카테고리 (Phase 1)
  isDiagnostic?: boolean;
  examType?: string | null;
  diagnosticCategory?: string | null;
}

// ============================================================================
// 출처별 카테고리 — exam-create 와 동일 분류 체계
// ============================================================================
type SourceCategory = 'all' | 'diagnostic' | 'school' | 'textbook' | 'mock' | 'achievement';

const SOURCE_CATEGORIES: Array<{
  id: SourceCategory; label: string; color: string; emoji: string;
}> = [
  { id: 'all', label: '전체', color: 'indigo', emoji: '📚' },
  { id: 'diagnostic', label: '진단평가', color: 'indigo', emoji: '🩺' },
  { id: 'achievement', label: '성취도 평가', color: 'violet', emoji: '🎓' },
  { id: 'school', label: '학교기출', color: 'emerald', emoji: '🏫' },
  { id: 'textbook', label: '시중교재', color: 'amber', emoji: '📖' },
  { id: 'mock', label: '모의고사', color: 'rose', emoji: '📝' },
];

/** 탭 복귀 재조회 최소 간격 — 알트탭마다 전체 재조회가 나가지 않게 */
const VISIBILITY_REFETCH_MIN_MS = 30_000;

const MOCK_TITLE_PATTERN = /모의고사|평가원|교육청|수능|학평/;
const MOCK_TYPE_PATTERN = /모의|수능|평가원|학평/;
// ★ 성취도 평가 패턴 (2026-05-19): 사용자 요청 — 신규 카테고리.
//   학평·모의고사 와 충돌 방지 위해 "성취도" 명시어만 매칭.
const ACHIEVEMENT_TITLE_PATTERN = /성취도/;

// ★ 진단평가 트리 — 세션 타입 + 회차 계층 구조
const DIAG_CATEGORIES: Array<{ id: string; label: string; emoji: string }> = [
  { id: 'BS', label: '광역스캔', emoji: '🔬' },
  { id: 'DD', label: '정밀진단', emoji: '🎯' },
  { id: 'PT', label: '선수추적', emoji: '🔗' },
  { id: 'SC', label: '스팟체크', emoji: '✅' },
];

function diagRoundLabel(round: string): string {
  const num = round.replace(/[^0-9]/g, '');
  return `${num}회차`;
}

type SortField = 'order' | 'name' | 'problems' | 'grade';

function gradeRank(grade?: string): number {
  if (!grade) return 9999;
  const head = grade.replace(/\s/g, '').charAt(0);
  const numMatch = grade.match(/\d+/);
  const num = numMatch ? parseInt(numMatch[0], 10) : 0;
  if (head === '초') return 100 + num;
  if (head === '중') return 200 + num;
  if (head === '고') return 300 + num;
  if (head === '대') return 400 + num;
  return 9999;
}
type SortDir = 'asc' | 'desc';

// 폴더 트리 순수 로직(buildTreeFromDB/collectGroupIds/applyExpandedState/
// collectDescendantGroupIds)은 ./cloud-tree 로 분리 — 회귀 테스트 대상.

// ============================================================================
// Sub-Components
// ============================================================================

const MATH_SUBJECTS = ['공통수학1', '공통수학2', '대수', '미적분1', '확률과 통계', '미적분2', '기하'];
const SCIENCE_SUBJECTS = ['공통과학1', '공통과학2', '물리학1', '물리학2', '화학1', '화학2', '생명과학1', '생명과학2', '지구과학1', '지구과학2'];

// PR-T10 — 활성 트랙별 옵션. 트랙 미정·flag false 시 둘 다 노출 (기존 동작).
function getSubjectOptions(track: 'math' | 'science' | null): string[] {
  if (track === 'math') return ['전체', '── 수학 ──', ...MATH_SUBJECTS];
  if (track === 'science') return ['전체', '── 과학 ──', ...SCIENCE_SUBJECTS];
  return ['전체', '── 수학 ──', ...MATH_SUBJECTS, '── 과학 ──', ...SCIENCE_SUBJECTS];
}

// 기존 호환 (Provider 외부 컴포넌트가 import 할 경우)
const subjectOptions = getSubjectOptions(null);

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
                  <div key={opt} className="px-4 py-1.5 text-xs font-bold text-content-tertiary border-t border-subtle mt-1 pt-2">
                    {opt.replace(/──\s?/g, '').trim()}
                  </div>
                );
              }
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { onChange(opt); setOpen(false); }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-surface-raised transition-colors ${value === opt ? 'bg-surface-raised text-indigo-400 font-medium' : 'text-content-secondary'}`}
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

// ============================================================================
// 출처 카테고리 뱃지 — 클릭 시 변경 드롭다운
// ============================================================================

type ReclassifyCategory = 'diagnostic' | 'achievement' | 'school' | 'textbook' | 'mock';

const RECLASSIFY_OPTIONS: Array<{
  id: ReclassifyCategory; label: string; emoji: string;
  colorClass: string; bgClass: string; borderClass: string;
}> = [
  { id: 'diagnostic',  label: '진단평가',    emoji: '🩺', colorClass: 'text-indigo-400',  bgClass: 'bg-indigo-500/5',  borderClass: 'border-indigo-500/30' },
  { id: 'achievement', label: '성취도 평가', emoji: '🎓', colorClass: 'text-violet-400',  bgClass: 'bg-violet-500/5',  borderClass: 'border-violet-500/30' },
  { id: 'school',      label: '학교기출',    emoji: '🏫', colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/5', borderClass: 'border-emerald-500/30' },
  { id: 'textbook',    label: '시중교재',    emoji: '📖', colorClass: 'text-amber-400',   bgClass: 'bg-amber-500/5',   borderClass: 'border-amber-500/30' },
  { id: 'mock',        label: '모의고사',    emoji: '📝', colorClass: 'text-rose-400',    bgClass: 'bg-rose-500/5',    borderClass: 'border-rose-500/30' },
];

function examCategoryInfo(isDiagnostic?: boolean, examType?: string | null) {
  if (isDiagnostic) return RECLASSIFY_OPTIONS[0];                            // 진단평가
  if (examType === '성취도 평가') return RECLASSIFY_OPTIONS[1];              // 성취도 평가
  if (examType === '모의고사') return RECLASSIFY_OPTIONS[4];
  if (examType === '시중교재') return RECLASSIFY_OPTIONS[3];
  return RECLASSIFY_OPTIONS[2]; // 학교기출 (기본)
}

const SourceCategoryBadge: React.FC<{
  examId: string;
  isDiagnostic?: boolean;
  examType?: string | null;
  onReclassify: (examId: string, cat: ReclassifyCategory) => Promise<void>;
}> = ({ examId, isDiagnostic, examType, onReclassify }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const info = examCategoryInfo(isDiagnostic, examType);

  const handleSelect = async (e: React.MouseEvent, cat: ReclassifyCategory) => {
    e.stopPropagation();
    setSaving(true);
    setOpen(false);
    await onReclassify(examId, cat);
    setSaving(false);
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={saving}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all hover:opacity-80 ${info.bgClass} ${info.borderClass} ${info.colorClass} ${saving ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
      >
        <span>{info.emoji}</span>
        <span>{info.label}</span>
        {!saving && <ChevronDown className="h-2.5 w-2.5 opacity-50" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 min-w-[120px] rounded-lg border bg-surface-card py-1 shadow-xl">
            {RECLASSIFY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={(e) => handleSelect(e, opt.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-raised transition-colors ${
                  opt.id === (isDiagnostic ? 'diagnostic' : examType === '성취도 평가' ? 'achievement' : examType === '모의고사' ? 'mock' : examType === '시중교재' ? 'textbook' : 'school')
                    ? `${opt.colorClass} font-semibold`
                    : 'text-content-secondary'
                }`}
              >
                <span>{opt.emoji}</span>
                <span>{opt.label}</span>
              </button>
            ))}
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
            ? 'bg-indigo-500/10 text-indigo-400'
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
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-indigo-500" />
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
            className="flex-1 bg-surface-raised border border-indigo-500/50 rounded px-1.5 py-0.5 text-sm text-content-primary outline-none"
          />
        ) : (
          <span className={`flex-1 truncate text-sm ${isSelected ? 'font-semibold' : 'font-medium'}`}>
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
  // ★ 평면 목록 → 계층(부모-자식) DFS 순서 + depth. 좌측 폴더 트리와 동일한 위계로 보여 이동이 직관적.
  const ordered = React.useMemo(() => {
    const byParent = new Map<string | null, DBBookGroup[]>();
    for (const g of groups) {
      const p = g.parent_id ?? null;
      (byParent.get(p) ?? byParent.set(p, []).get(p)!).push(g);
    }
    const out: Array<{ g: DBBookGroup; depth: number }> = [];
    const visited = new Set<string>();
    const walk = (parent: string | null, depth: number) => {
      for (const g of byParent.get(parent) ?? []) {
        if (visited.has(g.id)) continue; // 순환/중복 방어
        visited.add(g.id);
        out.push({ g, depth });
        walk(g.id, depth + 1);
      }
    };
    walk(null, 0);
    // 부모가 목록에 없어 누락된 그룹(고아) → 최상위로 노출
    for (const g of groups) {
      if (!visited.has(g.id)) { visited.add(g.id); out.push({ g, depth: 0 }); }
    }
    return out;
  }, [groups]);

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
              currentGroupId === null ? 'bg-indigo-500/10 text-indigo-400' : 'text-content-secondary hover:bg-surface-raised'
            }`}
          >
            <Folder className="h-3.5 w-3.5" />
            미분류
            {currentGroupId === null && <Check className="h-3 w-3 ml-auto" />}
          </button>
          {ordered.map(({ g, depth }) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onMove(g.id)}
              style={{ paddingLeft: `${12 + depth * 16}px` }}
              className={`flex w-full items-center gap-2 rounded-lg pr-3 py-2 text-xs transition-colors ${
                currentGroupId === g.id ? 'bg-indigo-500/10 text-indigo-400' : 'text-content-secondary hover:bg-surface-raised'
              }`}
            >
              {depth > 0 && <span className="text-content-tertiary/50 select-none">└</span>}
              <Folder className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{g.name}</span>
              {currentGroupId === g.id && <Check className="h-3 w-3 ml-auto flex-shrink-0" />}
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

// ★ 상단 출처 카테고리 ↔ 같은 이름의 최상위 폴더 연결.
//   해당 이름의 최상위 폴더가 있으면 그 카테고리는 "폴더 기준"으로 동작
//   (좌측 = 그 폴더의 하위 트리(빈 학년 폴더 포함), 우측 = 그 폴더+하위 시험지).
//   없으면(모의고사·성취도 등 폴더 미생성) 기존 exam-type 기준 유지.
const CATEGORY_FOLDER_NAME: Record<string, string> = {
  diagnostic: '진단평가',
  achievement: '성취도평가',
  school: '학교기출',
  textbook: '시중교재',
  mock: '모의고사',
};

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
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-600 px-6 py-5">
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
                        ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                        : 'border bg-surface-raised/50 hover:border-content-muted hover:bg-surface-raised'
                    }`}
                  >
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-indigo-500/20 text-indigo-400' : 'bg-surface-raised/50 text-content-tertiary'
                    }`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold ${isSelected ? 'text-indigo-400' : 'text-content-secondary'}`}>
                        {type.label}
                      </div>
                      <div className="text-xs text-content-tertiary leading-tight mt-0.5">{type.desc}</div>
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
              autoComplete="off"
              className="w-full rounded-xl border bg-surface-raised px-4 py-3 text-sm text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
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
              className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-surface-raised disabled:text-content-tertiary px-5 py-2.5 text-sm font-bold text-white transition-colors shadow-lg shadow-indigo-500/20 disabled:shadow-none"
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
  // ★ 사이드바 "DB 자산화" 메뉴 진입 시 ?upload=1 → 업로드 모달 자동 오픈
  const autoOpenUpload = searchParams.get('upload') === '1';
  // PR-T10 — 활성 트랙별 과목 옵션. flag false / Provider 없음 → 둘 다 노출 (기존 동작)
  const { activeTrack, isEnabled: trackSplitEnabled } = useSubjectTrack();
  const trackKey = trackSplitEnabled ? activeTrack ?? null : null;
  // ★ 전환 체감 (2026-07-18): 상세 이동은 트랙 prefix 직접 적용(legacy 경로 push 는
  //   미들웨어 redirect 한 홉 추가) + 카드 hover 시 prefetch 로 클릭 전에 라우트 준비.
  const examHref = useCallback(
    (id: string) => trackHref(`/dashboard/cloud/${id}`, activeTrack ?? DEFAULT_SUBJECT_TRACK),
    [activeTrack],
  );
  const goExam = useCallback((id: string) => router.push(examHref(id)), [router, examHref]);
  const prefetchExam = useCallback((id: string) => {
    try { router.prefetch(examHref(id)); } catch { /* prefetch 실패는 무시 */ }
  }, [router, examHref]);
  const trackSubjectOptions = useMemo(() => getSubjectOptions(trackKey), [trackKey]);
  // ★ 학원명 prefix — "{학원명}클라우드" 동적 표시 (2026-05-17)
  const orgName = useOrganizationName('과사람');

  // --- DB Data ---
  const [dbExams, setDbExams] = useState<DBExam[]>([]);
  const [dbGroups, setDbGroups] = useState<DBBookGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ★ 출처별 카테고리 (Phase 1) — 트리·결과에 우선 적용되는 1차 필터
  const [sourceCategory, setSourceCategory] = useState<SourceCategory>('all');

  // ★ 진단평가/모의고사 sub-필터 (탭 아래 2번째 줄 칩) — 카테고리 직교 차원
  const [diagSession, setDiagSession] = useState<'all' | 'BS' | 'DD' | 'PT' | 'SC'>('all');
  const [diagRound, setDiagRound] = useState<string>('all');   // 'all' | 'R1' | 'R2' ...
  const [mockYear, setMockYear] = useState<string>('all');     // 'all' | '2026' ...

  // ★ 출처 카테고리 변경 시 sub-필터·왼쪽 선택 리셋
  useEffect(() => {
    setDiagSession('all');
    setDiagRound('all');
    setMockYear('all');
    setSelectedId('all');
    setSelectedName('전체 시험지');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceCategory]);

  // --- Upload Modal ---
  const [showUploadModal, setShowUploadModal] = useState(!!appendToExamId || autoOpenUpload);

  // ★ 같은 페이지에 머물면서 ?upload=1 로 다시 클릭 시 (Next.js Link soft navigation),
  //   useState 초기값은 mount 시점만 평가되므로 모달이 안 뜸. useEffect 로 query 감지.
  //   모달 띄운 후 URL 에서 ?upload=1 제거 → 다음 클릭 때도 query 변경으로 인식.
  useEffect(() => {
    if (autoOpenUpload) {
      setShowUploadModal(true);
      // history.replaceState 로 URL 만 갱신 (router.replace 는 페이지 재렌더 유발)
      const url = new URL(window.location.href);
      url.searchParams.delete('upload');
      window.history.replaceState({}, '', url.toString());
    }
  }, [autoOpenUpload]);

  // ★ TopNav DB 자산화 탭이 클라우드 페이지에 있을 때 dispatch 하는 글로벌 이벤트 리스너.
  //   Next.js Link 가 same URL 로는 navigation 안 일으키는 회귀 차단 (PR #47/#49 사고).
  useEffect(() => {
    const handler = () => setShowUploadModal(true);
    window.addEventListener('cloud:open-upload', handler);
    return () => window.removeEventListener('cloud:open-upload', handler);
  }, []);
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
  // PR-T10 — 트랙별 옵션 첫 항목 (보통 '전체')
  const [subject, setSubject] = useState(trackSubjectOptions[0]);
  // ★ 트리는 dbGroups/dbExams 에서 파생(아래 useMemo). 펼침/접힘 토글은 ref 보존 +
  //   expandVersion bump 로 재계산 트리거 (ref 변경은 useMemo deps 가 감지 못하므로).
  const [expandVersion, setExpandVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>('all');
  const [selectedName, setSelectedName] = useState<string>('전체 시험지');
  const [searchQuery, setSearchQuery] = useState('');
  // ★ 조건(패싯) — 제목의 연도·학년·학기·중간기말·학교급으로 좁힌다 (2026-07-23).
  //   폴더 트리는 계층을 하나만 표현해 같은 학교 자료가 여러 폴더로 흩어진다
  //   (실측: 47개 학교 중 19개가 2~5개 폴더). 트리는 그대로 두고 좁히기만 여기서.
  //   비어 있으면 기존 목록과 100% 동일 — 켜기 전엔 아무 동작도 바뀌지 않는다.
  const [facets, setFacets] = useState<ExamFacetSelection>(EMPTY_FACET_SELECTION);
  const [sortField, setSortField] = useState<SortField>('grade');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // --- 시험지 목록 뷰 모드 (그리드 카드 / 리스트). localStorage 로 선호 보존 ---
  //   기본 grid(프리미엄 카드). useEffect 로 마운트 후 복원 → SSR mismatch 회피.
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  useEffect(() => {
    const v = typeof window !== 'undefined' ? localStorage.getItem('cloud_view_mode') : null;
    if (v === 'grid' || v === 'list') setViewMode(v);
  }, []);
  const changeViewMode = useCallback((m: 'grid' | 'list') => {
    setViewMode(m);
    try { localStorage.setItem('cloud_view_mode', m); } catch { /* ignore */ }
  }, []);

  // --- Rename state ---
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingExamId, setRenamingExamId] = useState<string | null>(null);
  const [renameExamValue, setRenameExamValue] = useState('');

  // --- Reclassify handler ---
  const handleReclassify = useCallback(async (examId: string, cat: ReclassifyCategory) => {
    const payload: Record<string, any> =
      cat === 'diagnostic'
        ? { isDiagnostic: true,  examType: null }
        : cat === 'achievement'
        ? { isDiagnostic: false, examType: '성취도 평가' }
        : cat === 'mock'
        ? { isDiagnostic: false, examType: '모의고사' }
        : cat === 'textbook'
        ? { isDiagnostic: false, examType: '시중교재' }
        : { isDiagnostic: false, examType: '학교기출' };

    try {
      const res = await fetch(`/api/exams/${examId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { console.error('[Cloud] reclassify failed'); return; }
      // 로컬 상태 즉시 반영
      setDbExams((prev) => prev.map((e) =>
        e.id !== examId ? e : {
          ...e,
          isDiagnostic: payload.isDiagnostic,
          examType: payload.examType ?? e.examType,
        }
      ));
    } catch (err) {
      console.error('[Cloud] reclassify error', err);
    }
  }, []);

  // Resizable panels
  const [leftWidth, setLeftWidth] = useState(28);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- 확장 상태 보존 ---
  const expandedIdsRef = useRef<Set<string>>(new Set(['all']));

  // ★ 트리 파생 — dbGroups/dbExams 변경 시 자동 재계산(낙관적 업데이트가 두 소스만 건드리면
  //   트리·폴더 카운트·목록이 원자적으로 일관됨). expandVersion 은 토글(ref) 반영용.
  const treeNodes = useMemo(
    () => applyExpandedState(buildTreeFromDB(dbGroups, dbExams), expandedIdsRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dbGroups, dbExams, expandVersion]
  );

  // --- DB에서 데이터 가져오기 ---
  // 마지막 성공 시각 — 탭 복귀 시 과도한 재조회를 막는 기준
  const lastFetchAtRef = useRef(0);

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      // ★ silent: 폴더/시험지 작업 후 재조회 시 로딩 스켈레톤 없이 화면 유지한 채 갱신
      //   (전체 새로고침처럼 깜빡이던 문제 해소). 초기 로드·재시도만 스켈레톤 표시.
      if (!opts?.silent) setIsLoading(true);
      setLoadError(null);

      const subjectParam = subject !== '전체' ? `?subject=${encodeURIComponent(subject)}` : '';

      // 북그룹 + 시험지 병렬 fetch (no-store: 삭제 후 최신 데이터 보장)
      const [groupsRes, examsRes] = await Promise.all([
        fetch(`/api/book-groups${subjectParam}`, { cache: 'no-store' }),
        fetch(`/api/exams${subjectParam}`, { cache: 'no-store' }),
      ]);

      if (!groupsRes.ok) throw new Error(`BookGroups HTTP ${groupsRes.status}`);
      if (!examsRes.ok) throw new Error(`Exams HTTP ${examsRes.status}`);

      const groupsData = await groupsRes.json();
      const examsData = await examsRes.json();

      const groups: DBBookGroup[] = groupsData.groups || [];
      const exams: DBExam[] = examsData.exams || [];

      // ★ 트리는 dbGroups/dbExams 에서 파생되므로(useMemo) 여기서 두 소스만 갱신.
      setDbGroups(groups);
      setDbExams(exams);
      lastFetchAtRef.current = Date.now();
    } catch (err) {
      console.error('[Cloud] Failed to load data:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      if (!opts?.silent) setIsLoading(false);
    }
  }, [subject]);

  // 초기 로드 + 과목 변경 시 재로드
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 페이지 복귀 시 데이터 재로드
  //
  // ★ 두 가지 사고를 같이 막는다 (2026-07-23)
  //   1) silent 필수 — 없으면 setIsLoading(true) 가 걸려 카드가 스켈레톤으로 교체됐다가
  //      다시 그려진다. 탭을 오갈 때마다 목록이 사라졌다 나타나던 원인.
  //      (silent 는 #356 에서 폴더 작업용으로 만들어 뒀는데 여기만 안 쓰고 있었다.)
  //   2) 최근에 받았으면 건너뛴다 — 알트탭을 자주 하면 매번 전체 재조회가 나가
  //      요청이 쌓인다. 30초 안에 받은 데이터면 그대로 쓴다.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchAtRef.current < VISIBILITY_REFETCH_MIN_MS) return;
      fetchData({ silent: true });
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
    // 파생 트리: 토글 상태는 ref 에 보존하고 expandVersion bump 로 재계산.
    if (expandedIdsRef.current.has(id)) expandedIdsRef.current.delete(id);
    else expandedIdsRef.current.add(id);
    setExpandVersion((v) => v + 1);
  }, []);

  const handleSelect = useCallback((id: string, name: string) => {
    setSelectedId(id);
    setSelectedName(name);
    // 검색어는 유지 (북그룹 변경해도 검색 상태 보존)
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

  // 모달에서 저장 시 API 호출 — ★ 낙관적: temp 폴더 즉시 추가 + 모달 즉시 닫기, 실패 시 롤백.
  const handleCreateGroupSave = useCallback(async (data: { name: string; groupType: string; parentId: string | null }) => {
    const snapshot = dbGroups;
    const tempId = `temp-${Date.now()}`;
    const optimistic: DBBookGroup = {
      id: tempId,
      name: data.name,
      parent_id: data.parentId,
      subject: subject !== '전체' ? subject : null,
      sort_order: 9999,
      institute_id: null,
      created_by: null,
      created_at: new Date().toISOString(),
    };
    // 부모 그룹 확장 → 새 하위 폴더가 바로 보이게
    if (data.parentId) expandedIdsRef.current.add(data.parentId);
    setDbGroups((prev) => [...prev, optimistic]);
    setShowCreateGroup(null);

    try {
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
        setDbGroups(snapshot); // 롤백
        alert(`그룹 생성 실패: ${err.error || err.detail || '알 수 없는 오류'}`);
        // 입력값 보존 위해 모달 재오픈
        setShowCreateGroup({ parentId: data.parentId });
        return;
      }
      await fetchData({ silent: true }); // temp → 실제 노드 교체
    } catch (err) {
      console.error('[Cloud] Create group error:', err);
      setDbGroups(snapshot);
      alert('그룹 생성 중 오류가 발생했습니다.');
      setShowCreateGroup({ parentId: data.parentId });
    }
  }, [fetchData, subject, dbGroups]);

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

  // 그룹 이름 변경 확인 — ★ 낙관적: 즉시 이름 반영, 실패 시 롤백.
  const handleConfirmRenameGroup = useCallback(async () => {
    const id = renamingGroupId;
    const newName = renameValue.trim();
    if (!id || !newName) {
      setRenamingGroupId(null);
      return;
    }
    setRenamingGroupId(null);
    const snapshot = dbGroups;
    setDbGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name: newName } : g)));

    try {
      const res = await fetch(`/api/book-groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setDbGroups(snapshot); // 롤백
        alert(`이름 변경 실패: ${err.error || '알 수 없는 오류'}`);
        return;
      }
      await fetchData({ silent: true });
    } catch (err) {
      console.error('[Cloud] Rename group error:', err);
      setDbGroups(snapshot); // 롤백
    }
  }, [renamingGroupId, renameValue, fetchData, dbGroups]);

  // 그룹 삭제 — ★ 낙관적: 폴더(+하위) 즉시 제거, 실패 시 롤백.
  const handleDeleteGroup = useCallback(async (id: string, name: string) => {
    if (!confirm(`"${name}" 그룹을 삭제하시겠습니까? 하위 그룹도 함께 삭제됩니다.`)) return;

    // 하위 그룹까지 제거 대상 수집 (cloud-tree 의 순수 함수 — 회귀 테스트 대상)
    const removeIds = collectDescendantGroupIds(dbGroups, id);

    const snapshot = dbGroups;
    setDbGroups((prev) => prev.filter((g) => !removeIds.has(g.id)));
    // 선택된 그룹(또는 그 하위)이 삭제된 경우 "전체"로 이동
    if (selectedId && removeIds.has(selectedId)) {
      setSelectedId('all');
      setSelectedName('전체 시험지');
    }

    try {
      const res = await fetch(`/api/book-groups/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setDbGroups(snapshot); // 롤백
        alert(`삭제 실패: ${err.error || '알 수 없는 오류'}`);
        return;
      }
      await fetchData({ silent: true });
    } catch (err) {
      console.error('[Cloud] Delete group error:', err);
      setDbGroups(snapshot); // 롤백
      alert('삭제 중 오류가 발생했습니다.');
    }
  }, [selectedId, fetchData, dbGroups]);

  // --- 선택된 그룹의 시험지 목록 ---
  const findNodeById = useCallback((nodes: TreeNode[], id: string): TreeNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
    return null;
  }, []);

  // ★ 카테고리(sourceCategory)에 대응하는 최상위 폴더 노드 (이름 일치). 없으면 null → 기존 type 기준.
  const findCategoryRoot = useCallback((cat: string): TreeNode | null => {
    const nm = CATEGORY_FOLDER_NAME[cat];
    if (!nm) return null;
    return treeNodes.find((n) => !n.isVirtual && n.parentId === null && n.name === nm) || null;
  }, [treeNodes]);

  // 과목 필터 적용된 시험지
  const subjectFilteredExams = useMemo(() => {
    if (subject === '전체') return dbExams;
    return dbExams.filter((e) => e.subject === subject);
  }, [dbExams, subject]);

  // ★ 출처별 카테고리 필터 — 과목 필터 다음에 적용
  //   진단평가:  isDiagnostic === true
  //   학교기출:  examType 기준 — bookGroupId는 폴더 분류용이라 출처 판단에 사용 X
  //   시중교재:  examType === '시중교재' 명시값만
  //   모의고사:  examType === '모의고사' || title 패턴 매칭
  //   exam-create 의 SOURCE_TABS 분류와 동일 — 한 화면 일관성.
  const categoryFilteredExams = useMemo(() => {
    if (sourceCategory === 'all') return subjectFilteredExams;
    // ★ 같은 이름 최상위 폴더가 있으면 그 폴더(+하위)에 든 시험지로 스코프 (폴더 기준)
    const catRoot = findCategoryRoot(sourceCategory);
    if (catRoot) {
      const ids = new Set(collectGroupIds(catRoot));
      return subjectFilteredExams.filter((e) => e.bookGroupId && ids.has(e.bookGroupId));
    }
    return subjectFilteredExams.filter((e) => {
      const titleStr = e.title || e.fileName || '';
      switch (sourceCategory) {
        case 'diagnostic':
          return !!e.isDiagnostic;
        case 'achievement':
          // ★ 성취도 평가 (2026-05-19): examType 명시값 OR 제목에 '성취도'
          if (e.isDiagnostic) return false;
          return e.examType === '성취도 평가' || ACHIEVEMENT_TITLE_PATTERN.test(titleStr);
        case 'school':
          // bookGroupId는 폴더 구분용 — 출처 판단 기준이 아님
          if (e.isDiagnostic) return false;
          // 성취도 평가 도 학교기출 에서 제외
          if (e.examType === '성취도 평가' || ACHIEVEMENT_TITLE_PATTERN.test(titleStr)) return false;
          return e.examType !== '모의고사' && e.examType !== '시중교재';
        case 'textbook':
          return !e.isDiagnostic && e.examType === '시중교재';
        case 'mock':
          return !e.isDiagnostic && (e.examType === '모의고사' || MOCK_TITLE_PATTERN.test(titleStr));
        default:
          return true;
      }
    });
  }, [subjectFilteredExams, sourceCategory, findCategoryRoot]);

  // ★ Sub-필터 적용 후 최종 examPool — 진단평가: BS/DD/PT/SC + 회차, 모의고사: 연도
  const subFilteredExams = useMemo(() => {
    if (sourceCategory === 'diagnostic') {
      return categoryFilteredExams.filter((e) => {
        if (diagSession !== 'all' && e.diagnosticCategory !== diagSession) return false;
        if (diagRound !== 'all' && e.diagnosticRound !== diagRound) return false;
        return true;
      });
    }
    if (sourceCategory === 'mock') {
      if (mockYear === 'all') return categoryFilteredExams;
      return categoryFilteredExams.filter((e) => e.createdAt?.startsWith(mockYear));
    }
    return categoryFilteredExams;
  }, [categoryFilteredExams, sourceCategory, diagSession, diagRound, mockYear]);

  // ★ 진단평가 sub-필터 옵션 (사용 가능한 세션·회차) — categoryFilteredExams 기준 자동 생성
  const diagSessionOptions = useMemo(() => {
    if (sourceCategory !== 'diagnostic') return [];
    const catCount = new Map<string, number>();
    for (const e of categoryFilteredExams) {
      const cat = e.diagnosticCategory || 'BS';
      catCount.set(cat, (catCount.get(cat) || 0) + 1);
    }
    return DIAG_CATEGORIES.map(({ id, label, emoji }) => ({
      id, label, emoji, count: catCount.get(id) || 0,
    }));
  }, [categoryFilteredExams, sourceCategory]);

  const diagRoundOptions = useMemo(() => {
    if (sourceCategory !== 'diagnostic') return [];
    // diagSession 적용한 후 회차별 집계
    const base = diagSession === 'all'
      ? categoryFilteredExams
      : categoryFilteredExams.filter((e) => e.diagnosticCategory === diagSession);
    const roundCount = new Map<string, number>();
    for (const e of base) {
      const r = e.diagnosticRound || '';
      if (r) roundCount.set(r, (roundCount.get(r) || 0) + 1);
    }
    return Array.from(roundCount.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([round, count]) => ({ id: round, label: diagRoundLabel(round), count }));
  }, [categoryFilteredExams, sourceCategory, diagSession]);

  const mockYearOptions = useMemo(() => {
    if (sourceCategory !== 'mock') return [];
    const yearCount = new Map<string, number>();
    for (const e of categoryFilteredExams) {
      const year = e.createdAt ? e.createdAt.substring(0, 4) : '미확인';
      yearCount.set(year, (yearCount.get(year) || 0) + 1);
    }
    return Array.from(yearCount.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, count]) => ({ id: year, label: `${year}년`, count }));
  }, [categoryFilteredExams, sourceCategory]);

  // ★ 트리 노드를 sub-필터된 examPool 기준으로 재계산 + 빈 폴더 숨김
  //   sourceCategory==='all' 일 때는 빈 폴더도 표시 (관리 화면).
  //   그 외(진단/모의/학교/시중)는 자료 있는 폴더만 표시 (사용자 결정).
  const displayedTreeNodes = useMemo(() => {
    const examCountMap = new Map<string, number>();
    let unclassifiedCount = 0;
    for (const e of subFilteredExams) {
      if (e.bookGroupId) {
        examCountMap.set(e.bookGroupId, (examCountMap.get(e.bookGroupId) || 0) + 1);
      } else {
        unclassifiedCount++;
      }
    }

    const rebuild = (nodes: TreeNode[], hideEmpty: boolean): TreeNode[] => {
      const result: TreeNode[] = [];
      for (const n of nodes) {
        if (n.id === 'all') {
          result.push({ ...n, examCount: subFilteredExams.length });
          continue;
        }
        if (n.id === 'unclassified') {
          if (sourceCategory === 'all' || unclassifiedCount > 0) {
            result.push({ ...n, examCount: unclassifiedCount });
          }
          continue;
        }
        const children = rebuild(n.children, hideEmpty);
        const directCount = examCountMap.get(n.id) || 0;
        const childExamSum = children.reduce((sum, c) => {
          if (c.id === 'all' || c.id === 'unclassified') return sum;
          return sum + c.examCount;
        }, 0);
        const totalCount = directCount + childExamSum;
        if (hideEmpty && totalCount === 0) continue;
        result.push({ ...n, examCount: directCount, children });
      }
      return result;
    };

    // ★ 카테고리↔폴더: 같은 이름 최상위 폴더가 있으면 그 폴더의 하위 트리만 표시(빈 학년 폴더 포함).
    //   상단 버튼 = 그 폴더 선택과 동일하게 좌측이 따라옴.
    const catRoot = findCategoryRoot(sourceCategory);
    if (catRoot) {
      const allNode: TreeNode = {
        id: 'all', name: '전체 시험지', parentId: null, subject: null,
        children: [], isExpanded: true, examCount: subFilteredExams.length, isVirtual: true,
      };
      const children = rebuild(catRoot.children, false); // 빈 폴더도 표시 (파일링용)
      const result: TreeNode[] = [allNode, ...children];
      if (unclassifiedCount > 0) {
        result.push({
          id: 'unclassified', name: '미분류', parentId: null, subject: null,
          children: [], isExpanded: false, examCount: unclassifiedCount, isVirtual: true,
        });
      }
      return result;
    }

    return rebuild(treeNodes, sourceCategory !== 'all');
  }, [treeNodes, subFilteredExams, sourceCategory, findCategoryRoot]);

  const exams: ExamFile[] = useMemo(() => {
    if (!selectedId || subFilteredExams.length === 0) return [];

    let filtered: DBExam[];

    if (selectedId === 'all') {
      filtered = subFilteredExams;
    } else if (selectedId === 'unclassified') {
      filtered = subFilteredExams.filter((e) => !e.bookGroupId);
    } else {
      // 선택된 그룹 + 자손 그룹의 시험지
      const node = findNodeById(treeNodes, selectedId);
      if (node) {
        const groupIds = new Set(collectGroupIds(node));
        filtered = subFilteredExams.filter((e) => e.bookGroupId && groupIds.has(e.bookGroupId));
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
      grade: exam.grade,
      subject: exam.subject,
      year: exam.year,
      difficulty: exam.difficulty,
      previewText: exam.previewText,
      isDiagnostic: exam.isDiagnostic,
      examType: exam.examType,
      diagnosticCategory: exam.diagnosticCategory,
    }));
  }, [selectedId, subFilteredExams, treeNodes, findNodeById]);

  // ★ 폴더 범위 목록을 제목 파싱 — 조건 칩 후보값은 "지금 이 범위에 실제로 있는 값"만.
  //   조건 적용 전 목록에서 뽑아야 칩 건수가 고정된다(누를 때마다 후보가 사라지지 않음).
  const parsedExamTitles = useMemo(
    () => exams.map((e) => parseExamTitle(e.fileName)),
    [exams],
  );
  const facetOptions = useMemo(() => buildFacetOptions(parsedExamTitles), [parsedExamTitles]);

  // 폴더를 옮기면 새 범위에 없는 조건은 자동으로 떨어뜨린다.
  // (안 그러면 조건은 켜져 있는데 칩은 사라져 0건 화면에서 빠져나올 수 없다.
  //  '전체에서 찾기'로 범위를 넓힐 땐 후보가 늘어나므로 아무것도 안 떨어진다.)
  useEffect(() => {
    setFacets((prev) => {
      if (!hasAnyFacet(prev)) return prev;
      const keep = (axis: keyof ExamFacetSelection) => {
        const avail = new Set(facetOptions[axis].map((o) => o.value));
        return prev[axis].filter((v) => avail.has(v));
      };
      const next: ExamFacetSelection = {
        year: keep('year'), grade: keep('grade'), term: keep('term'),
        kind: keep('kind'), level: keep('level'),
      };
      // 값까지 비교 — 길이만 보면 하나 빠지고 하나 들어온 경우를 놓친다.
      // keep() 은 prev 순서를 보존하므로 위치별 비교가 성립한다.
      const same = (Object.keys(next) as Array<keyof ExamFacetSelection>).every(
        (k) => next[k].length === prev[k].length && next[k].every((v, i) => v === prev[k][i]),
      );
      return same ? prev : next;
    });
  }, [facetOptions]);

  const filteredExams = useMemo(() => {
    let result = exams;
    // 조건 — 검색보다 먼저 적용(둘 다 켜면 교집합). 조건이 없으면 그대로 통과.
    if (hasAnyFacet(facets)) {
      result = result.filter((e) => matchesFacets(parseExamTitle(e.fileName), facets));
    }
    if (searchQuery) {
      // ★ 검색은 "현재 선택 폴더(+하위) 범위 안"에서만 (2026-06-12 수정).
      //   기존엔 북그룹 필터를 무시하고 전체 풀에서 검색 → 3학년 폴더 선택 후 검색해도 2학년까지
      //   나오던 사고. 전체 검색이 필요하면 좌측에서 '전체 시험지' 선택. (공백 제거·대소문자 무시)
      const q = searchQuery.toLowerCase().replace(/\s+/g, '');
      // ★ exams 가 아니라 result 에서 걸러야 한다 — 조건(패싯)과 교집합이 되도록.
      //   exams 로 시작하면 검색을 켜는 순간 앞의 조건이 통째로 무시된다.
      result = result.filter((e) => {
        const name = (e.fileName || '').toLowerCase().replace(/\s+/g, '');
        return name.includes(q);
      });
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'grade') {
        cmp = gradeRank(a.grade) - gradeRank(b.grade);
        if (cmp === 0) {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          cmp = tb - ta;
        }
      } else if (sortField === 'order') cmp = a.order - b.order;
      else if (sortField === 'name') cmp = a.fileName.localeCompare(b.fileName);
      else if (sortField === 'problems') cmp = a.problemCount - b.problemCount;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [exams, searchQuery, sortField, sortDir, facets]);

  // ★ groupId → 폴더명 맵 (트리 평탄화, 가상노드 제외) — 목록에 소속 폴더 배지 표시용.
  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (!n.isVirtual) m.set(n.id, n.name);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(treeNodes);
    return m;
  }, [treeNodes]);

  // ★ 현재 목록에 폴더가 2개 이상 섞여 있으면 소속 폴더 배지 노출 (직속 vs 하위 구분).
  //   단일 폴더(잎)면 모두 직속이라 배지 불필요(노이즈 방지).
  const showFolderBadge = useMemo(() => {
    const s = new Set(filteredExams.map((e) => e.bookGroupId ?? 'none'));
    return s.size > 1;
  }, [filteredExams]);

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
    const id = renamingExamId;
    const newName = renameExamValue.trim();
    if (!id || !newName) {
      setRenamingExamId(null);
      return;
    }
    setRenamingExamId(null);
    // ★ 낙관적: 목록 표시는 fileName 이므로 title·fileName 둘 다 즉시 반영.
    const snapshot = dbExams;
    setDbExams((prev) => prev.map((e) => (e.id === id ? { ...e, title: newName, fileName: newName } : e)));

    try {
      const res = await fetch(`/api/exams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setDbExams(snapshot); // 롤백
        alert(`이름 변경 실패: ${err.error || '알 수 없는 오류'}`);
        return;
      }
      await fetchData({ silent: true });
    } catch (err) {
      console.error('[Cloud] Rename exam error:', err);
      setDbExams(snapshot); // 롤백
    }
  }, [renamingExamId, renameExamValue, fetchData, dbExams]);

  // --- 시험지 그룹 이동 --- ★ 낙관적: bookGroupId 즉시 반영(출발/도착 폴더 카운트 동시 갱신), 실패 롤백.
  const handleMoveExam = useCallback(async (newGroupId: string | null) => {
    if (!movingExam) return;
    const id = movingExam.id;
    setMovingExam(null);
    const snapshot = dbExams;
    setDbExams((prev) => prev.map((e) => (e.id === id ? { ...e, bookGroupId: newGroupId } : e)));

    try {
      const res = await fetch(`/api/exams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookGroupId: newGroupId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setDbExams(snapshot); // 롤백
        alert(`이동 실패: ${err.error || '알 수 없는 오류'}`);
        return;
      }
      await fetchData({ silent: true });
    } catch (err) {
      console.error('[Cloud] Move exam error:', err);
      setDbExams(snapshot); // 롤백
    }
  }, [movingExam, fetchData, dbExams]);

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
          await fetchData({ silent: true });
          return;
        }
      }
      setDeleteModal(null);
      await fetchData({ silent: true });
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
          <h1 className="text-lg font-semibold text-content-primary">{orgName}클라우드 관리</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-content-tertiary">과목</span>
            <SubjectDropdown value={subject} options={trackSubjectOptions} onChange={setSubject} />
          </div>
          {/* ★ 출처별 카테고리 탭 — exam-create 와 동일 분류 (Phase 1) */}
          <div className="flex items-center gap-1 border-l border-subtle/50 pl-3">
            {SOURCE_CATEGORIES.map((cat) => {
              const isActive = sourceCategory === cat.id;
              const catRootForCount = cat.id === 'all' ? null : findCategoryRoot(cat.id);
              const count = cat.id === 'all'
                ? subjectFilteredExams.length
                : catRootForCount
                ? (() => {
                    const ids = new Set(collectGroupIds(catRootForCount));
                    return subjectFilteredExams.filter((e) => e.bookGroupId && ids.has(e.bookGroupId)).length;
                  })()
                : subjectFilteredExams.filter((e) => {
                    const titleStr = e.title || e.fileName || '';
                    switch (cat.id) {
                      case 'diagnostic': return !!e.isDiagnostic;
                      case 'achievement':
                        if (e.isDiagnostic) return false;
                        return e.examType === '성취도 평가' || ACHIEVEMENT_TITLE_PATTERN.test(titleStr);
                      case 'school':
                        if (e.isDiagnostic) return false;
                        // 성취도 평가 제외 (categoryFilteredExams 와 동일 로직)
                        if (e.examType === '성취도 평가' || ACHIEVEMENT_TITLE_PATTERN.test(titleStr)) return false;
                        return e.examType !== '모의고사' && e.examType !== '시중교재';
                      case 'textbook': return !e.isDiagnostic && e.examType === '시중교재';
                      case 'mock':
                        return !e.isDiagnostic && (e.examType === '모의고사' ||
                               MOCK_TITLE_PATTERN.test(titleStr));
                      default: return false;
                    }
                  }).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSourceCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    isActive
                      ? `bg-${cat.color}-500/15 text-${cat.color}-300 border border-${cat.color}-500/40`
                      : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-raised'
                  }`}
                  title={`${cat.label} (${count}건)`}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                  <span className="text-[10px] opacity-70">{count}</span>
                </button>
              );
            })}
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
                ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400'
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
          <span className="text-xs text-content-muted">
            <Database className="inline h-3 w-3 mr-1" />
            DB 시험지 {dbExams.length}건
          </span>
        </div>
      </div>

      {/* ★ Sub-필터 줄 — 진단평가 탭: BS/DD/PT/SC + 회차, 모의고사 탭: 연도 */}
      {(sourceCategory === 'diagnostic' || sourceCategory === 'mock') && (
        <div className="flex flex-shrink-0 items-center gap-3 px-6 py-2 border-b border-subtle/30 bg-surface-base/60">
          {sourceCategory === 'diagnostic' && (
            <>
              <span className="text-xs text-content-tertiary font-medium">세션</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setDiagSession('all'); setDiagRound('all'); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    diagSession === 'all'
                      ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
                      : 'text-content-tertiary hover:bg-surface-raised hover:text-content-secondary border border-transparent'
                  }`}
                >
                  전체 <span className="text-[10px] opacity-60">{categoryFilteredExams.length}</span>
                </button>
                {diagSessionOptions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setDiagSession(s.id as any); setDiagRound('all'); }}
                    disabled={s.count === 0}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      diagSession === s.id
                        ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
                        : 'text-content-tertiary hover:bg-surface-raised hover:text-content-secondary border border-transparent'
                    }`}
                    title={`${s.label} (${s.count}건)`}
                  >
                    <span>{s.emoji}</span>
                    <span>{s.label}</span>
                    <span className="text-[10px] opacity-60">{s.count}</span>
                  </button>
                ))}
              </div>
              {diagRoundOptions.length > 0 && (
                <>
                  <div className="h-4 w-px bg-subtle/50" />
                  <span className="text-xs text-content-tertiary font-medium">회차</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDiagRound('all')}
                      className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                        diagRound === 'all'
                          ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
                          : 'text-content-tertiary hover:bg-surface-raised hover:text-content-secondary border border-transparent'
                      }`}
                    >
                      전체
                    </button>
                    {diagRoundOptions.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setDiagRound(r.id)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                          diagRound === r.id
                            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
                            : 'text-content-tertiary hover:bg-surface-raised hover:text-content-secondary border border-transparent'
                        }`}
                      >
                        <span>{r.label}</span>
                        <span className="text-[10px] opacity-60">{r.count}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {sourceCategory === 'mock' && (
            <>
              <span className="text-xs text-content-tertiary font-medium">연도</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMockYear('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    mockYear === 'all'
                      ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40'
                      : 'text-content-tertiary hover:bg-surface-raised hover:text-content-secondary border border-transparent'
                  }`}
                >
                  전체 <span className="text-[10px] opacity-60">{categoryFilteredExams.length}</span>
                </button>
                {mockYearOptions.map((y) => (
                  <button
                    key={y.id}
                    type="button"
                    onClick={() => setMockYear(y.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      mockYear === y.id
                        ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40'
                        : 'text-content-tertiary hover:bg-surface-raised hover:text-content-secondary border border-transparent'
                    }`}
                  >
                    <span>📅</span>
                    <span>{y.label}</span>
                    <span className="text-[10px] opacity-60">{y.count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Loading State — ★ 레이아웃 모양 스켈레톤(스피너 대체). 진입 시 빈 화면 깜빡임 제거. */}
      {isLoading && (
        <div className="flex flex-1 gap-2 overflow-hidden px-2 pb-2">
          {/* 좌측 트리 스켈레톤 */}
          <div
            className="hidden min-w-0 flex-col rounded-2xl border border-white/[.08] bg-surface-card/40 p-4 sm:flex"
            style={{ width: `${leftWidth}%` }}
          >
            <div className="mb-4 h-9 w-full rounded-lg bg-surface-raised/60 animate-pulse" />
            {[70, 55, 48, 62, 50, 58, 45].map((w, i) => (
              <div key={i} className="mb-2.5 flex items-center gap-2" style={{ paddingLeft: i % 3 === 1 ? 16 : 0 }}>
                <div className="h-4 w-4 flex-shrink-0 rounded bg-surface-raised/60 animate-pulse" />
                <div className="h-4 rounded bg-surface-raised/60 animate-pulse" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
          {/* 우측 목록 스켈레톤 */}
          <div className="flex flex-1 flex-col rounded-2xl border border-white/[.08] bg-surface-card/40 pl-0">
            <div className="flex items-center justify-between border-b border-subtle px-5 py-3.5">
              <div className="h-6 w-40 rounded bg-surface-raised/60 animate-pulse" />
              <div className="flex gap-2">
                <div className="h-8 w-36 rounded-lg bg-surface-raised/60 animate-pulse" />
                <div className="h-8 w-16 rounded-lg bg-surface-raised/60 animate-pulse" />
              </div>
            </div>
            <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-hidden p-4 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col rounded-xl border border-white/[.08] bg-surface-card/40 p-2">
                  <div className="h-20 rounded-lg bg-surface-raised/60 animate-pulse" />
                  <div className="mt-2.5 h-4 w-3/4 rounded bg-surface-raised/60 animate-pulse" />
                  <div className="mt-1.5 h-3 w-1/2 rounded bg-surface-raised/50 animate-pulse" />
                  <div className="mt-2.5 h-1.5 w-full rounded-full bg-surface-raised/50 animate-pulse" />
                  <div className="mt-2.5 h-5 w-2/5 rounded-full bg-surface-raised/50 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {!isLoading && loadError && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 text-sm mb-2">데이터 로딩 실패: {loadError}</p>
            <button
              onClick={() => fetchData()}
              className="text-xs text-indigo-400 hover:underline"
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
                  <ClipboardList className="h-4 w-4 text-indigo-400" />
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
                          className={`px-2 py-0.5 rounded text-[10px] transition-colors ${!sourceFilter ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-surface-raised/60 text-content-muted hover:text-content-primary'}`}
                        >전체</button>
                        {subjects.map(s => (
                          <button
                            key={s}
                            onClick={() => setSourceFilter(s)}
                            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${sourceFilter === s ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-surface-raised/60 text-content-muted hover:text-content-primary'}`}
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
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs group cursor-pointer transition-colors ${
                          dupeCount > 1
                            ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50'
                            : 'bg-surface-raised/60 border-subtle/50 hover:border-indigo-500/30'
                        }`}
                        onClick={() => {
                          setShowSourceList(false);
                          goExam(exam.id);
                        }}
                        onMouseEnter={() => prefetchExam(exam.id)}
                        title={`${exam.title}\n과목: ${exam.subject || '미지정'}\n유형: ${exam.examType || '미지정'}\n학년: ${exam.grade || '미지정'}\n생성: ${exam.createdAt ? new Date(exam.createdAt).toLocaleDateString('ko-KR') : '?'}`}
                      >
                        <FileText className={`h-3 w-3 flex-shrink-0 ${dupeCount > 1 ? 'text-amber-400' : 'text-content-muted'}`} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`truncate ${dupeCount > 1 ? 'text-amber-300' : 'text-content-secondary group-hover:text-indigo-400'}`}>
                            {exam.title || exam.fileName}
                          </span>
                          <span className="text-[10px] text-content-muted truncate">
                            {exam.subject || ''} {exam.grade || ''} {exam.examType || ''}
                          </span>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className="text-[10px] text-content-muted">{exam.problemCount}문제</span>
                          {dupeCount > 1 && (
                            <span className="text-[10px] text-amber-400 font-bold">중복{dupeCount}</span>
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
              className="w-full max-w-2xl mx-4 max-h-[90vh] bg-surface-card border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
                <div>
                  <h2 className="text-lg font-bold text-content-primary">자료 업로드</h2>
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
              <div className="p-6 overflow-y-auto flex-1">
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
                      goExam(appendToExamId);
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
                              : 'border focus:border-indigo-500'
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
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-900/30 border border-indigo-900/50">
                  <KeyRound className="h-4 w-4 text-indigo-400" />
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
                        className="w-full rounded-lg border pl-9 pr-4 py-2.5 text-sm bg-surface-raised text-content-primary placeholder-content-muted outline-none focus:border-indigo-500 transition-colors"
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
                  className="flex items-center gap-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:bg-surface-raised disabled:text-content-tertiary px-4 py-2 text-sm font-bold text-white transition-colors"
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
          {/* ======== Left Panel: Tree (모든 카테고리에서 북그룹 폴더 트리 공통) ======== */}
          <div
            className="flex flex-col gap-3 overflow-hidden pr-2"
            style={{ width: `${leftWidth}%`, flexShrink: 0 }}
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between rounded-2xl border border-white/[.08] bg-surface-card/40 px-4 py-2.5 flex-shrink-0">
              <span className="rounded-full border bg-surface-raised px-3 py-1 text-xs font-semibold text-content-secondary">
                {sourceCategory === 'all'
                  ? `북그룹 ${totalGroups}개`
                  : `${SOURCE_CATEGORIES.find((c) => c.id === sourceCategory)?.emoji ?? ''} ${SOURCE_CATEGORIES.find((c) => c.id === sourceCategory)?.label ?? ''} · ${subFilteredExams.length}건`}
              </span>
              {sourceCategory === 'all' && (
                <button
                  type="button"
                  onClick={handleAddRootGroup}
                  className="flex items-center gap-2 rounded-full border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-content-secondary transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-content-muted bg-surface-card text-content-secondary">
                    <Plus className="h-3 w-3" />
                  </span>
                  <span>최상위 북그룹 추가</span>
                </button>
              )}
            </div>

            {/* Tree Panel — sub-필터·카테고리 적용된 examCount 기준 빈 폴더 자동 숨김 */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/[.08] bg-surface-card/40">
              <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 p-2">
                {displayedTreeNodes.length > 0 ? (
                  <div className="space-y-0.5">
                    {displayedTreeNodes.map((node) => (
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
                    <Smile className="h-12 w-12 text-indigo-500/50" />
                    <p className="text-sm text-content-tertiary">
                      {sourceCategory === 'all' ? '업로드된 시험지가 없습니다.' : '이 분류에 해당하는 자료가 없습니다.'}
                    </p>
                    <p className="text-xs text-content-muted">
                      {sourceCategory === 'all'
                        ? '문제를 업로드하면 자동으로 표시됩니다.'
                        : '다른 출처 탭을 선택해보세요.'}
                    </p>
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
            <div className="flex h-full flex-col rounded-2xl border border-white/[.08] bg-surface-card/40">
              {selectedId ? (
                <>
                  {/* Content Header */}
                  <div className="flex items-center justify-between border-b border-subtle px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
                        <FileText className="h-4 w-4 text-indigo-400" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-content-primary truncate">{selectedName}</h2>
                        <p className="text-xs text-content-tertiary">
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
                          className="h-8 w-48 rounded-lg border border-white/10 bg-zinc-900/80 pl-8 pr-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      {/* 뷰 토글 (그리드/리스트) */}
                      <div className="flex items-center rounded-lg border border-white/10 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => changeViewMode('grid')}
                          className={`flex h-8 w-8 items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-indigo-500/15 text-indigo-400' : 'text-content-tertiary hover:bg-surface-raised hover:text-content-primary'}`}
                          title="카드 보기"
                          aria-label="카드 보기"
                          aria-pressed={viewMode === 'grid'}
                        >
                          <LayoutGrid className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => changeViewMode('list')}
                          className={`flex h-8 w-8 items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-indigo-500/15 text-indigo-400' : 'text-content-tertiary hover:bg-surface-raised hover:text-content-primary'}`}
                          title="목록 보기"
                          aria-label="목록 보기"
                          aria-pressed={viewMode === 'list'}
                        >
                          <List className="h-3.5 w-3.5" />
                        </button>
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

                  {/* Table / Grid */}
                  <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                    {/* ★ 조건 바 — 폴더 범위 안에서 연도·학년·학기·구분으로 좁힌다.
                        조건을 걸 축이 없으면(교재 폴더 등) 스스로 숨는다. */}
                    <div className="px-5 pt-3">
                      <ExamFacetBar
                        parsedList={parsedExamTitles}
                        value={facets}
                        onChange={setFacets}
                        resultCount={filteredExams.length}
                        isAllScope={selectedId === 'all'}
                        onExpandScope={() => {
                          // selectedName 은 별도 상태 — 같이 안 바꾸면 헤더가 옛 폴더명으로 남는다.
                          setSelectedId('all');
                          setSelectedName('전체 시험지');
                        }}
                      />
                    </div>
                    {filteredExams.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <Search className="h-8 w-8 text-zinc-700" />
                        <p className="text-sm text-zinc-500">
                          {hasAnyFacet(facets)
                            ? '조건에 맞는 시험지가 없습니다'
                            : searchQuery
                              ? '검색 결과가 없습니다'
                              : '이 그룹에 시험지가 없습니다'}
                        </p>
                        {hasAnyFacet(facets) && (
                          <button
                            type="button"
                            onClick={() => setFacets(EMPTY_FACET_SELECTION)}
                            className="rounded-full border border-white/10 px-3 py-1 text-xs text-content-tertiary hover:border-indigo-500/40 hover:text-indigo-200 transition-colors"
                          >
                            조건 초기화
                          </button>
                        )}
                      </div>
                    ) : viewMode === 'list' ? (
                    <>
                    {/* Table Header */}
                    <div className="sticky top-0 z-10 flex items-center border-b border-subtle bg-surface-raised/60 backdrop-blur px-5 py-2 text-xs font-medium uppercase tracking-wide text-content-tertiary">
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
                      <span className="w-28 text-center">출처</span>
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
                          onClick={() => goExam(exam.id)}
                          onMouseEnter={() => prefetchExam(exam.id)}
                        >
                          <span className="w-14 text-center">
                            <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md bg-surface-raised px-1.5 text-xs font-bold text-content-secondary">
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
                                className="flex-1 bg-surface-raised border border-indigo-500/50 rounded px-2 py-1 text-sm text-content-primary outline-none"
                              />
                            ) : (
                              <span className="truncate text-sm text-content-secondary font-medium">
                                {exam.fileName}
                              </span>
                            )}
                            {exam.hasImage && renamingExamId !== exam.id && (
                              <span className="flex items-center gap-1 rounded-md border border-indigo-500/20 bg-indigo-500/5 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400 flex-shrink-0">
                                <ImageIcon className="h-3 w-3" />
                                이미지 포함
                              </span>
                            )}
                            {/* ★ 소속 폴더 배지 — 폴더 섞인 뷰에서 직속/하위 구분. 선택 폴더 직속이면 강조. */}
                            {showFolderBadge && renamingExamId !== exam.id && (() => {
                              const isDirect = (exam.bookGroupId ?? null) === (selectedId !== 'all' && selectedId !== 'unclassified' ? selectedId : null);
                              const folderName = exam.bookGroupId ? (groupNameById.get(exam.bookGroupId) ?? '폴더') : '미분류';
                              return (
                                <span
                                  title={isDirect ? '이 폴더 직속' : `하위 폴더: ${folderName}`}
                                  className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0 ${
                                    isDirect
                                      ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                                      : 'border-white/10 bg-surface-raised text-content-tertiary'
                                  }`}
                                >
                                  <Folder className="h-3 w-3" />
                                  {folderName}
                                  {isDirect && ' · 직속'}
                                </span>
                              );
                            })()}
                          </div>
                          {/* 출처 카테고리 뱃지 */}
                          <span className="w-28 flex justify-center">
                            <SourceCategoryBadge
                              examId={exam.id}
                              isDiagnostic={exam.isDiagnostic}
                              examType={exam.examType}
                              onReclassify={handleReclassify}
                            />
                          </span>
                          <span className="w-24 flex justify-center">
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
                                  goExam(exam.id);
                                }}
                                onMouseEnter={() => prefetchExam(exam.id)}
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
                              onView={() => goExam(exam.id)}
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
                    </div>
                    </>
                    ) : (
                      // ======== 그리드 카드 뷰 (프리미엄 다크) ========
                      <div className="grid grid-cols-2 gap-3 p-4 xl:grid-cols-3">
                        {filteredExams.map((exam) => (
                          <div
                            key={exam.id}
                            onClick={() => goExam(exam.id)}
                            onMouseEnter={() => prefetchExam(exam.id)}
                            className="group flex flex-col rounded-xl border border-subtle bg-surface-card transition-colors hover:border-indigo-500/30 hover:bg-surface-raised/30 cursor-pointer"
                          >
                            {/* ★ 액자형 썸네일 — 1번 문제 본문을 실제로 작게 그린다 (2026-07-23).
                                예전엔 회색 문서 모티브 플레이스홀더였다. 카드 높이의 40%,
                                가장 눈이 먼저 가는 자리인데 아무 정보가 없어 화면이 허전하면서
                                복잡해 보였다. 이제 무슨 시험지인지 내용으로 구분된다.
                                previewText 가 없으면(구 데이터·조회 실패) 기존 모티브로 폴백. */}
                            <div className="relative m-2 mb-0 flex h-20 overflow-hidden rounded-lg border border-subtle bg-black/20">
                              {exam.previewText ? (
                                // ★ 미리보기는 "읽는 글"이 아니라 "무늬"다 (2026-07-23 사용자 피드백).
                                //   처음엔 본문색으로 그렸더니 아래 제목·학교와 시선을 다퉈
                                //   정작 중요한 정보의 가독성이 떨어졌다. 대비를 낮추고 아래쪽을
                                //   페이드시켜 종이가 이어지는 느낌으로 뒤에 물린다.
                                <p
                                  className="w-full px-2.5 pb-2 pt-6 text-[9px] leading-[1.5] text-content-muted/60 line-clamp-4 break-words select-none"
                                  style={{
                                    maskImage: 'linear-gradient(to bottom, #000 62%, transparent)',
                                    WebkitMaskImage: 'linear-gradient(to bottom, #000 62%, transparent)',
                                  }}
                                  aria-hidden
                                >
                                  {exam.previewText}
                                </p>
                              ) : (
                                <div className="m-auto flex w-14 flex-col gap-1 rounded-sm bg-white/[0.04] p-2">
                                  <div className="h-1 w-3/5 rounded-full bg-white/20"></div>
                                  <div className="h-0.5 w-full rounded-full bg-white/10"></div>
                                  <div className="h-0.5 w-4/5 rounded-full bg-white/10"></div>
                                  <div className="h-0.5 w-11/12 rounded-full bg-white/10"></div>
                                </div>
                              )}
                              <span className="absolute left-2 top-2 inline-flex h-5 min-w-[24px] items-center justify-center rounded-md bg-black/50 px-1.5 text-[10px] font-bold text-content-secondary">
                                #{exam.order}
                              </span>
                              {exam.hasImage && (
                                <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">
                                  <ImageIcon className="h-3 w-3" />
                                  이미지
                                </span>
                              )}
                            </div>
                            {/* 본문 */}
                            <div className="flex flex-1 flex-col gap-1.5 p-3">
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
                                  className="w-full rounded border border-indigo-500/50 bg-surface-raised px-2 py-1 text-sm text-content-primary outline-none"
                                />
                              ) : (
                                // ★ 카드에서 가장 중요한 정보 = "어느 시험지인가". 미리보기를 뒤로
                                //   물린 만큼 제목·학교는 앞으로 끌어올린다(semibold + 넉넉한 줄간격).
                                <span className="truncate text-sm font-semibold leading-snug text-content-primary">{exam.fileName}</span>
                              )}
                              <span className="truncate text-xs font-medium text-content-secondary">
                                {[exam.grade, exam.subject, exam.year].filter(Boolean).join(' · ') || '—'}
                              </span>
                              {showFolderBadge && (() => {
                                const isDirect = (exam.bookGroupId ?? null) === (selectedId !== 'all' && selectedId !== 'unclassified' ? selectedId : null);
                                const folderName = exam.bookGroupId ? (groupNameById.get(exam.bookGroupId) ?? '폴더') : '미분류';
                                return (
                                  <span className={`flex w-fit items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${isDirect ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300' : 'border-white/10 bg-surface-raised text-content-tertiary'}`}>
                                    <Folder className="h-3 w-3" />
                                    {folderName}
                                    {isDirect && ' · 직속'}
                                  </span>
                                );
                              })()}
                              {/* ★ 난이도 분포 — 바(하=초록/중=앰버/상=레드) + 호버 시 우리 프리미엄 분포 팝업 */}
                              {exam.difficulty && exam.difficulty.total > 0 && (() => {
                                const d = exam.difficulty;
                                const bands = [
                                  { label: '하', count: d.low, bar: 'bg-emerald-500', fg: 'text-emerald-400' },
                                  { label: '중', count: d.mid, bar: 'bg-amber-500', fg: 'text-amber-400' },
                                  { label: '상', count: d.high, bar: 'bg-red-500', fg: 'text-red-400' },
                                ];
                                const max = Math.max(d.low, d.mid, d.high, 1);
                                const dom = bands.reduce((a, b) => (b.count > a.count ? b : a), bands[0]);
                                return (
                                  <div className="group/diff relative mt-0.5">
                                    <div className="flex h-1.5 cursor-help overflow-hidden rounded-full bg-surface-raised">
                                      {d.low > 0 && <span style={{ flexGrow: d.low }} className="bg-emerald-500" />}
                                      {d.mid > 0 && <span style={{ flexGrow: d.mid }} className="bg-amber-500" />}
                                      {d.high > 0 && <span style={{ flexGrow: d.high }} className="bg-red-500" />}
                                    </div>
                                    {/* 호버 팝업 (우리 다크 글라스) */}
                                    <div className="pointer-events-none invisible absolute left-0 top-full z-30 mt-1.5 w-44 translate-y-1 rounded-xl border border-white/10 bg-surface-card/95 p-3 opacity-0 shadow-2xl backdrop-blur-md transition-all duration-150 group-hover/diff:visible group-hover/diff:translate-y-0 group-hover/diff:opacity-100">
                                      <div className="mb-2 flex items-center justify-between">
                                        <span className="text-xs font-semibold text-content-primary">난이도 분포</span>
                                        <span className="text-[10px] text-content-tertiary">{d.total}문항</span>
                                      </div>
                                      <div className="space-y-1.5">
                                        {bands.map((b) => (
                                          <div key={b.label} className="flex items-center gap-2">
                                            <span className={`w-3 text-[10px] font-bold ${b.fg}`}>{b.label}</span>
                                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                                              <div className={`h-full rounded-full ${b.bar}`} style={{ width: `${(b.count / max) * 100}%` }} />
                                            </div>
                                            <span className="w-4 text-right text-[10px] tabular-nums text-content-secondary">{b.count}</span>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="mt-2 border-t border-white/10 pt-1.5 text-[10px] text-content-tertiary">
                                        중심 난이도 · <span className={`font-semibold ${dom.fg}`}>{dom.label}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              {/* 푸터: 문항수/작업하기 + 출처 + 액션 */}
                              <div className="mt-auto flex items-center justify-between pt-1.5">
                                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  {exam.problemCount > 0 ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-2 py-0.5 text-xs font-medium text-indigo-400">
                                      <Sparkles className="h-3 w-3" />
                                      {exam.problemCount}문항
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); goExam(exam.id); }}
                                      className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
                                    >
                                      <Sparkles className="h-3 w-3" />
                                      작업하기
                                    </button>
                                  )}
                                  <SourceCategoryBadge
                                    examId={exam.id}
                                    isDiagnostic={exam.isDiagnostic}
                                    examType={exam.examType}
                                    onReclassify={handleReclassify}
                                  />
                                </div>
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteExam(exam.id, exam.fileName); }}
                                    className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 hover:bg-red-900/20 hover:text-red-400 transition-colors"
                                    title="시험지 삭제"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                  <FileContextMenu
                                    onRename={() => handleStartRenameExam(exam.id, exam.fileName)}
                                    onView={() => goExam(exam.id)}
                                    onMove={() => setMovingExam({ id: exam.id, bookGroupId: exam.bookGroupId })}
                                    onDownload={() => {
                                      alert('원본 파일 다운로드 기능은 Storage 연동 후 사용 가능합니다.');
                                    }}
                                    onDelete={() => handleDeleteExam(exam.id, exam.fileName)}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Empty State */
                <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800">
                    <Smile className="h-10 w-10 text-indigo-500/50" />
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
