'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ClipboardList,
  PlayCircle,
  CheckCircle2,
  MinusCircle,
  Eye,
  ArrowRight,
} from 'lucide-react';

interface ExamItem {
  id: string;
  name: string;
  className: string;
  date: string;
  duration: string;
  status: '미응시' | '완료' | '진행중';
  score?: number;
  totalScore?: number;
}

const mockExams: ExamItem[] = [
  {
    id: 'ex1',
    name: '중간고사 대비 모의고사',
    className: '중등 수학 A반',
    date: '2025-04-15',
    duration: '60분',
    status: '미응시',
  },
  {
    id: 'ex2',
    name: '3월 단원평가 - 함수',
    className: '중등 수학 A반',
    date: '2025-03-20',
    duration: '45분',
    status: '진행중',
  },
  {
    id: 'ex3',
    name: '2월 진단평가',
    className: '중등 수학 A반',
    date: '2025-02-10',
    duration: '50분',
    status: '완료',
    score: 85,
    totalScore: 100,
  },
  {
    id: 'ex4',
    name: '미적분 기초 테스트',
    className: '고등 수학 기초반',
    date: '2025-03-05',
    duration: '40분',
    status: '완료',
    score: 92,
    totalScore: 100,
  },
  {
    id: 'ex5',
    name: '수능 모의고사 1회',
    className: '수능 대비 심화반',
    date: '2025-04-20',
    duration: '100분',
    status: '미응시',
  },
];

export default function StudentExamsPage() {
  const [exams] = useState<ExamItem[]>(mockExams);

  const getStatusBadge = (status: ExamItem['status']) => {
    switch (status) {
      case '미응시':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
            <MinusCircle size={12} />
            미응시
          </span>
        );
      case '진행중':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
            <PlayCircle size={12} />
            진행중
          </span>
        );
      case '완료':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-600 border border-green-200">
            <CheckCircle2 size={12} />
            완료
          </span>
        );
    }
  };

  const handleTakeExam = (exam: ExamItem) => {
    alert(`"${exam.name}" 시험을 시작합니다.`);
  };

  const handleViewResult = (exam: ExamItem) => {
    alert(`"${exam.name}" 결과: ${exam.score}/${exam.totalScore}점 (${Math.round((exam.score! / exam.totalScore!) * 100)}%)`);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/student"
            className="p-2 rounded-lg border border-gray-200 text-zinc-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">시험 목록</h1>
            <p className="text-sm text-zinc-500 mt-1">나의 시험 현황을 확인하세요</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <MinusCircle size={20} className="text-gray-400" />
            <div>
              <p className="text-lg font-bold text-zinc-900">
                {exams.filter((e) => e.status === '미응시').length}
              </p>
              <p className="text-xs text-zinc-500">미응시</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <PlayCircle size={20} className="text-blue-500" />
            <div>
              <p className="text-lg font-bold text-zinc-900">
                {exams.filter((e) => e.status === '진행중').length}
              </p>
              <p className="text-xs text-zinc-500">진행중</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
            <CheckCircle2 size={20} className="text-green-500" />
            <div>
              <p className="text-lg font-bold text-zinc-900">
                {exams.filter((e) => e.status === '완료').length}
              </p>
              <p className="text-xs text-zinc-500">완료</p>
            </div>
          </div>
        </div>

        {/* Exam Table - Desktop */}
        <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  시험명
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  반
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  날짜
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  시간
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  점수
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  액션
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {exams.map((exam) => (
                <tr key={exam.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-zinc-800">{exam.name}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-zinc-500">{exam.className}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-zinc-500">{exam.date}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-zinc-500">{exam.duration}</p>
                  </td>
                  <td className="px-5 py-4 text-center">{getStatusBadge(exam.status)}</td>
                  <td className="px-5 py-4 text-center">
                    {exam.score !== undefined ? (
                      <span className="text-sm font-semibold text-indigo-600">
                        {exam.score}/{exam.totalScore}
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-300">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-center">
                    {(exam.status === '미응시' || exam.status === '진행중') && (
                      <button
                        onClick={() => handleTakeExam(exam)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        응시하기
                        <ArrowRight size={12} />
                      </button>
                    )}
                    {exam.status === '완료' && (
                      <button
                        onClick={() => handleViewResult(exam)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-indigo-600 text-xs font-medium rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
                      >
                        <Eye size={12} />
                        결과보기
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Exam Cards - Mobile */}
        <div className="md:hidden space-y-3">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-zinc-800">{exam.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{exam.className}</p>
                </div>
                {getStatusBadge(exam.status)}
              </div>
              <div className="flex items-center gap-4 text-xs text-zinc-500 mb-3">
                <span>{exam.date}</span>
                <span>{exam.duration}</span>
                {exam.score !== undefined && (
                  <span className="font-semibold text-indigo-600">
                    {exam.score}/{exam.totalScore}점
                  </span>
                )}
              </div>
              <div>
                {(exam.status === '미응시' || exam.status === '진행중') && (
                  <button
                    onClick={() => handleTakeExam(exam)}
                    className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    응시하기
                    <ArrowRight size={14} />
                  </button>
                )}
                {exam.status === '완료' && (
                  <button
                    onClick={() => handleViewResult(exam)}
                    className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-white text-indigo-600 text-sm font-medium rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
                  >
                    <Eye size={14} />
                    결과보기
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {exams.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList size={48} className="text-gray-300 mb-4" />
            <p className="text-zinc-600 font-medium">시험이 없습니다</p>
            <p className="text-sm text-zinc-400 mt-1">배정된 시험이 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
