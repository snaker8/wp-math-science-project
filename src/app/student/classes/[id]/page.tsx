'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Users,
  Clock,
  Calendar,
  FileText,
  TrendingUp,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface ExamItem {
  id: string;
  name: string;
  date: string;
  status: '예정' | '진행중' | '완료';
}

interface ScoreEntry {
  id: string;
  examName: string;
  score: number;
  totalScore: number;
  date: string;
}

const mockClassInfo = {
  name: '중등 수학 A반',
  teacher: '김선생님',
  schedule: '월/수 16:00 ~ 17:30',
  studentCount: 15,
  description:
    '중학교 2~3학년 수학 과정을 다루는 반입니다. 함수, 기하, 통계 등 핵심 단원을 체계적으로 학습합니다.',
};

const mockExams: ExamItem[] = [
  { id: 'e1', name: '중간고사 대비 모의고사', date: '2025-04-15', status: '예정' },
  { id: 'e2', name: '3월 단원평가 - 함수', date: '2025-03-20', status: '진행중' },
  { id: 'e3', name: '2월 진단평가', date: '2025-02-10', status: '완료' },
];

const mockScores: ScoreEntry[] = [
  { id: 's1', examName: '2월 진단평가', score: 85, totalScore: 100, date: '2025-02-10' },
  { id: 's2', examName: '1월 단원평가 - 방정식', score: 92, totalScore: 100, date: '2025-01-15' },
  { id: 's3', examName: '12월 종합평가', score: 78, totalScore: 100, date: '2024-12-20' },
];

export default function StudentClassDetailPage() {
  const params = useParams();
  const classId = params?.id as string;

  const [classInfo] = useState(mockClassInfo);
  const [exams] = useState<ExamItem[]>(mockExams);
  const [scores] = useState<ScoreEntry[]>(mockScores);

  const getStatusBadge = (status: ExamItem['status']) => {
    switch (status) {
      case '예정':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
            <AlertCircle size={12} />
            예정
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

  const handleTakeExam = (examName: string) => {
    alert('시험 페이지로 이동합니다.');
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/student/classes"
            className="p-2 rounded-lg border border-gray-200 text-zinc-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{classInfo.name}</h1>
            <p className="text-sm text-zinc-500 mt-1">반 상세 정보</p>
          </div>
        </div>

        {/* Class Info Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
            <BookOpen size={18} className="text-indigo-500" />
            반 정보
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Users size={16} className="text-zinc-400" />
              <div>
                <p className="text-xs text-zinc-400">담당 선생님</p>
                <p className="text-sm font-medium text-zinc-800">{classInfo.teacher}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Clock size={16} className="text-zinc-400" />
              <div>
                <p className="text-xs text-zinc-400">수업 시간</p>
                <p className="text-sm font-medium text-zinc-800">{classInfo.schedule}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Users size={16} className="text-zinc-400" />
              <div>
                <p className="text-xs text-zinc-400">수강 인원</p>
                <p className="text-sm font-medium text-zinc-800">{classInfo.studentCount}명</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Calendar size={16} className="text-zinc-400" />
              <div>
                <p className="text-xs text-zinc-400">반 ID</p>
                <p className="text-sm font-medium text-zinc-800">{classId}</p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-zinc-600 leading-relaxed bg-gray-50 p-3 rounded-lg">
            {classInfo.description}
          </p>
        </div>

        {/* Upcoming Exams */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
            <FileText size={18} className="text-indigo-500" />
            시험 목록
          </h2>
          <div className="space-y-3">
            {exams.map((exam) => (
              <div
                key={exam.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-800">{exam.name}</p>
                  <p className="text-xs text-zinc-400 mt-1">{exam.date}</p>
                </div>
                <div className="flex items-center gap-3">
                  {getStatusBadge(exam.status)}
                  {exam.status === '진행중' && (
                    <button
                      onClick={() => handleTakeExam(exam.name)}
                      className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      시험 응시
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Scores */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-indigo-500" />
            최근 성적
          </h2>
          <div className="space-y-3">
            {scores.map((entry) => {
              const percentage = Math.round((entry.score / entry.totalScore) * 100);
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-800">{entry.examName}</p>
                    <p className="text-xs text-zinc-400 mt-1">{entry.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-indigo-600">
                      {entry.score}
                      <span className="text-sm font-normal text-zinc-400">
                        /{entry.totalScore}
                      </span>
                    </p>
                    <div className="w-24 h-1.5 bg-gray-200 rounded-full mt-1.5">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
