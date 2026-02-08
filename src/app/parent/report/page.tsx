'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
    TrendingUp,
    Award,
    BookOpen,
    Calendar,
    ChevronRight,
    MessageSquare,
    Star,
    Zap,
    Heart,
    Target
} from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

// ============================================================================
// Mock Data
// ============================================================================

const growthData = [
    { subject: '계산', A: 85, fullMark: 100 },
    { subject: '이해', A: 92, fullMark: 100 },
    { subject: '추론', A: 78, fullMark: 100 },
    { subject: '문제해결', A: 88, fullMark: 100 },
    { subject: '응용', A: 82, fullMark: 100 },
];

const recentMilestones = [
    { id: 1, title: '이차방정식 마스터', date: '2026.02.05', type: 'achievement' },
    { id: 2, title: '주간 테스트 상위 5%', date: '2026.02.03', type: 'rank' },
    { id: 3, title: '연속 10일 학습 달성', date: '2026.02.01', type: 'streak' },
];

// ============================================================================
// Components
// ============================================================================

export default function parentReportPage() {
    return (
        <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans pb-20">
            {/* 1. Navigation Header (Apple Style) */}
            <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#D2D2D7]/30 px-6 py-4">
                <div className="max-w-xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white">
                            <Star size={18} fill="currentColor" />
                        </div>
                        <span className="font-bold text-lg tracking-tight">과사람 Growth</span>
                    </div>
                    <button className="p-2 rounded-full hover:bg-[#F5F5F7] transition-colors">
                        <MessageSquare size={20} className="text-[#86868B]" />
                    </button>
                </div>
            </header>

            <main className="max-w-xl mx-auto p-6 space-y-8">
                {/* 2. Student Hero Section */}
                <section className="text-center space-y-2 py-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-24 h-24 rounded-full bg-white shadow-2xl mx-auto mb-6 flex items-center justify-center p-1 border-4 border-indigo-100"
                    >
                        <div className="w-full h-full rounded-full bg-[#F5F5F7] flex items-center justify-center text-3xl font-bold text-indigo-500">
                            김
                        </div>
                    </motion.div>
                    <h1 className="text-3xl font-black tracking-tight">안녕하세요, <span className="text-indigo-600">김정우</span> 학생</h1>
                    <p className="text-[#86868B] text-sm font-medium">정우님의 지능형 학습 리포트입니다.</p>
                </section>

                {/* 3. Skill Radar Card */}
                <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-[#D2D2D7]/20">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-xl font-bold tracking-tight">학습 밸런스</h2>
                            <p className="text-[13px] text-[#86868B] font-medium mt-0.5">5가지 핵심 역량 분석</p>
                        </div>
                        <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-500">
                            <Target size={20} />
                        </div>
                    </div>

                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={growthData}>
                                <PolarGrid stroke="#E5E5E7" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#86868B', fontSize: 11, fontWeight: 600 }} />
                                <Radar
                                    name="Current"
                                    dataKey="A"
                                    stroke="#4F46E5"
                                    strokeWidth={3}
                                    fill="#4F46E5"
                                    fillOpacity={0.15}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mt-8 p-6 rounded-3xl bg-[#F5F5F7] space-y-4">
                        <div className="flex items-start gap-4">
                            <div className="p-2 rounded-xl bg-white text-emerald-500 shadow-sm">
                                <TrendingUp size={18} />
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-sm font-bold">도드라지는 강점</h4>
                                <p className="text-[13px] text-[#424245] leading-relaxed">
                                    <span className="font-bold text-indigo-600">추론력</span>이 지난 달 대비 15% 상승했습니다. 어려운 문제의 핵심 원리를 파악하는 능력이 매우 뛰어납니다.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 4. AI Feedback Section */}
                <section className="bg-indigo-600 rounded-[2.5rem] p-8 shadow-xl text-white relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-400/20 rounded-full blur-3xl" />

                    <div className="relative z-10 space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-white/20 backdrop-blur-md">
                                <Zap size={20} fill="white" />
                            </div>
                            <h3 className="text-lg font-bold">AI 맞춤형 학습 제언</h3>
                        </div>
                        <p className="text-[#E0E7FF] text-sm leading-relaxed font-medium">
                            &quot;정우님은 현재 고난도 문항에 대한 두려움이 없는 상태입니다. 단, <span className="text-white font-bold underline underline-offset-4 decoration-indigo-300">복잡한 연산 과정에서의 실수</span>를 방지하기 위해 매일 5문제의 &apos;Zero-Mistake&apos; 훈련을 권장합니다.&quot;
                        </p>
                        <button className="w-full py-4 bg-white text-indigo-600 rounded-2xl font-bold text-sm shadow-lg active:scale-[0.98] transition-all">
                            정우님을 위한 맞춤 문제지 받기
                        </button>
                    </div>
                </section>

                {/* 5. Recent Achievements */}
                <section className="space-y-4">
                    <h3 className="text-sm font-bold text-[#86868B] uppercase tracking-widest pl-2">최근 학습 성과</h3>
                    <div className="space-y-3">
                        {recentMilestones.map((m) => (
                            <div key={m.id} className="bg-white rounded-3xl p-5 flex items-center justify-between border border-[#D2D2D7]/20 shadow-sm hover:shadow-md transition-all cursor-pointer group">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-2xl ${m.type === 'achievement' ? 'bg-amber-50 text-amber-500' :
                                            m.type === 'rank' ? 'bg-indigo-50 text-indigo-500' : 'bg-rose-50 text-rose-500'
                                        }`}>
                                        {m.type === 'achievement' ? <Award size={20} /> : <Calendar size={20} />}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold">{m.title}</h4>
                                        <p className="text-[11px] text-[#86868B] font-medium">{m.date}</p>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-[#D2D2D7] group-hover:text-[#86868B] transition-colors" />
                            </div>
                        ))}
                    </div>
                </section>

                {/* 6. Contact Section */}
                <section className="bg-white rounded-[2rem] p-6 flex items-center justify-between shadow-sm border border-[#D2D2D7]/20">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-[#F5F5F7] text-indigo-500">
                            <Heart size={20} fill="currentColor" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold">학습 고민이 있으신가요?</h4>
                            <p className="text-[11px] text-[#86868B] font-medium">선생님과 실시간으로 대화해보세요.</p>
                        </div>
                    </div>
                    <button className="px-5 py-2.5 bg-indigo-50 text-indigo-600 text-[13px] font-bold rounded-full hover:bg-indigo-100 transition-colors">
                        상담 시작
                    </button>
                </section>
            </main>
        </div>
    );
}
