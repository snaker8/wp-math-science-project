'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
    FileText,
    Download,
    Printer,
    ChevronLeft,
    Share2,
    TrendingUp,
    Target,
    Award,
    PieChart as PieChartIcon,
    ArrowRight,
    Zap,
    Clock
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { GlowCard } from '@/components/shared/GlowCard';

// ============================================================================
// Mock Data
// ============================================================================

const skillData = [
    { subject: '계산력', A: 120, B: 110, fullMark: 150 },
    { subject: '이해력', A: 98, B: 130, fullMark: 150 },
    { subject: '추론력', A: 86, B: 130, fullMark: 150 },
    { subject: '문제해결', A: 99, B: 100, fullMark: 150 },
    { subject: '응용력', A: 85, B: 90, fullMark: 150 },
];

const distributionData = [
    { name: '상위 10%', value: 3, color: '#818cf8' },
    { name: '10-30%', value: 5, color: '#6366f1' },
    { name: '30-70%', value: 6, color: '#4f46e5' },
    { name: '하위 30%', value: 1, color: '#3730a3' },
];

// ============================================================================
// Components
// ============================================================================

export default function SessionReportPage() {
    return (
        <div className="min-h-screen bg-black text-white p-6 space-y-8 print:p-0 print:bg-white print:text-black">
            {/* 1. Action Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/5 print:hidden">
                <button className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm font-medium">
                    <ChevronLeft size={16} /> 대시보드로 돌아가기
                </button>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs font-bold text-zinc-400 hover:text-white transition-all flex items-center gap-2">
                        <Share2 size={14} /> 공유하기
                    </button>
                    <button onClick={() => window.print()} className="px-6 py-2 bg-white text-black rounded-xl text-xs font-bold hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all flex items-center gap-2">
                        <Printer size={14} /> PDF 리포트 출력
                    </button>
                </div>
            </div>

            {/* 2. Main Report Container */}
            <div className="max-w-5xl mx-auto space-y-10 py-4">

                {/* A. Report Title & Meta */}
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 tracking-tighter uppercase">
                        Final Session Analysis Report
                    </div>
                    <h1 className="text-5xl font-black tracking-tight">2026 1학기 중간고사 대비 모의고사 A</h1>
                    <div className="flex items-center justify-center gap-6 text-zinc-500 text-sm font-medium">
                        <span className="flex items-center gap-2"><Target size={14} /> 고1 의대반 A</span>
                        <span className="w-1 h-1 rounded-full bg-zinc-800" />
                        <span className="flex items-center gap-2"><Clock size={14} /> 2026.02.07 19:00 - 20:30</span>
                    </div>
                </div>

                {/* B. Key Metrics Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <GlowCard className="text-center py-10 border-white/5">
                        <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-2">평균 성취도</div>
                        <div className="text-4xl font-black text-indigo-400 mb-1">82.4%</div>
                        <div className="text-[10px] text-emerald-400 font-bold flex items-center justify-center gap-1">
                            <TrendingUp size={10} /> 지난 세션 대비 +4.2%
                        </div>
                    </GlowCard>
                    <GlowCard className="text-center py-10 border-white/5">
                        <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-2">최고 득점</div>
                        <div className="text-4xl font-black text-white mb-1">100 / 100</div>
                        <div className="text-[10px] text-zinc-600 font-bold">김정우 학생 외 2명</div>
                    </GlowCard>
                    <GlowCard className="text-center py-10 border-white/5">
                        <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-2">집중 모니터링</div>
                        <div className="text-4xl font-black text-rose-400 mb-1">2 <span className="text-lg">명</span></div>
                        <div className="text-[10px] text-rose-400/60 font-bold tracking-tighter uppercase">Needs Immediate Clinic</div>
                    </GlowCard>
                </div>

                {/* C. Detailed Analysis Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                    {/* 1. Skill Analysis (Radar) */}
                    <GlowCard className="border-white/5">
                        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                            <Zap size={16} className="text-amber-400" /> 세션 종합 역량 분석
                        </h3>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={skillData}>
                                    <PolarGrid stroke="#27272a" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 10, fontWeight: 700 }} />
                                    <Radar
                                        name="Class Avg"
                                        dataKey="A"
                                        stroke="#6366f1"
                                        fill="#6366f1"
                                        fillOpacity={0.5}
                                    />
                                    <Radar
                                        name="Top 10%"
                                        dataKey="B"
                                        stroke="#fbbf24"
                                        fill="#fbbf24"
                                        fillOpacity={0.2}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </GlowCard>

                    {/* 2. Grade Distribution (Pie) */}
                    <GlowCard className="border-white/5">
                        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                            <PieChartIcon size={16} className="text-indigo-400" /> 성취도 분포 현황
                        </h3>
                        <div className="h-[300px] w-full flex items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={distributionData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {distributionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#000', border: '1px solid #27272a', borderRadius: '8px', fontSize: '10px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute flex flex-col items-center">
                                <div className="text-2xl font-black text-white">15</div>
                                <div className="text-[8px] font-bold text-zinc-600 uppercase">Students</div>
                            </div>
                        </div>
                    </GlowCard>

                </div>

                {/* D. AI Insights Panel */}
                <GlowCard className="bg-gradient-to-br from-indigo-500/10 via-black to-black border-indigo-500/20 p-10">
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        <div className="flex-shrink-0 p-4 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/20">
                            <Award size={32} />
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                AI 학습 처방 가이드
                                <span className="text-xs font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10">PREMIUM</span>
                            </h3>
                            <p className="text-zinc-400 text-sm leading-relaxed max-w-2xl">
                                이번 세션에서는 **&apos;추론력&apos;** 파트의 정답률이 도드라지게 높았으나, **&apos;계산력&apos;** 부분에서 실수가 다수 발견되었습니다.
                                다음 세션 전까지 <span className="text-indigo-400">계산 연습 30제</span>를 과제로 할당하고, 상위 10% 학생들에게는
                                <span className="text-amber-400">C-Level 고난도 기하</span> 문항을 추천합니다.
                            </p>
                            <div className="flex gap-4 pt-4">
                                <button className="flex items-center gap-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 rounded-xl transition-all">
                                    추천 과제 할당 <ArrowRight size={14} />
                                </button>
                                <button className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900 border border-white/5 px-5 py-2.5 rounded-xl transition-all">
                                    오답 노트 생성
                                </button>
                            </div>
                        </div>
                    </div>
                </GlowCard>
            </div>

            {/* 3. Branding Footer (Print Only) */}
            <div className="hidden print:flex flex-col items-center pt-20 border-t border-zinc-200">
                <div className="text-lg font-black text-black mb-2">과사람 : With-People</div>
                <div className="text-[10px] text-zinc-500">본 리포트는 과사람 AI 분석 엔진에 의해 생성되었습니다.</div>
            </div>
        </div>
    );
}
