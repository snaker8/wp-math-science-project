'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  BarChart3,
  Trophy,
  TrendingDown,
  Edit,
  Trash2,
  Printer,
  Clock,
  Calendar,
  FileText,
} from 'lucide-react';

interface ExamProblem {
  id: string;
  number: number;
  content: string;
  difficulty: '상' | '중' | '하';
  correctRate: number;
}

const MOCK_EXAM = {
  id: '1',
  name: '중간고사 모의고사 1회',
  duration: 60,
  totalProblems: 25,
  averageScore: 72.5,
  date: '2025-01-15',
};

const MOCK_STATS = {
  totalStudents: 20,
  averageScore: 72.5,
  highestScore: 98,
  lowestScore: 45,
};

const MOCK_PROBLEMS: ExamProblem[] = [
  { id: 'p1', number: 1, content: 'x^2 + 3x - 4 = 0 의 두 근의 합을 구하시오.', difficulty: '하', correctRate: 92 },
  { id: 'p2', number: 2, content: '이차함수 y = x^2 - 6x + 5 의 꼭짓점 좌표를 구하시오.', difficulty: '중', correctRate: 78 },
  { id: 'p3', number: 3, content: '연립부등식 2x - 1 > 3, x + 2 < 8 을 만족하는 정수의 개수를 구하시오.', difficulty: '중', correctRate: 65 },
  { id: 'p4', number: 4, content: '삼각형 ABC에서 sin A : sin B : sin C = 3 : 5 : 7 일 때 가장 큰 각의 크기를 구하시오.', difficulty: '상', correctRate: 35 },
  { id: 'p5', number: 5, content: 'lim(x→2) (x^2 - 4) / (x - 2) 의 값을 구하시오.', difficulty: '중', correctRate: 71 },
];

const DIFFICULTY_COLORS: Record<string, { text: string; bg: string }> = {
  '상': { text: '#f87171', bg: 'rgba(239, 68, 68, 0.1)' },
  '중': { text: '#fbbf24', bg: 'rgba(245, 158, 11, 0.1)' },
  '하': { text: '#34d399', bg: 'rgba(52, 211, 153, 0.1)' },
};

export default function ExamDetailPage() {
  const router = useRouter();
  const [exam] = useState(MOCK_EXAM);
  const [stats] = useState(MOCK_STATS);
  const [problems] = useState(MOCK_PROBLEMS);

  const handleDelete = () => {
    if (confirm('정말로 이 시험을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      alert('시험이 삭제되었습니다.');
      router.push('/tutor/exams');
    }
  };

  const handlePrint = () => {
    alert('시험지 인쇄 기능이 실행됩니다. (데모)');
  };

  const getCorrectRateColor = (rate: number) => {
    if (rate >= 80) return '#34d399';
    if (rate >= 50) return '#fbbf24';
    return '#f87171';
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-[1000px] mx-auto p-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-8 p-6 bg-zinc-900/40 border border-white/5 rounded-2xl backdrop-blur-xl">
          <div className="flex items-center gap-5">
            <Link
              href="/tutor/exams"
              className="flex items-center justify-center w-[38px] h-[38px] bg-zinc-800/60 border border-white/10 text-zinc-400 rounded-xl hover:bg-zinc-700/80 hover:text-white hover:-translate-x-0.5 transition-all"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">{exam.name}</h1>
              <div className="flex items-center gap-4 mt-1">
                <span className="flex items-center gap-1.5 text-sm text-zinc-500">
                  <Calendar size={14} />
                  {exam.date}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-zinc-500">
                  <Clock size={14} />
                  {exam.duration}분
                </span>
                <span className="flex items-center gap-1.5 text-sm text-zinc-500">
                  <FileText size={14} />
                  {exam.totalProblems}문제
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/tutor/exams/${exam.id}/edit`}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/60 border border-white/10 text-zinc-300 text-sm font-semibold rounded-xl hover:bg-zinc-700/80 hover:text-white transition-all"
            >
              <Edit size={15} />
              수정
            </Link>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold rounded-xl hover:bg-red-500/20 transition-all"
            >
              <Trash2 size={15} />
              삭제
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-black text-sm font-bold rounded-xl hover:bg-zinc-100 hover:-translate-y-0.5 transition-all shadow-[0_4px_12px_rgba(255,255,255,0.1)]"
            >
              <Printer size={15} />
              시험지 인쇄
            </button>
          </div>
        </header>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="flex items-center gap-4 p-5 bg-zinc-900/60 border border-white/5 rounded-2xl">
            <div className="flex items-center justify-center w-11 h-11 bg-indigo-500/10 rounded-xl">
              <Users size={20} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalStudents}명</p>
              <p className="text-xs text-zinc-500 font-medium">응시자 수</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-5 bg-zinc-900/60 border border-white/5 rounded-2xl">
            <div className="flex items-center justify-center w-11 h-11 bg-amber-500/10 rounded-xl">
              <BarChart3 size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.averageScore}점</p>
              <p className="text-xs text-zinc-500 font-medium">평균점수</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-5 bg-zinc-900/60 border border-white/5 rounded-2xl">
            <div className="flex items-center justify-center w-11 h-11 bg-emerald-500/10 rounded-xl">
              <Trophy size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.highestScore}점</p>
              <p className="text-xs text-zinc-500 font-medium">최고점수</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-5 bg-zinc-900/60 border border-white/5 rounded-2xl">
            <div className="flex items-center justify-center w-11 h-11 bg-red-500/10 rounded-xl">
              <TrendingDown size={20} className="text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.lowestScore}점</p>
              <p className="text-xs text-zinc-500 font-medium">최저점수</p>
            </div>
          </div>
        </div>

        {/* Problem List Table */}
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 p-6 border-b border-white/5">
            <FileText size={16} className="text-indigo-400" />
            <h2 className="text-base font-bold">출제 문제 목록</h2>
            <span className="ml-auto text-sm text-zinc-500">{problems.length}문제</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-6 py-4 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider w-16">번호</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider">문제내용</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider w-20">난이도</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider w-24">정답률</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((problem) => {
                  const diffColor = DIFFICULTY_COLORS[problem.difficulty];
                  const rateColor = getCorrectRateColor(problem.correctRate);

                  return (
                    <tr
                      key={problem.id}
                      className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-zinc-800/80 rounded-lg text-sm font-bold text-zinc-300">
                          {problem.number}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-200 leading-relaxed">
                        {problem.content}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className="inline-block px-2.5 py-1 rounded-md text-xs font-bold"
                          style={{ color: diffColor.text, background: diffColor.bg }}
                        >
                          {problem.difficulty}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-sm font-bold" style={{ color: rateColor }}>
                            {problem.correctRate}%
                          </span>
                          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${problem.correctRate}%`,
                                background: rateColor,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
