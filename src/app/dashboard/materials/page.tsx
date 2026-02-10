'use client';

import React, { useState, useMemo, useCallback } from 'react';
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

const mockAcademyMaterials: MaterialListItem[] = [
  { id: 'am1', name: '중간고사 대비 세트', paperCount: 5, createdAt: '2025-02-01', type: 'academy' },
  { id: 'am2', name: '기말고사 대비 세트', paperCount: 8, createdAt: '2025-01-28', type: 'academy' },
  { id: 'am3', name: '수능특강 연습문제', paperCount: 12, createdAt: '2025-01-25', type: 'provider' },
  { id: 'am4', name: '모의고사 기출 변형', paperCount: 10, createdAt: '2025-01-20', type: 'academy' },
  { id: 'am5', name: '단원별 진단평가', paperCount: 6, createdAt: '2025-01-15', type: 'provider' },
];

// ============================================================================
// Sub Components
// ============================================================================

function SubjectBadge({ subject, detail }: { subject: string; detail: string }) {
  const isHigh = subject === '고등';
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0 w-16">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
        isHigh
          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
          : 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
      }`}>
        {subject}
      </span>
      <span className="text-[10px] text-zinc-500 font-medium">{detail}</span>
    </div>
  );
}

function DifficultyBar({ bars }: { bars: { color: string; percent: number }[] }) {
  return (
    <div className="flex h-4 w-full overflow-hidden rounded-full bg-zinc-800">
      {bars.map((bar, i) => (
        <div
          key={i}
          style={{ width: `${bar.percent}%`, backgroundColor: bar.color }}
          className="flex items-center justify-center h-full text-[8px] font-bold text-white/80 leading-none"
        >
          {bar.percent >= 15 ? `${bar.percent}%` : ''}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl bg-zinc-900/50 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-500">
        {icon || <AlertCircle className="h-6 w-6" />}
      </span>
      <p className="text-sm font-semibold text-zinc-400">{message}</p>
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

  // Right panel exams
  const [examList, setExamList] = useState<ExamListItem[]>([]);

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
    return mockAcademyMaterials.filter((m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

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
    setExamList(generateMockExams(material.name));
  }, []);

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
        <h1 className="text-xl font-bold text-white pl-1">학원 자료</h1>
        <div className="flex items-center gap-2">
          <button
            disabled={!hasExams}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              hasExams
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20 hover:-translate-y-[1px]'
                : 'bg-zinc-800 text-zinc-500 opacity-50 cursor-not-allowed'
            }`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
              <Plus className="h-3.5 w-3.5" />
            </span>
            <span>강좌에 추가</span>
          </button>
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 transition-colors">
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
            <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 flex-shrink-0">
              <div className="border-b border-zinc-800 px-4 py-3 flex justify-between items-start">
                <div>
                  <h2 className="text-sm font-bold text-white">과사람 제공 자료</h2>
                  <p className="text-[11px] text-zinc-500">제공 폴더를 선택하여 시험지를 확인하세요.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-500">학년</span>
                  <div className="relative">
                    <select
                      value={grade}
                      onChange={(e) => handleGradeChange(e.target.value)}
                      className="h-9 appearance-none rounded-full border border-zinc-700 bg-zinc-900 pl-3 pr-8 text-xs font-medium text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      style={{ width: '120px' }}
                    >
                      {gradeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  </div>
                </div>
              </div>

              <div className="px-3 py-3 max-h-[200px] overflow-y-auto scrollbar-thin">
                {/* Breadcrumb back button */}
                {selectedFolder && (
                  <button
                    onClick={handleGoBack}
                    className="flex items-center gap-1.5 mb-2 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <ArrowLeft size={12} />
                    <span>그룹으로 돌아가기</span>
                    {selectedFolder && (
                      <span className="text-zinc-500 ml-1">{selectedFolder.name}</span>
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
                          className="w-full text-left rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all"
                        >
                          <span className="text-sm font-medium text-zinc-200">{group.name}</span>
                          <span className="text-[10px] text-zinc-600 ml-2">{group.folders.length}개 폴더</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-zinc-500 text-xs p-3">학년을 선택해 주세요.</p>
                  )
                ) : !selectedFolder ? (
                  // Show folder cards in grid
                  <div className="flex flex-wrap gap-2">
                    {selectedGroup.folders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => handleSelectFolder(folder)}
                        className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all text-left"
                      >
                        <Folder size={14} className="text-zinc-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-zinc-200 truncate">{folder.name}</div>
                          {folder.subfolderCount > 0 && (
                            <div className="text-[10px] text-zinc-600 flex items-center gap-1">
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
                            ? 'border-indigo-500/50 bg-indigo-500/10'
                            : 'border-zinc-800 bg-zinc-900/50 hover:border-indigo-500/30 hover:bg-indigo-500/5'
                        }`}
                      >
                        <Folder size={13} className={selectedSubFolder?.id === sub.id ? 'text-indigo-400' : 'text-zinc-500'} />
                        <span className={`text-xs font-medium ${selectedSubFolder?.id === sub.id ? 'text-indigo-300' : 'text-zinc-300'}`}>
                          {sub.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 학원자료 목록 */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 min-h-0">
              <div className="border-b border-zinc-800 px-4 py-3 flex justify-between items-start flex-shrink-0">
                <div>
                  <h2 className="text-sm font-bold text-white">학원자료 목록</h2>
                  <p className="text-[11px] text-zinc-500">학원자료를 선택해 시험지를 확인하세요.</p>
                </div>
                <div className="flex items-center min-w-[180px]">
                  <div className="relative w-full">
                    <input
                      type="text"
                      placeholder="학원자료 검색"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 pr-8 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  </div>
                </div>
              </div>

              {/* Material list */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                <ul role="list">
                  {filteredMaterials.map((material) => (
                    <li
                      key={material.id}
                      onClick={() => handleSelectMaterial(material)}
                      className={`cursor-pointer border-b border-zinc-800/50 px-4 py-2.5 transition-colors ${
                        selectedMaterial?.id === material.id
                          ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500'
                          : 'hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={13} className="text-zinc-600 shrink-0" />
                          <span className="text-xs font-medium text-zinc-200 truncate">{material.name}</span>
                          {material.type === 'provider' && (
                            <span className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-bold text-indigo-400 shrink-0">
                              과사람
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-500 shrink-0 ml-2">{material.paperCount}장</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-2 flex-shrink-0">
                <p className="text-[11px] text-zinc-500">총 {filteredMaterials.length}</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-0.5 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-zinc-800 rounded disabled:opacity-40"
                  >
                    <ChevronLeft size={12} />
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="inline-flex items-center gap-0.5 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-zinc-800 rounded disabled:opacity-40"
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
            <div className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 min-h-0">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3 flex-shrink-0">
                <div>
                  <h2 className="text-base font-bold text-white">시험지 선택</h2>
                  <p className="text-[11px] text-zinc-500">
                    리스트에서 시험지를 선택한 후 우측 상단의 버튼으로 강좌에 추가하세요.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('provider')}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      activeTab === 'provider'
                        ? 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30'
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    과사람 제공 자료
                  </button>
                  <button
                    onClick={() => setActiveTab('academy')}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      activeTab === 'academy'
                        ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    학원 자료
                  </button>
                </div>
              </div>

              {/* Table header */}
              {hasExams && (
                <div className="flex items-center gap-3 border-b border-zinc-800/50 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-600 flex-shrink-0">
                  <div className="w-16 text-center">과목</div>
                  <div className="flex-1">범위/문제명</div>
                  <div className="w-48 text-center">문항수 (주관식/객관식)</div>
                  <div className="w-16 text-center">출제</div>
                </div>
              )}

              {/* Exam list */}
              <div className="flex-1 overflow-auto min-h-0 scrollbar-thin">
                {hasExams ? (
                  <div className="divide-y divide-zinc-800/30">
                    {examList.map((exam) => (
                      <div
                        key={exam.id}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-900/50 transition-colors group"
                      >
                        {/* Subject badge */}
                        <SubjectBadge subject={exam.subject} detail={exam.subjectDetail} />

                        {/* Scope + Name */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-zinc-500 mb-0.5 truncate">{exam.scope}</p>
                          <p className="text-sm font-semibold text-zinc-100 truncate">{exam.name}</p>
                        </div>

                        {/* Problem count + bar */}
                        <div className="w-48 flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-zinc-500">총 문항</span>
                            <span className="font-bold text-white">{exam.totalProblems}</span>
                            <span className="text-zinc-600">
                              ({exam.subjectiveCount}/{exam.objectiveCount})
                            </span>
                          </div>
                          <DifficultyBar bars={exam.difficultyBars} />
                        </div>

                        {/* 출제 button */}
                        <div className="w-16 flex justify-center">
                          <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:bg-indigo-500 active:scale-95 shadow-sm shadow-indigo-500/20">
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
