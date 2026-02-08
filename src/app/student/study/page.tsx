'use client';

import { useState } from 'react';
import { BookOpen, Play, CheckCircle, Clock, Target } from 'lucide-react';

const mockLessons = [
  { id: 1, title: '이차방정식의 풀이', subject: '수학1', progress: 100, duration: '45분' },
  { id: 2, title: '삼각함수의 덧셈정리', subject: '수학2', progress: 65, duration: '50분' },
  { id: 3, title: '미분의 활용', subject: '미적분', progress: 30, duration: '60분' },
  { id: 4, title: '확률의 기본', subject: '확률과통계', progress: 0, duration: '40분' },
];

export default function StudentStudyPage() {
  const [selectedSubject, setSelectedSubject] = useState<string>('전체');

  const subjects = ['전체', '수학1', '수학2', '미적분', '확률과통계'];

  const filteredLessons = selectedSubject === '전체'
    ? mockLessons
    : mockLessons.filter(l => l.subject === selectedSubject);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <BookOpen className="text-indigo-400" />
            학습하기
          </h1>
          <p className="text-zinc-400 mt-2">오늘의 학습 목표를 달성해보세요!</p>
        </header>

        {/* 과목 필터 */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {subjects.map(subject => (
            <button
              key={subject}
              onClick={() => setSelectedSubject(subject)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selectedSubject === subject
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {subject}
            </button>
          ))}
        </div>

        {/* 학습 목록 */}
        <div className="space-y-4">
          {filteredLessons.map(lesson => (
            <div
              key={lesson.id}
              className="bg-zinc-900/50 border border-white/10 rounded-xl p-6 hover:border-indigo-500/50 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded">
                      {lesson.subject}
                    </span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Clock size={12} />
                      {lesson.duration}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold">{lesson.title}</h3>

                  {/* 진행률 바 */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
                        style={{ width: `${lesson.progress}%` }}
                      />
                    </div>
                    <span className="text-sm text-zinc-400">{lesson.progress}%</span>
                  </div>
                </div>

                <button
                  className={`ml-4 p-3 rounded-full transition-all ${
                    lesson.progress === 100
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500'
                  }`}
                >
                  {lesson.progress === 100 ? (
                    <CheckCircle size={24} />
                  ) : (
                    <Play size={24} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 오늘의 목표 */}
        <div className="mt-8 p-6 bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-500/30 rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <Target className="text-indigo-400" />
            <h3 className="text-lg font-semibold">오늘의 목표</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-indigo-400">2/4</div>
              <div className="text-sm text-zinc-400">강의 완료</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-400">15</div>
              <div className="text-sm text-zinc-400">문제 풀이</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-400">45분</div>
              <div className="text-sm text-zinc-400">학습 시간</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
