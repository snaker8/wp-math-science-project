'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Plus,
  PanelLeftClose,
  Folder,
  FolderOpen,
  ArrowLeft,
  FileText,
  GraduationCap,
  Send,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface FolderItem {
  id: string;
  name: string;
  subfolderCount: number;
  children?: FolderItem[];
}

interface FolderGroup {
  id: string;
  name: string;
  folders: FolderItem[];
}

interface MaterialListItem {
  id: string;
  name: string;
  paperCount: number;
  createdAt: string;
  type: 'provider' | 'academy';
  // ★ 진단지 메타 (자산화된 exam 의 diagnostic_* 컬럼 매핑)
  diagnosticCategory?: 'BS' | 'DD' | 'PT' | 'SC' | null;
  diagnosticRound?: string | null;
  diagnosticDifficulty?: string | null;
  grade?: string | null;
  subject?: string | null;
}

// ★ 단원·주제별 트리 노드 — /api/exams/[examId]/breakdown 응답
interface BreakdownNode {
  code: string;
  level: 1 | 2 | 3 | 4;
  name: string;
  problemCount: number;
  problemIds: string[];
  difficultyDist: Record<string, number>;
  children: BreakdownNode[];
}

interface ExamListItem {
  id: string;
  subject: string; // 고등, 중등
  subjectDetail: string; // 공통수학1, 중2
  scope: string; // 1.1 다항식의 연산 ~ 1.1.1 다항식의 연산
  name: string;
  totalProblems: number;
  subjectiveCount: number; // 주관식
  objectiveCount: number; // 객관식
  difficultyBars: { color: string; percent: number }[];
}

type GradeOption = { value: string; label: string };
type TabType = 'provider' | 'academy';

// ============================================================================
// Mock Data
// ============================================================================

const gradeOptions: GradeOption[] = [
  { value: '', label: '학년 선택' },
  { value: 'high1', label: '고 1학년' },
  { value: 'high2', label: '고 2학년' },
  { value: 'high3', label: '고 3학년' },
  { value: 'mid1', label: '중 1학년' },
  { value: 'mid2', label: '중 2학년' },
  { value: 'mid3', label: '중 3학년' },
];

const mockProviderFolderGroups: FolderGroup[] = [
  {
    id: 'g1',
    name: '고 1학년',
    folders: [
      {
        id: 'f1', name: '레벨테스트', subfolderCount: 0,
        children: [],
      },
      {
        id: 'f2', name: '진단평가', subfolderCount: 2,
        children: [
          { id: 'f2-1', name: '중단원 진단평가', subfolderCount: 0 },
          { id: 'f2-2', name: '대단원 진단평가', subfolderCount: 0 },
        ],
      },
      {
        id: 'f3', name: '교과서TWINS(공수1)', subfolderCount: 7,
        children: [
          { id: 'f3-1', name: '천재(전)', subfolderCount: 0 },
          { id: 'f3-2', name: '천재(홍)', subfolderCount: 0 },
          { id: 'f3-3', name: '지학사', subfolderCount: 0 },
          { id: 'f3-4', name: '미래엔', subfolderCount: 0 },
          { id: 'f3-5', name: '동아', subfolderCount: 0 },
          { id: 'f3-6', name: '비상', subfolderCount: 0 },
          { id: 'f3-7', name: 'YBM', subfolderCount: 0 },
        ],
      },
      {
        id: 'f4', name: '교과서TWINS(공수2)', subfolderCount: 7,
        children: [
          { id: 'f4-1', name: '천재(전)', subfolderCount: 0 },
          { id: 'f4-2', name: '천재(홍)', subfolderCount: 0 },
          { id: 'f4-3', name: '지학사', subfolderCount: 0 },
          { id: 'f4-4', name: '미래엔', subfolderCount: 0 },
          { id: 'f4-5', name: '동아', subfolderCount: 0 },
          { id: 'f4-6', name: '비상', subfolderCount: 0 },
          { id: 'f4-7', name: 'YBM', subfolderCount: 0 },
        ],
      },
      {
        id: 'f5', name: '교사용TWINS(공수1)', subfolderCount: 1,
        children: [{ id: 'f5-1', name: '내신고쟁이', subfolderCount: 0 }],
      },
      {
        id: 'f6', name: '교사용TWINS(공수2)', subfolderCount: 1,
        children: [{ id: 'f6-1', name: '내신고쟁이', subfolderCount: 0 }],
      },
      {
        id: 'f7', name: '출판교재 평가자료(공수1)', subfolderCount: 1,
        children: [{ id: 'f7-1', name: '내신고쟁이', subfolderCount: 0 }],
      },
    ],
  },
  {
    id: 'g2',
    name: '중 2학년',
    folders: [
      {
        id: 'mf1', name: '레벨테스트', subfolderCount: 2,
        children: [
          { id: 'mf1-1', name: '기본', subfolderCount: 0 },
          { id: 'mf1-2', name: '심화', subfolderCount: 0 },
        ],
      },
      {
        id: 'mf2', name: '진단평가', subfolderCount: 2,
        children: [
          { id: 'mf2-1', name: '중단원 진단평가', subfolderCount: 0 },
          { id: 'mf2-2', name: '대단원 진단평가', subfolderCount: 0 },
        ],
      },
      {
        id: 'mf3', name: '교과서TWINS', subfolderCount: 10,
        children: [
          { id: 'mf3-1', name: '천재(전)', subfolderCount: 0 },
          { id: 'mf3-2', name: '천재(홍)', subfolderCount: 0 },
          { id: 'mf3-3', name: '지학사', subfolderCount: 0 },
        ],
      },
      {
        id: 'mf4', name: '2022개정교과서', subfolderCount: 3,
        children: [
          { id: 'mf4-1', name: '천재', subfolderCount: 0 },
          { id: 'mf4-2', name: '비상', subfolderCount: 0 },
          { id: 'mf4-3', name: '미래엔', subfolderCount: 0 },
        ],
      },
      {
        id: 'mf5', name: '교사용TWINS', subfolderCount: 2,
        children: [
          { id: 'mf5-1', name: '기본', subfolderCount: 0 },
          { id: 'mf5-2', name: '심화', subfolderCount: 0 },
        ],
      },
      {
        id: 'mf6', name: '시험대비', subfolderCount: 1,
        children: [{ id: 'mf6-1', name: '중간/기말', subfolderCount: 0 }],
      },
    ],
  },
];

function generateMockExams(folderName: string, subFolder?: string): ExamListItem[] {
  const isHigh = true;
  const prefix = subFolder || folderName;
  const baseExams: ExamListItem[] = [];

  // Generate realistic exam items
  const sections = [
    { scope: '1.1 다항식의 연산 ~ 1.1.1 다항식의 연산', steps: 3 },
    { scope: '1.1 다항식의 연산 ~ 1.2.2 나머지정리와 인수분해', steps: 3 },
    { scope: '1.3 인수분해 ~ 1.3.1 인수분해', steps: 1 },
    { scope: '2.1 단항식의 계산 ~ 2.1.2 단항식의 곱셈과 나눗셈', steps: 1 },
    { scope: '2.2 다항식 계산 ~ 2.2.3 등식의 변형', steps: 1 },
  ];

  let id = 1;
  for (const section of sections) {
    for (let step = 1; step <= section.steps; step++) {
      const total = 7 + Math.floor(Math.random() * 14); // 7~20
      const subj = Math.floor(Math.random() * total);
      const obj = total - subj;

      // Create random difficulty bar distribution
      const bars: { color: string; percent: number }[] = [];
      let remaining = 100;
      const colors = ['#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899'];
      for (let i = 0; i < colors.length - 1; i++) {
        const val = i < colors.length - 2 ? Math.floor(Math.random() * remaining * 0.6) : Math.floor(remaining * 0.7);
        bars.push({ color: colors[i], percent: Math.min(val, remaining) });
        remaining -= val;
        if (remaining <= 0) break;
      }
      if (remaining > 0) {
        bars.push({ color: colors[colors.length - 1], percent: remaining });
      }

      const examName = section.steps > 1
        ? `${prefix}_${section.scope.split(' ')[0]}${section.scope.split(' ').pop()}_step${step}`
        : `${prefix}_${section.scope.split(' ')[0]}${section.scope.split(' ').pop()}`;

      baseExams.push({
        id: `exam-${id++}`,
        subject: isHigh ? '고등' : '중등',
        subjectDetail: isHigh ? '공통수학1' : '중2',
        scope: section.scope,
        name: examName,
        totalProblems: total,
        subjectiveCount: subj,
        objectiveCount: obj,
        difficultyBars: bars,
      });
    }
  }

  return baseExams;
}

// ★ 학원자료(진단평가지) 는 이제 DB 에서 fetch — exams.is_diagnostic=true 인 것만.
//   자산화 시 제목 패턴(BS_M1_R1 등) 자동 인식되어 태깅되거나, 시험관리에서 수동 마킹.
//   mockAcademyMaterials 제거됨.

// ★ 트리 노드의 problemIds — API 가 자손 누적 push 하므로 그대로 반환
function collectProblemIds(node: BreakdownNode): string[] {
  return node.problemIds;
}

// ============================================================================
// Sub Components
// ============================================================================

function SubjectBadge({ subject, detail }: { subject: string; detail: string }) {
  const isHigh = subject === '고등';
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0 w-16">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
        isHigh
          ? 'border border-white/[.08] bg-white/[.04] text-content-secondary'
          : 'border border-white/[.08] bg-white/[.04] text-content-secondary'
      }`}>
        {subject}
      </span>
      <span className="text-[10px] text-content-tertiary font-medium">{detail}</span>
    </div>
  );
}

function DifficultyBar({ bars }: { bars: { color: string; percent: number }[] }) {
  return (
    <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-raised">
      {bars.map((bar, i) => (
        <div
          key={i}
          style={{ width: `${bar.percent}%`, backgroundColor: bar.color }}
          className="flex items-center justify-center h-full text-[8px] font-bold text-content-primary/80 leading-none"
        >
          {bar.percent >= 15 ? `${bar.percent}%` : ''}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// 단원·주제별 트리 패널 — 학원자료(자산화된 exam) 선택 시 우측 표시
// ============================================================================
function BreakdownPanel({
  material,
  tree,
  loading,
  expandedNodes,
  toggleNode,
  onPublish,
}: {
  material: MaterialListItem;
  tree: { totalProblems: number; classifiedCount: number; groups: BreakdownNode[] } | null;
  loading: boolean;
  expandedNodes: Set<string>;
  toggleNode: (code: string) => void;
  onPublish: (node: BreakdownNode | null) => void;
}) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-content-tertiary">
        단원·주제별 분석 불러오는 중...
      </div>
    );
  }
  if (!tree) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState message="단원 분석 데이터를 불러올 수 없습니다." />
      </div>
    );
  }
  if (tree.totalProblems === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState message="이 자료에는 문제가 없습니다." />
      </div>
    );
  }

  const unclassified = tree.totalProblems - tree.classifiedCount;

  return (
    <div className="px-4 py-3 space-y-2">
      {/* 헤더: 자료명 + 전체 출제 */}
      <div className="flex items-center justify-between rounded-lg bg-white/[.04] border border-white/[.08] px-3 py-2 mb-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-content-primary truncate">{material.name}</div>
          <div className="text-[11px] text-content-tertiary">
            전체 {tree.totalProblems}문제
            {unclassified > 0 && <span className="text-amber-400"> · 미분류 {unclassified}</span>}
            {tree.classifiedCount > 0 && <span> · 분류 {tree.classifiedCount}</span>}
          </div>
        </div>
        <button
          onClick={() => onPublish(null)}
          className="shrink-0 whitespace-nowrap rounded-full border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-xs font-bold text-content-secondary hover:bg-white/[.06] hover:text-content-primary transition-all"
        >
          + 전체 출제
        </button>
      </div>

      {/* 트리 */}
      {tree.groups.length === 0 ? (
        <div className="text-center text-xs text-content-tertiary py-6">
          분류된 문제가 없습니다. 자산화 시 mathsecr 분류가 안 되었거나, 시험관리에서 수동 분류가 필요합니다.
        </div>
      ) : (
        tree.groups.map((node) => (
          <BreakdownNodeRow
            key={node.code}
            node={node}
            depth={0}
            expandedNodes={expandedNodes}
            toggleNode={toggleNode}
            onPublish={onPublish}
          />
        ))
      )}
    </div>
  );
}

// 트리 행 (재귀)
function BreakdownNodeRow({
  node,
  depth,
  expandedNodes,
  toggleNode,
  onPublish,
}: {
  node: BreakdownNode;
  depth: number;
  expandedNodes: Set<string>;
  toggleNode: (code: string) => void;
  onPublish: (node: BreakdownNode | null) => void;
}) {
  const expanded = expandedNodes.has(node.code);
  const hasChildren = node.children.length > 0;
  const indent = depth * 16;

  // 난이도 분포 정렬: 1,2,3,4,5,unknown 순
  const diffOrder = ['1', '2', '3', '4', '5', 'unknown'];
  const diffEntries = diffOrder
    .map((k) => [k, node.difficultyDist[k] || 0] as const)
    .filter(([, v]) => v > 0);

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md hover:bg-surface-card/40 transition-colors px-2 py-1.5"
        style={{ paddingLeft: 8 + indent }}
      >
        {/* 펼침 토글 */}
        <button
          onClick={() => hasChildren && toggleNode(node.code)}
          disabled={!hasChildren}
          className="shrink-0 w-4 h-4 flex items-center justify-center text-content-tertiary disabled:opacity-30"
        >
          {hasChildren ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="text-[8px]">•</span>}
        </button>

        {/* 레벨 배지 */}
        <span
          className={`shrink-0 inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[9px] font-bold border ${
            node.level === 1
              ? 'bg-white/[.08] text-content-primary border-white/[.14]'
              : node.level === 2
              ? 'bg-white/[.06] text-content-secondary border-white/[.10]'
              : node.level === 3
              ? 'bg-white/[.04] text-content-secondary border-white/[.08]'
              : 'bg-white/[.04] text-content-tertiary border-white/[.08]'
          }`}
        >
          {node.level === 1 ? '대' : node.level === 2 ? '중' : node.level === 3 ? '소' : '유형'}
        </span>

        {/* 이름 */}
        <span className="flex-1 min-w-0 text-sm text-content-primary truncate" title={node.code}>
          {node.name}
        </span>

        {/* 난이도 분포 (간단 텍스트) */}
        <div className="shrink-0 flex items-center gap-1 text-[10px] text-content-tertiary">
          {diffEntries.map(([k, v]) => (
            <span key={k} className="rounded bg-surface-card/60 px-1.5 py-0.5">
              {k === 'unknown' ? '?' : `★${k}`}×{v}
            </span>
          ))}
        </div>

        {/* 문제 수 */}
        <span className="shrink-0 w-12 text-right text-xs font-semibold text-content-primary">
          {node.problemCount}문제
        </span>

        {/* 출제 버튼 */}
        <button
          onClick={() => onPublish(node)}
          className="shrink-0 whitespace-nowrap rounded-md border border-white/[.08] bg-white/[.04] px-2.5 py-1 text-[10px] font-bold text-content-secondary hover:bg-white/[.06] hover:text-content-primary"
        >
          + 출제
        </button>
      </div>

      {/* 하위 노드 */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <BreakdownNodeRow
              key={child.code}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
              onPublish={onPublish}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl bg-surface-card/50 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised text-content-tertiary">
        {icon || <AlertCircle className="h-6 w-6" />}
      </span>
      <p className="text-sm font-semibold text-content-secondary">{message}</p>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MaterialsPage() {
  // State
  const [grade, setGrade] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('provider');
  const [currentPage, setCurrentPage] = useState(1);

  // Folder navigation state
  const [selectedGroup, setSelectedGroup] = useState<FolderGroup | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null);
  const [selectedSubFolder, setSelectedSubFolder] = useState<FolderItem | null>(null);
  const [breadcrumbPath, setBreadcrumbPath] = useState<string[]>([]);

  // Academy materials
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialListItem | null>(null);

  // ★ 진단평가지 — exams.is_diagnostic=true 에서 fetch
  const [academyMaterials, setAcademyMaterials] = useState<MaterialListItem[]>([]);
  const [loadingAcademy, setLoadingAcademy] = useState(true);

  // ★ 단원·주제별 트리 (선택된 자료의 problems 그룹핑)
  const [breakdownTree, setBreakdownTree] = useState<{
    totalProblems: number;
    classifiedCount: number;
    groups: BreakdownNode[];
  } | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // 트리 노드 펼침/접힘 토글
  const toggleNode = useCallback((code: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  // Right panel exams
  const [examList, setExamList] = useState<ExamListItem[]>([]);

  // 진단지 fetch — mount 시 1회. 자산화된 exam 중 is_diagnostic=true 인 것만.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingAcademy(true);
      try {
        const res = await fetch('/api/exams?is_diagnostic=true');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (cancelled) return;
        type ExamRow = {
          id: string;
          title: string;
          fileName: string;
          problemCount: number;
          createdAt: string;
          grade?: string | null;
          subject?: string | null;
          diagnosticCategory?: 'BS' | 'DD' | 'PT' | 'SC' | null;
          diagnosticRound?: string | null;
          diagnosticDifficulty?: string | null;
        };
        const mapped: MaterialListItem[] = (j.exams || []).map((e: ExamRow) => ({
          id: e.id,
          name: e.title || e.fileName || '(제목 없음)',
          paperCount: e.problemCount || 0,
          createdAt: (e.createdAt || '').slice(0, 10),
          type: 'academy' as const,
          grade: e.grade,
          subject: e.subject,
          diagnosticCategory: e.diagnosticCategory,
          diagnosticRound: e.diagnosticRound,
          diagnosticDifficulty: e.diagnosticDifficulty,
        }));
        setAcademyMaterials(mapped);
      } catch (err) {
        console.error('[materials] 진단지 fetch 실패:', err);
        if (!cancelled) setAcademyMaterials([]);
      } finally {
        if (!cancelled) setLoadingAcademy(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Computed
  const filteredGroups = useMemo(() => {
    if (!grade) return mockProviderFolderGroups;
    const gradeLabel = gradeOptions.find((g) => g.value === grade)?.label || '';
    return mockProviderFolderGroups.filter((g) => g.name.includes(gradeLabel.replace('학년', '').trim()));
  }, [grade]);

  const currentFolders = useMemo(() => {
    if (selectedFolder && selectedFolder.children && selectedFolder.children.length > 0) {
      return selectedFolder.children;
    }
    if (selectedGroup) {
      return selectedGroup.folders;
    }
    return [];
  }, [selectedGroup, selectedFolder]);

  const filteredMaterials = useMemo(() => {
    return academyMaterials.filter((m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [academyMaterials, searchQuery]);

  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(filteredMaterials.length / itemsPerPage));

  // Handlers
  const handleSelectGroup = useCallback((group: FolderGroup) => {
    setSelectedGroup(group);
    setSelectedFolder(null);
    setSelectedSubFolder(null);
    setBreadcrumbPath([]);
    setExamList([]);
  }, []);

  const handleSelectFolder = useCallback((folder: FolderItem) => {
    if (folder.children && folder.children.length > 0) {
      setSelectedFolder(folder);
      setBreadcrumbPath([folder.name]);
      setExamList([]);
    } else {
      // Leaf folder - load exams
      setSelectedSubFolder(folder);
      setExamList(generateMockExams(
        selectedGroup?.name || '',
        folder.name
      ));
    }
  }, [selectedGroup]);

  const handleSelectSubFolder = useCallback((subfolder: FolderItem) => {
    setSelectedSubFolder(subfolder);
    const parentName = selectedFolder?.name || '';
    setBreadcrumbPath([parentName, subfolder.name]);
    setExamList(generateMockExams(parentName, subfolder.name));
  }, [selectedFolder]);

  const handleGoBack = useCallback(() => {
    if (selectedFolder) {
      setSelectedFolder(null);
      setSelectedSubFolder(null);
      setBreadcrumbPath([]);
      setExamList([]);
    }
  }, [selectedFolder]);

  const handleSelectMaterial = useCallback((material: MaterialListItem) => {
    setSelectedMaterial(material);
    // ★ 자산화된 자료는 mock 분포 차트 X. 단원·주제별 트리 fetch (/breakdown).
    setExamList([]);
    if (material.type === 'academy') {
      setBreakdownLoading(true);
      setBreakdownTree(null);
      fetch(`/api/exams/${material.id}/breakdown`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(j => {
          setBreakdownTree({
            totalProblems: j.totalProblems || 0,
            classifiedCount: j.classifiedCount || 0,
            groups: j.groups || [],
          });
        })
        .catch(err => {
          console.error('[materials] breakdown fetch 실패:', err);
          setBreakdownTree(null);
        })
        .finally(() => setBreakdownLoading(false));
    } else {
      // 출판 학습지(provider) 는 mock 흐름 유지
      setBreakdownTree(null);
      setExamList(generateMockExams(material.name));
    }
  }, []);

  // ★ "출제" — 선택 노드의 problemIds 로 인쇄용 새 창 (DB 사본 X).
  //   기존 /api/exams/[examId]/print 에 onlyProblemIds 필터 + subtitle 전달.
  //   사본 생성 시 cloud 목록 어수선해지는 사고 차단 (사용자 지적).
  const handlePublishUnit = useCallback((node: BreakdownNode | null) => {
    if (!selectedMaterial) return;
    const problemIds = node
      ? node.problemIds
      : (breakdownTree?.groups.flatMap((g) => collectProblemIds(g)) || []);
    if (problemIds.length === 0) {
      alert('출제할 문제가 없습니다.');
      return;
    }
    const params = new URLSearchParams();
    params.set('variant', 'student');
    if (node) {
      // 부분 인쇄 — onlyProblemIds 필터 + 단원명을 부제로
      params.set('onlyProblemIds', problemIds.join(','));
      params.set('subtitle', node.name);
    }
    // 전체 출제(node === null)는 필터 X — 원본 시험지 그대로 인쇄
    const url = `/api/exams/${selectedMaterial.id}/print?${params.toString()}`;
    window.open(url, '_blank', 'noopener');
  }, [selectedMaterial, breakdownTree]);

  // Grade auto-select group
  const handleGradeChange = useCallback((val: string) => {
    setGrade(val);
    setSelectedGroup(null);
    setSelectedFolder(null);
    setSelectedSubFolder(null);
    setBreadcrumbPath([]);
    setExamList([]);
  }, []);

  // Determine what's shown in right panel
  const hasExams = examList.length > 0;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-2">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <h1 className="text-xl font-bold text-content-primary pl-1">학원 자료</h1>
        <div className="flex items-center gap-2">
          <button
            disabled={!hasExams}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              hasExams
                ? 'bg-white text-black hover:bg-zinc-200'
                : 'bg-surface-raised text-content-tertiary opacity-50 cursor-not-allowed'
            }`}
          >
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${hasExams ? 'bg-black/10' : 'bg-white/10'}`}>
              <Plus className="h-3.5 w-3.5" />
            </span>
            <span>강좌에 추가</span>
          </button>
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/[.08] bg-white/[.04] text-content-secondary hover:bg-white/[.06] hover:text-content-primary transition-colors">
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="grid h-full grid-cols-12 gap-4">
          {/* ============================================================ */}
          {/* Left Column */}
          {/* ============================================================ */}
          <section className="col-span-12 lg:col-span-4 flex h-full flex-col gap-3 min-h-0">
            {/* 과사람 제공 자료 */}
            <div className="flex flex-col overflow-hidden rounded-xl border border-subtle bg-surface-raised flex-shrink-0">
              <div className="border-b border-subtle px-4 py-3 flex justify-between items-start">
                <div>
                  <h2 className="text-sm font-bold text-content-primary">과사람 제공 자료</h2>
                  <p className="text-[11px] text-content-tertiary">제공 폴더를 선택하여 시험지를 확인하세요.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-content-tertiary">학년</span>
                  <div className="relative">
                    <select
                      value={grade}
                      onChange={(e) => handleGradeChange(e.target.value)}
                      className="h-9 appearance-none rounded-full border border bg-surface-card pl-3 pr-8 text-xs font-medium text-content-primary focus:outline-none focus:ring-1 focus:ring-white/30"
                      style={{ width: '120px' }}
                    >
                      {gradeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary" />
                  </div>
                </div>
              </div>

              <div className="px-3 py-3 max-h-[200px] overflow-y-auto scrollbar-thin">
                {/* Breadcrumb back button */}
                {selectedFolder && (
                  <button
                    onClick={handleGoBack}
                    className="flex items-center gap-1.5 mb-2 text-xs font-medium text-content-secondary hover:text-content-primary transition-colors"
                  >
                    <ArrowLeft size={12} />
                    <span>그룹으로 돌아가기</span>
                    {selectedFolder && (
                      <span className="text-content-tertiary ml-1">{selectedFolder.name}</span>
                    )}
                  </button>
                )}

                {/* Folder cards or sub-folders */}
                {!selectedGroup ? (
                  // Show groups for grade selection
                  filteredGroups.length > 0 ? (
                    <div className="space-y-1.5">
                      {filteredGroups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => handleSelectGroup(group)}
                          className="w-full text-left rounded-lg border border-subtle bg-surface-card/50 px-3 py-2.5 hover:border-white/[.14] hover:bg-white/[.06] transition-all"
                        >
                          <span className="text-sm font-medium text-content-primary">{group.name}</span>
                          <span className="text-[10px] text-content-muted ml-2">{group.folders.length}개 폴더</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-content-tertiary text-xs p-3">학년을 선택해 주세요.</p>
                  )
                ) : !selectedFolder ? (
                  // Show folder cards in grid
                  <div className="flex flex-wrap gap-2">
                    {selectedGroup.folders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => handleSelectFolder(folder)}
                        className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-card/50 px-3 py-2 hover:border-white/[.14] hover:bg-white/[.06] transition-all text-left"
                      >
                        <Folder size={14} className="text-content-tertiary shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-content-primary truncate">{folder.name}</div>
                          {folder.subfolderCount > 0 && (
                            <div className="text-[10px] text-content-muted flex items-center gap-1">
                              <FolderOpen size={9} />
                              <span>{folder.subfolderCount}개 폴더</span>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  // Show sub-folders
                  <div className="flex flex-wrap gap-2">
                    {selectedFolder.children?.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleSelectSubFolder(sub)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-all text-left ${
                          selectedSubFolder?.id === sub.id
                            ? 'border-white/[.14] bg-white/[.08]'
                            : 'border-subtle bg-surface-card/50 hover:border-white/[.14] hover:bg-white/[.06]'
                        }`}
                      >
                        <Folder size={13} className={selectedSubFolder?.id === sub.id ? 'text-content-primary' : 'text-content-tertiary'} />
                        <span className={`text-xs font-medium ${selectedSubFolder?.id === sub.id ? 'text-content-primary' : 'text-content-secondary'}`}>
                          {sub.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 학원자료 목록 */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-subtle bg-surface-raised min-h-0">
              <div className="border-b border-subtle px-4 py-3 flex justify-between items-start flex-shrink-0">
                <div>
                  <h2 className="text-sm font-bold text-content-primary">학원자료 목록</h2>
                  <p className="text-[11px] text-content-tertiary">학원자료를 선택해 시험지를 확인하세요.</p>
                </div>
                <div className="flex items-center min-w-[180px]">
                  <div className="relative w-full">
                    <input
                      type="text"
                      placeholder="학원자료 검색"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 w-full rounded-md border border bg-surface-card px-3 pr-8 text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-white/30"
                    />
                    <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary" />
                  </div>
                </div>
              </div>

              {/* Material list */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                {loadingAcademy ? (
                  <div className="px-4 py-8 text-center text-xs text-content-tertiary">불러오는 중...</div>
                ) : filteredMaterials.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-content-tertiary">
                    등록된 진단평가지가 없습니다.
                    <p className="mt-2 text-[10px] text-content-muted">
                      자산화 페이지에서 BS_M1_R1 같은 형식으로 업로드하면 자동 등록됩니다.
                    </p>
                  </div>
                ) : (
                  <ul role="list">
                    {filteredMaterials.map((material) => (
                      <li
                        key={material.id}
                        onClick={() => handleSelectMaterial(material)}
                        className={`cursor-pointer border-b border-subtle px-4 py-2.5 transition-colors ${
                          selectedMaterial?.id === material.id
                            ? 'bg-white/[.08] border-l-2 border-l-white/40'
                            : 'hover:bg-surface-card'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText size={13} className="text-content-muted shrink-0" />
                            <span className="text-xs font-medium text-content-primary truncate">{material.name}</span>
                            {material.diagnosticCategory && (
                              <span className="rounded-full border border-white/[.08] bg-white/[.04] px-1.5 py-0.5 text-[9px] font-bold text-content-secondary shrink-0">
                                {material.diagnosticCategory}
                              </span>
                            )}
                            {material.type === 'provider' && (
                              <span className="rounded-full border border-white/[.08] bg-white/[.04] px-1.5 py-0.5 text-[9px] font-bold text-content-secondary shrink-0">
                                과사람
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-content-tertiary shrink-0 ml-2">{material.paperCount}문제</span>
                        </div>
                        {(material.grade || material.diagnosticRound || material.diagnosticDifficulty) && (
                          <div className="ml-5 mt-0.5 text-[10px] text-content-tertiary">
                            {[material.grade, material.diagnosticRound, material.diagnosticDifficulty].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t border-subtle px-4 py-2 flex-shrink-0">
                <p className="text-[11px] text-content-tertiary">총 {filteredMaterials.length}</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-0.5 px-2 py-1 text-[11px] font-medium text-content-secondary hover:bg-surface-raised rounded disabled:opacity-40"
                  >
                    <ChevronLeft size={12} />
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="inline-flex items-center gap-0.5 px-2 py-1 text-[11px] font-medium text-content-secondary hover:bg-surface-raised rounded disabled:opacity-40"
                  >
                    Next
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ============================================================ */}
          {/* Right Column - 시험지 선택 */}
          {/* ============================================================ */}
          <section className="col-span-12 lg:col-span-8 flex h-full flex-col min-h-0">
            <div className="flex h-full flex-col overflow-hidden rounded-xl border border-subtle bg-surface-raised min-h-0">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-subtle px-5 py-3 flex-shrink-0">
                <div>
                  <h2 className="text-base font-bold text-content-primary">시험지 선택</h2>
                  <p className="text-[11px] text-content-tertiary">
                    리스트에서 시험지를 선택한 후 우측 상단의 버튼으로 강좌에 추가하세요.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('provider')}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      activeTab === 'provider'
                        ? 'border border-white/[.14] bg-white/[.08] text-content-primary'
                        : 'bg-surface-raised text-content-tertiary hover:text-content-secondary'
                    }`}
                  >
                    과사람 제공 자료
                  </button>
                  <button
                    onClick={() => setActiveTab('academy')}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      activeTab === 'academy'
                        ? 'border border-white/[.14] bg-white/[.08] text-content-primary'
                        : 'bg-surface-raised text-content-tertiary hover:text-content-secondary'
                    }`}
                  >
                    학원 자료
                  </button>
                </div>
              </div>

              {/* Table header */}
              {hasExams && (
                <div className="flex items-center gap-3 border-b border-subtle px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-content-muted flex-shrink-0">
                  <div className="w-16 text-center">과목</div>
                  <div className="flex-1">범위/문제명</div>
                  <div className="w-48 text-center">문항수 (주관식/객관식)</div>
                  <div className="w-16 text-center">출제</div>
                </div>
              )}

              {/* Exam list / Breakdown tree */}
              <div className="flex-1 overflow-auto min-h-0 scrollbar-thin">
                {selectedMaterial?.type === 'academy' ? (
                  <BreakdownPanel
                    material={selectedMaterial}
                    tree={breakdownTree}
                    loading={breakdownLoading}
                    expandedNodes={expandedNodes}
                    toggleNode={toggleNode}
                    onPublish={handlePublishUnit}
                  />
                ) : hasExams ? (
                  <div className="divide-y divide-zinc-800/30">
                    {examList.map((exam) => (
                      <div
                        key={exam.id}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-surface-card/50 transition-colors group"
                      >
                        {/* Subject badge */}
                        <SubjectBadge subject={exam.subject} detail={exam.subjectDetail} />

                        {/* Scope + Name */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-content-tertiary mb-0.5 truncate">{exam.scope}</p>
                          <p className="text-sm font-semibold text-content-primary truncate">{exam.name}</p>
                        </div>

                        {/* Problem count + bar */}
                        <div className="w-48 flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-content-tertiary">총 문항</span>
                            <span className="font-bold text-content-primary">{exam.totalProblems}</span>
                            <span className="text-content-muted">
                              ({exam.subjectiveCount}/{exam.objectiveCount})
                            </span>
                          </div>
                          <DifficultyBar bars={exam.difficultyBars} />
                        </div>

                        {/* 출제 button */}
                        <div className="w-16 flex justify-center">
                          <button className="whitespace-nowrap rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-[11px] font-bold text-content-secondary transition-all hover:bg-white/[.06] hover:text-content-primary active:scale-95">
                            출제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-6">
                    <EmptyState
                      message="좌측에서 강좌 또는 폴더를 선택해 시험지를 확인해 주세요."
                      icon={<GraduationCap className="h-6 w-6" />}
                    />
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
