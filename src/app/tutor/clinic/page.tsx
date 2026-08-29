'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Check, RefreshCw, Printer } from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { useSmartBack } from '@/lib/navigation/useSmartBack';

// Mock Problems
const mockProblems = [
  {
    id: 1,
    type: 'original',
    content: `이차방정식 $x^2 - 4x + k = 0$이 중근을 가질 때, 상수 $k$의 값을 구하시오.`,
    difficulty: 'Easy'
  },
  {
    id: 2,
    type: 'twin',
    content: `이차방정식 $x^2 + 6x + k - 2 = 0$이 중근을 가질 때, 상수 $k$의 값을 구하시오.`,
    difficulty: 'Easy'
  },
  {
    id: 3,
    type: 'twin',
    content: `이차방정식 $2x^2 - 8x + k = 0$이 중근을 가질 때, 상수 $k$의 값을 구하시오.`,
    difficulty: 'Medium'
  }
];

export default function ClinicCreationPage() {
  const goBack = useSmartBack('/dashboard/prescription');
  const [selectedProblems, setSelectedProblems] = useState<number[]>([]);

  const toggleProblem = (id: number) => {
    setSelectedProblems(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 border-b border-white/10 pb-6">
        <div className="flex items-center gap-4">
          <button type="button" onClick={goBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold">오답 클리닉 생성</h1>
            <p className="text-gray-500 text-sm">AI가 분석한 취약점 기반 유사 문제(Twin Problems) 제안</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-content-secondary">선택된 문제: <strong className="text-content-primary tabular-nums">{selectedProblems.length}</strong>개</span>
          <button
            onClick={() => {
              if (selectedProblems.length === 0) {
                alert('문제를 하나 이상 선택해주세요.');
              } else {
                alert(`${selectedProblems.length}개의 문제로 클리닉 시험지가 생성되었습니다. (데모)`);
              }
            }}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200 flex items-center gap-2 whitespace-nowrap transition-colors"
          >
            <Printer size={18} />
            클리닉 시험지 생성
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Original Problem (Source of Error) */}
        <div className="space-y-4">
          <h3 className="text-content-tertiary font-semibold uppercase tracking-wider text-sm">
            Original Error Problem
          </h3>
          <div className="bg-zinc-900 border border-white/[.08] rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 bg-red-500/20 text-red-300 text-xs font-bold px-3 py-1 rounded-br-xl border-r border-b border-red-500/30">
              WRONG
            </div>
            <div className="mt-4 text-lg leading-relaxed text-gray-200">
              <MathRenderer content={mockProblems[0].content} block />
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center text-sm">
              <span className="text-gray-500">정답률: 45%</span>
              <button
                onClick={() => alert('해설: 이차방정식 ax²+bx+c=0이 중근을 가지려면 판별식 D=b²-4ac=0이어야 합니다.\n(-4)²-4(1)(k)=0 → 16-4k=0 → k=4')}
                className="text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={14} /> 해설 보기
              </button>
            </div>
          </div>
        </div>

        {/* Twin Problems (Suggestions) */}
        <div className="space-y-4">
          <h3 className="text-content-tertiary font-semibold uppercase tracking-wider text-sm">
            AI Recommended Twin Problems
          </h3>

          <div className="space-y-4">
            {mockProblems.slice(1).map((prob) => (
              <motion.div
                key={prob.id}
                layout
                onClick={() => toggleProblem(prob.id)}
                className={`group relative border rounded-2xl p-6 cursor-pointer transition-all ${selectedProblems.includes(prob.id)
                    ? 'bg-white/[.08] border-white/[.24] ring-1 ring-white/20'
                    : 'bg-zinc-900 border-white/10 hover:border-white/30'
                  }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <span className={`text-xs font-bold px-2 py-1 rounded ${prob.difficulty === 'Easy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                    {prob.difficulty}
                  </span>
                  <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${selectedProblems.includes(prob.id)
                      ? 'bg-white border-white text-black'
                      : 'border-white/25 text-transparent group-hover:border-white'
                    }`}>
                    <Check size={14} />
                  </div>
                </div>

                <div className="text-lg text-gray-200">
                  <MathRenderer content={prob.content} />
                </div>
              </motion.div>
            ))}

            <button
              onClick={() => alert('추가 유사 문제를 불러옵니다. (데모)')}
              className="w-full py-4 rounded-2xl border border-dashed border-white/20 text-gray-500 hover:text-white hover:border-white/40 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              더 많은 유사 문제 불러오기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
