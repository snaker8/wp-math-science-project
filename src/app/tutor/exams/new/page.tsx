'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Clock,
  BookOpen,
  CheckSquare,
  Square,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

interface MockProblem {
  id: string;
  content: string;
  difficulty: '상' | '중' | '하';
}

const MOCK_PROBLEMS: MockProblem[] = [
  { id: 'p1', content: 'x^2 + 3x - 4 = 0 의 두 근의 합을 구하시오.', difficulty: '하' },
  { id: 'p2', content: '이차함수 y = x^2 - 6x + 5 의 꼭짓점 좌표를 구하시오.', difficulty: '중' },
  { id: 'p3', content: '연립부등식 2x - 1 > 3, x + 2 < 8 을 만족하는 정수의 개수를 구하시오.', difficulty: '중' },
  { id: 'p4', content: '삼각형 ABC에서 sin A : sin B : sin C = 3 : 5 : 7 일 때 가장 큰 각의 크기를 구하시오.', difficulty: '상' },
  { id: 'p5', content: 'lim(x→2) (x^2 - 4) / (x - 2) 의 값을 구하시오.', difficulty: '중' },
];

const DIFFICULTY_COLORS: Record<string, { text: string; bg: string }> = {
  '상': { text: '#f87171', bg: 'rgba(239, 68, 68, 0.1)' },
  '중': { text: '#fbbf24', bg: 'rgba(245, 158, 11, 0.1)' },
  '하': { text: '#34d399', bg: 'rgba(52, 211, 153, 0.1)' },
};

export default function NewExamPage() {
  const [examName, setExamName] = useState('');
  const [duration, setDuration] = useState('60');
  const [scope, setScope] = useState('');
  const [selectedProblems, setSelectedProblems] = useState<string[]>([]);

  const handleToggleProblem = (id: string) => {
    setSelectedProblems((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (!examName.trim()) {
      alert('시험명을 입력해주세요.');
      return;
    }
    if (selectedProblems.length === 0) {
      alert('최소 1개 이상의 문제를 선택해주세요.');
      return;
    }
    const data = {
      시험명: examName,
      시험시간: `${duration}분`,
      출제범위: scope,
      선택문제수: selectedProblems.length,
      선택문제ID: selectedProblems,
    };
    alert(`시험이 생성되었습니다!\n\n${JSON.stringify(data, null, 2)}`);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-[800px] mx-auto p-8">
        {/* Header */}
        <header className="flex items-center gap-5 mb-8 p-6 bg-zinc-900/40 border border-white/5 rounded-2xl backdrop-blur-xl">
          <Link
            href="/tutor/exams"
            className="flex items-center justify-center w-[38px] h-[38px] bg-zinc-800/60 border border-white/10 text-zinc-400 rounded-xl hover:bg-zinc-700/80 hover:text-white hover:-translate-x-0.5 transition-all"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">새 시험 만들기</h1>
            <p className="text-sm text-zinc-500">시험 정보를 입력하고 문제를 선택하세요</p>
          </div>
        </header>

        {/* Form */}
        <div className="bg-zinc-950/60 border border-white/5 rounded-2xl overflow-hidden">
          {/* 기본 정보 */}
          <section className="p-6 border-b border-white/5">
            <div className="flex items-center gap-2.5 mb-6">
              <Sparkles size={16} className="text-indigo-400" />
              <h2 className="text-base font-bold">기본 정보</h2>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div className="col-span-2 flex flex-col gap-2">
                <label className="text-sm font-semibold text-zinc-400 flex items-center gap-1.5">
                  <FileText size={14} />
                  시험명 *
                </label>
                <input
                  type="text"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="예: 중간고사 모의고사 1회"
                  className="w-full px-4 py-3 bg-zinc-900/80 border border-white/5 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:bg-zinc-800/90 focus:border-indigo-500/40 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.05)] transition-all"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-zinc-400 flex items-center gap-1.5">
                  <Clock size={14} />
                  시험 시간
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900/80 border border-white/5 rounded-xl text-sm text-white focus:outline-none focus:bg-zinc-800/90 focus:border-indigo-500/40 transition-all"
                >
                  <option value="30">30분</option>
                  <option value="60">60분</option>
                  <option value="90">90분</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-zinc-400 flex items-center gap-1.5">
                  <BookOpen size={14} />
                  출제 범위
                </label>
                <input
                  type="text"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="예: 수학I 1~3단원"
                  className="w-full px-4 py-3 bg-zinc-900/80 border border-white/5 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:bg-zinc-800/90 focus:border-indigo-500/40 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.05)] transition-all"
                />
              </div>
            </div>
          </section>

          {/* 문제 선택 */}
          <section className="p-6 border-b border-white/5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <FileText size={16} className="text-indigo-400" />
                <h2 className="text-base font-bold">문제 선택</h2>
              </div>
              <span className="text-sm text-zinc-500">
                {selectedProblems.length}개 선택됨
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {MOCK_PROBLEMS.map((problem) => {
                const isSelected = selectedProblems.includes(problem.id);
                const diffColor = DIFFICULTY_COLORS[problem.difficulty];

                return (
                  <button
                    key={problem.id}
                    type="button"
                    onClick={() => handleToggleProblem(problem.id)}
                    className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-indigo-500/5 border-indigo-500/20'
                        : 'bg-zinc-900/40 border-white/5 hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="mt-0.5">
                      {isSelected ? (
                        <CheckSquare size={18} className="text-indigo-400" />
                      ) : (
                        <Square size={18} className="text-zinc-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 leading-relaxed">{problem.content}</p>
                    </div>
                    <span
                      className="shrink-0 px-2.5 py-1 rounded-md text-xs font-bold"
                      style={{ color: diffColor.text, background: diffColor.bg }}
                    >
                      {problem.difficulty}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Footer */}
          <div className="flex justify-end items-center gap-4 p-6 bg-zinc-900/40 border-t border-white/5">
            <Link
              href="/tutor/exams"
              className="px-6 py-3 text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              취소
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center gap-2 px-7 py-3 bg-white text-black text-[15px] font-extrabold rounded-[14px] hover:bg-zinc-100 hover:-translate-y-0.5 transition-all shadow-[0_8px_16px_-4px_rgba(255,255,255,0.1)]"
            >
              <span>시험 생성</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
