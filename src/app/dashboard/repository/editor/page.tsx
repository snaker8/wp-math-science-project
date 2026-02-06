'use client';

import React, { useState } from 'react';
import {
    Save,
    Upload,
    Sparkles,
    ChevronRight,
    Search,
    FileText,
    MoreVertical,
    Star
} from 'lucide-react';
import MathEditor from '@/components/editor/MathEditor';

// Mock Data for "Library"
const mockProblems = [
    { id: '1', title: '23년 6월 모의고사 30번', type: 'OCR', date: '2023.06.01' },
    { id: '2', title: '수학(상) 다항식 예제', type: 'Handwriting', date: '2023.05.28' },
    { id: '3', title: '미적분 킬러문제 모음', type: 'PDF', date: '2023.05.20' },
];

export default function ProblemEditorPage() {
    const [activeProblem, setActiveProblem] = useState<string | null>('1');
    const [difficulty, setDifficulty] = useState(3);

    return (
        <div className="flex h-[calc(100vh-6rem)] gap-4 p-4 font-pretendard">
            {/* 
        ============================================================================
        1. Left Panel: Library (Source Materials)
        ============================================================================
      */}
            <div className="flex w-64 flex-col rounded-2xl border border-warm-border-soft bg-white/50 backdrop-blur-sm">
                <div className="flex items-center justify-between border-b border-warm-border-soft px-4 py-3">
                    <h2 className="font-semibold text-warm-text-primary">자료함</h2>
                    <button className="rounded-full p-1 hover:bg-warm-surface-strong">
                        <Upload size={16} className="text-warm-text-secondary" />
                    </button>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-warm-text-muted" />
                        <input
                            type="text"
                            placeholder="자료 검색"
                            className="w-full rounded-xl bg-white px-9 py-2 text-sm border border-warm-border-soft focus:outline-none focus:border-warm-primary"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-2">
                    {mockProblems.map((problem) => (
                        <button
                            key={problem.id}
                            onClick={() => setActiveProblem(problem.id)}
                            className={`mb-1 flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors ${activeProblem === problem.id
                                    ? 'bg-white border border-warm-primary/30 shadow-sm'
                                    : 'hover:bg-white/50 border border-transparent'
                                }`}
                        >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
                                <FileText size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-warm-text-primary">{problem.title}</p>
                                <div className="mt-1 flex items-center gap-2 text-xs text-warm-text-muted">
                                    <span className="rounded bg-warm-surface-strong px-1.5 py-0.5">{problem.type}</span>
                                    <span>{problem.date}</span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 
        ============================================================================
        2. Center Panel: Editor Canvas (Main Workspace)
        ============================================================================
      */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-warm-border-soft bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-warm-border-soft px-6 py-3 bg-white/80 backdrop-blur">
                    <div className="flex items-center gap-2">
                        <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">EDITING</span>
                        <h1 className="text-sm font-semibold text-warm-text-primary">문제 편집</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors">
                            <Sparkles size={14} />
                            <span>AI 다듬기</span>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden bg-warm-surface/30 p-6">
                    {/* Tiptap Math Editor Integration */}
                    <MathEditor
                        placeholder="수식을 입력하세요..."
                        minHeight="100%"
                        className="h-full border-none shadow-none bg-transparent"
                        onChange={(content) => console.log('Content updated', content)}
                    />
                </div>

                {/* Editor Footer Action Bar */}
                <div className="flex items-center justify-between border-t border-warm-border-soft px-6 py-3 bg-white">
                    <div className="text-xs text-warm-text-muted">
                        Changes saved automatically
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="px-4 py-2 text-sm font-medium text-warm-text-secondary hover:text-warm-text-primary transition-colors">
                            미리보기
                        </button>
                        <button className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-transform hover:-translate-y-0.5">
                            <Save size={16} />
                            <span>저장하기</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 
        ============================================================================
        3. Right Panel: Metadata & AI Twins
        ============================================================================
      */}
            <div className="flex w-72 flex-col gap-4">
                {/* Metadata Card */}
                <div className="rounded-2xl border border-warm-border-soft bg-white p-4 shadow-sm">
                    <h3 className="mb-3 text-sm font-semibold text-warm-text-primary">문항 정보</h3>

                    <div className="space-y-4">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-warm-text-secondary">난이도</label>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        onClick={() => setDifficulty(star)}
                                        className={`transition-colors ${star <= difficulty ? 'text-amber-400' : 'text-gray-200'}`}
                                    >
                                        <Star size={20} fill={star <= difficulty ? "currentColor" : "none"} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-warm-text-secondary">단원 분류</label>
                            <select className="w-full rounded-lg border border-warm-border-soft bg-warm-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
                                <option>수학(상) {'>'} 다항식</option>
                                <option>수학(하) {'>'} 집합</option>
                            </select>
                        </div>

                        <div className="flex gap-2">
                            <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10">추론형</span>
                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">4점 문항</span>
                        </div>
                    </div>
                </div>

                {/* AI Twin Generator */}
                <div className="flex-1 rounded-2xl border border-warm-border-soft bg-gradient-to-br from-indigo-50 to-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-indigo-900">AI 쌍둥이 문제</h3>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-600">NEW</span>
                    </div>

                    <div className="flex h-full flex-col justify-center text-center">
                        <div className="mb-3 flex justify-center">
                            <div className="rounded-full bg-indigo-100 p-3">
                                <Sparkles className="h-6 w-6 text-indigo-600" />
                            </div>
                        </div>
                        <p className="text-sm font-medium text-indigo-900">유사 문제 생성</p>
                        <p className="mt-1 text-xs text-indigo-600/70">
                            현재 문제와 유사한 유형의 문제를<br />AI가 자동으로 생성합니다.
                        </p>
                        <button className="mt-4 w-full rounded-xl bg-white border border-indigo-200 py-2.5 text-sm font-semibold text-indigo-600 shadow-sm transition-colors hover:bg-indigo-50">
                            3문항 생성하기
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
