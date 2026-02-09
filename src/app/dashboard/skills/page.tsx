'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  LayoutGrid,
  ScrollText,
  CheckSquare,
  BookOpenCheck,
  MoreHorizontal,
  AlertCircle,
  GripVertical,
  PanelLeftClose,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Chapter {
  id: string;
  name: string;
  children?: Chapter[];
  isExpanded?: boolean;
}

interface Skill {
  id: string;
  name: string;
  problemCount: number;
}

interface DifficultyCount {
  level: string;
  color: string;
  count: number;
}

interface CognitiveCount {
  type: string;
  color: string;
  count: number;
}

// ============================================================================
// Mock Data
// ============================================================================

const mockChapters: Chapter[] = [
  {
    id: '1',
    name: '수와 연산',
    isExpanded: true,
    children: [
      { id: '1-1', name: '자연수의 성질' },
      { id: '1-2', name: '정수와 유리수' },
      { id: '1-3', name: '실수와 그 연산' },
    ],
  },
  {
    id: '2',
    name: '문자와 식',
    isExpanded: false,
    children: [
      { id: '2-1', name: '다항식의 연산' },
      { id: '2-2', name: '인수분해' },
      { id: '2-3', name: '이차방정식' },
    ],
  },
  {
    id: '3',
    name: '함수',
    isExpanded: false,
    children: [
      { id: '3-1', name: '일차함수' },
      { id: '3-2', name: '이차함수' },
    ],
  },
];

const mockSkills: Skill[] = [
  { id: 's1', name: '약수와 배수 구하기', problemCount: 15 },
  { id: 's2', name: '최대공약수 계산', problemCount: 12 },
  { id: 's3', name: '최소공배수 계산', problemCount: 10 },
  { id: 's4', name: '소인수분해', problemCount: 8 },
];

const subjects = ['선택', '수학', '영어', '국어', '과학'];

const difficultyLevels: DifficultyCount[] = [
  { level: '최상', color: '#bb0808', count: 3 },
  { level: '상', color: '#fc1f1f', count: 5 },
  { level: '중', color: '#f58c3d', count: 8 },
  { level: '하', color: '#198cf8', count: 7 },
  { level: '최하', color: '#2e2d2d', count: 2 },
];

const cognitiveTypes: CognitiveCount[] = [
  { type: '계산', color: '#bb0808', count: 6 },
  { type: '이해', color: '#fc1f1f', count: 5 },
  { type: '추론', color: '#f58c3d', count: 7 },
  { type: '해결', color: '#198cf8', count: 4 },
  { type: '미지정', color: '#2e2d2d', count: 3 },
];

interface MockProblem {
  id: string;
  number: number;
  content: string;
  difficulty: string;
  difficultyColor: string;
  cognitive: string;
}

const mockProblems: MockProblem[] = [
  { id: 'p1', number: 1, content: '24와 36의 최대공약수를 구하시오.', difficulty: '하', difficultyColor: '#198cf8', cognitive: '계산' },
  { id: 'p2', number: 2, content: '세 수 12, 18, 30의 최소공배수를 구하시오.', difficulty: '중', difficultyColor: '#f58c3d', cognitive: '이해' },
  { id: 'p3', number: 3, content: '두 자연수의 곱이 360이고 최대공약수가 6일 때, 최소공배수를 구하시오.', difficulty: '상', difficultyColor: '#fc1f1f', cognitive: '추론' },
  { id: 'p4', number: 4, content: '어떤 자연수로 52를 나누면 4가 남고, 78을 나누면 6이 남는다. 이러한 자연수 중 가장 큰 수를 구하시오.', difficulty: '최상', difficultyColor: '#bb0808', cognitive: '해결' },
  { id: 'p5', number: 5, content: '1부터 100까지의 자연수 중 6의 배수의 개수를 구하시오.', difficulty: '하', difficultyColor: '#198cf8', cognitive: '계산' },
];

// ============================================================================
// Components
// ============================================================================

const SubjectSelect: React.FC<{
  value: string;
  options: string[];
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
      >
        <span>{value}</span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[120px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-md">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 ${value === option ? 'bg-zinc-800 font-medium text-white' : 'text-zinc-400'
                  }`}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const ChapterTreeNode: React.FC<{
  node: Chapter;
  level: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}> = ({ node, level, selectedId, onSelect, onToggle }) => {
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasChildren) {
            onToggle(node.id);
          }
          onSelect(node.id);
        }}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${isSelected
            ? 'bg-purple-900/20 text-purple-400 font-medium'
            : 'text-zinc-400 hover:bg-zinc-800'
          }`}
        style={{ paddingLeft: `${12 + level * 16}px` }}
      >
        {hasChildren ? (
          node.isExpanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-warm-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-warm-text-muted" />
          )
        ) : (
          <span className="w-4" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && node.isExpanded && (
        <div>
          {node.children!.map((child) => (
            <ChapterTreeNode
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

const StatsBadge: React.FC<{
  label: string;
  count: number;
  borderColor: string;
}> = ({ label, count, borderColor }) => (
  <span
    className="flex items-center justify-center rounded-md px-1.5 py-0.5 m-1 border cursor-pointer text-sm"
    style={{ borderColor }}
  >
    <span className="text-xs pr-1">{label}</span>
    {count}
  </span>
);

// ============================================================================
// Main Page Component
// ============================================================================

export default function SkillsPage() {
  const [selectedSubject, setSelectedSubject] = useState('선택');
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>(mockChapters);

  const handleToggleChapter = (id: string) => {
    setChapters((prev) =>
      prev.map((chapter) => {
        if (chapter.id === id) {
          return { ...chapter, isExpanded: !chapter.isExpanded };
        }
        if (chapter.children) {
          return {
            ...chapter,
            children: chapter.children.map((child) =>
              child.id === id ? { ...child, isExpanded: !child.isExpanded } : child
            ),
          };
        }
        return chapter;
      })
    );
  };

  const selectedChapter = selectedChapterId
    ? chapters.find((c) => c.id === selectedChapterId) ||
    chapters.flatMap((c) => c.children || []).find((c) => c.id === selectedChapterId)
    : null;

  const selectedSkill = selectedSkillId
    ? mockSkills.find((s) => s.id === selectedSkillId)
    : null;

  return (
    <section className="flex h-full w-full overflow-hidden bg-black text-white">
      <div className="flex h-full w-full min-w-0 flex-col gap-2 p-4 px-4 py-1 font-pretendard text-sm">
        {/* Header */}
        <header className="flex w-full flex-shrink-0 items-center justify-between gap-x-4 pb-1">
          <div className="flex items-center gap-3 flex-shrink-0">
            <h1 className="text-lg font-semibold text-white pl-2">유형/문제 관리</h1>
            <div className="ml-4 flex w-[160px] items-center space-x-2 text-sm">
              <span className="whitespace-nowrap">과목</span>
              <SubjectSelect
                value={selectedSubject}
                options={subjects}
                onChange={setSelectedSubject}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Main Content - Split Panel */}
        <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
          {/* Left Panel - 24% */}
          <div className="flex w-[24%] flex-shrink-0 flex-col gap-2">
            {/* Chapter Tree */}
            <div className="flex h-1/2 flex-col rounded-xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex-1 overflow-auto p-3">
                {chapters.length > 0 ? (
                  <div className="space-y-0.5">
                    {chapters.map((chapter) => (
                      <ChapterTreeNode
                        key={chapter.id}
                        node={chapter}
                        level={0}
                        selectedId={selectedChapterId}
                        onSelect={setSelectedChapterId}
                        onToggle={handleToggleChapter}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                    챕터가 없습니다.
                  </div>
                )}
              </div>
            </div>

            {/* Skill List */}
            <div className="flex flex-1 flex-col gap-3">
              {/* Selected Chapter Info */}
              <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-purple-400">
                    <FolderPlus className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-zinc-500">선택된 챕터</span>
                    <span className="text-sm font-semibold text-white">
                      {selectedChapter?.name || '챕터를 선택해 주세요'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Skills */}
              <div className="flex-1 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-1">
                {selectedChapterId && mockSkills.length > 0 ? (
                  <div className="flex flex-col">
                    {mockSkills.map((skill) => (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => setSelectedSkillId(skill.id)}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${selectedSkillId === skill.id
                            ? 'bg-purple-900/20 text-purple-400 font-medium'
                            : 'text-zinc-400 hover:bg-zinc-800'
                          }`}
                      >
                        <span className="truncate">{skill.name}</span>
                        <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
                          {skill.problemCount}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-3 text-sm text-zinc-500">
                    선택된 챕터에 등록된 유형이 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Resize Handle */}
          <div className="flex w-px items-center justify-center mx-2">
            <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-zinc-800 border-zinc-700">
              <GripVertical className="h-2.5 w-2.5" />
            </div>
          </div>

          {/* Right Panel - 68% */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden pl-1">
            {/* Current Skill Header */}
            <div className="flex-shrink-0 rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-zinc-900 px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-purple-400 shadow-sm">
                    <LayoutGrid className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">현재 유형</span>
                    <span className="text-base font-semibold text-white">
                      {selectedSkill?.name || '유형을 선택해 주세요'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-wrap items-center justify-end gap-2 text-sm">
                  <button
                    type="button"
                    disabled={!selectedSkill}
                    onClick={() => alert('펼쳐보기 모드로 전환합니다. (데모)')}
                    className="flex h-9 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:pointer-events-none text-zinc-300"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    <span>펼쳐보기</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!selectedSkill}
                      onClick={() => alert('시험지를 출력합니다. (데모)')}
                      className="flex h-9 items-center justify-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:pointer-events-none text-zinc-300"
                    >
                      <ScrollText className="h-4 w-4 text-zinc-400" />
                      <span>시험지</span>
                    </button>
                    <button
                      type="button"
                      disabled={!selectedSkill}
                      onClick={() => alert('빠른정답을 출력합니다. (데모)')}
                      className="flex h-9 items-center justify-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:pointer-events-none text-zinc-300"
                    >
                      <CheckSquare className="h-4 w-4 text-zinc-400" />
                      <span>빠른정답</span>
                    </button>
                    <button
                      type="button"
                      disabled={!selectedSkill}
                      onClick={() => alert('해설지를 출력합니다. (데모)')}
                      className="flex h-9 items-center justify-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:pointer-events-none text-zinc-300"
                    >
                      <BookOpenCheck className="h-4 w-4 text-zinc-400" />
                      <span>해설지</span>
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-zinc-500 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Problem List Area */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <div className="h-full overflow-auto">
                <div className="relative h-full">
                  <div className="flex w-full flex-col px-3">
                    {/* Stats Header */}
                    <div className="sticky top-0 z-20 mt-3 mb-0">
                      <div className="flex items-center justify-between px-4 py-3 backdrop-blur-md">
                        <div className="flex flex-1 items-center">
                          <div className="flex items-center space-x-2 text-sm text-zinc-400">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="mx-1 flex cursor-pointer items-center rounded-md border border-zinc-600 bg-zinc-700 px-2 py-0 font-bold text-gray-100 hover:bg-zinc-600">
                                {selectedSkill ? mockProblems.length : 0}<span className="pl-1 text-sm"> 문제 </span>
                              </span>
                              <div className="flex flex-wrap items-center gap-3">
                                {/* Difficulty Badges */}
                                <div className="flex items-center gap-1">
                                  <span className="text-xs uppercase text-zinc-500">난이도</span>
                                  <div className="flex items-center">
                                    {difficultyLevels.map((d) => (
                                      <StatsBadge
                                        key={d.level}
                                        label={d.level}
                                        count={d.count}
                                        borderColor={d.color}
                                      />
                                    ))}
                                  </div>
                                </div>
                                {/* Cognitive Type Badges */}
                                <div className="flex items-center gap-1">
                                  <span className="text-xs uppercase text-zinc-500">인지</span>
                                  <div className="flex items-center">
                                    {cognitiveTypes.map((c) => (
                                      <StatsBadge
                                        key={c.type}
                                        label={c.type}
                                        count={c.count}
                                        borderColor={c.color}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <span className="mx-1 inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2 text-zinc-400 transition-colors">
                                  <AlertCircle className="h-4 w-4" />
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Problem List */}
                    <div className="m-auto w-full flex-1 p-1">
                      {selectedSkill ? (
                        <div className="space-y-2 py-2">
                          {mockProblems.map((problem) => (
                            <div key={problem.id} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-purple-500/30 transition-colors">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-300">
                                {problem.number}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-zinc-300">{problem.content}</p>
                                <div className="mt-2 flex items-center gap-2">
                                  <span className="rounded-md border px-2 py-0.5 text-xs" style={{ borderColor: problem.difficultyColor, color: problem.difficultyColor }}>
                                    {problem.difficulty}
                                  </span>
                                  <span className="text-xs text-zinc-500">{problem.cognitive}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <p className="text-sm text-zinc-500">
                            유형을 선택하면 문제 목록이 표시됩니다.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
