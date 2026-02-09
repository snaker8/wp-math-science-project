'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Users, Clock, ChevronRight } from 'lucide-react';

interface ClassItem {
  id: string;
  name: string;
  teacher: string;
  schedule: string;
  studentCount: number;
}

const mockClasses: ClassItem[] = [
  {
    id: 'c1',
    name: '중등 수학 A반',
    teacher: '김선생님',
    schedule: '월/수 16:00',
    studentCount: 15,
  },
  {
    id: 'c2',
    name: '고등 수학 기초반',
    teacher: '이선생님',
    schedule: '화/목 18:00',
    studentCount: 12,
  },
  {
    id: 'c3',
    name: '수능 대비 심화반',
    teacher: '박선생님',
    schedule: '토 10:00',
    studentCount: 8,
  },
];

export default function StudentClassesPage() {
  const [classes] = useState<ClassItem[]>(mockClasses);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/student"
            className="p-2 rounded-lg border border-gray-200 text-zinc-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">내 반 목록</h1>
            <p className="text-sm text-zinc-500 mt-1">등록된 반을 확인하고 관리하세요</p>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl">
          <BookOpen size={18} className="text-indigo-600" />
          <span className="text-sm font-medium text-indigo-700">
            총 {classes.length}개 반에 등록되어 있습니다
          </span>
        </div>

        {/* Class Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {classes.map((cls) => (
            <Link
              key={cls.id}
              href={`/student/classes/${cls.id}`}
              className="group block bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-indigo-600 transition-colors">
                    {cls.name}
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1">{cls.teacher}</p>
                </div>
                <ChevronRight
                  size={20}
                  className="text-gray-300 group-hover:text-indigo-400 transition-colors mt-1"
                />
              </div>

              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                  <Clock size={14} className="text-zinc-400" />
                  <span>{cls.schedule}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                  <Users size={14} className="text-zinc-400" />
                  <span>{cls.studentCount}명</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Empty State (hidden since we have mock data, but included for completeness) */}
        {classes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen size={48} className="text-gray-300 mb-4" />
            <p className="text-zinc-600 font-medium">등록된 반이 없습니다</p>
            <p className="text-sm text-zinc-400 mt-1">선생님의 초대를 기다려주세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
