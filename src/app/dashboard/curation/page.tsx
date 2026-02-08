'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles,
    Settings,
    MoreHorizontal,
    TrendingUp,
    Users,
    Layers,
    RefreshCw,
    CheckCircle2,
    Clock,
    PlayCircle,
    ChevronRight,
    ArrowUpRight,
    Database,
    Zap
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { GlowCard } from '@/components/shared/GlowCard';

// ============================================================================
// Mock Data
// ============================================================================

const groupStats = [
    { id: 1, name: '심화 (Advanced)', count: 12, status: 'active', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { id: 2, name: '보충 (Supplementary)', count: 28, status: 'active', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { id: 3, name: '재시험 (Retake)', count: 5, status: 'pending', color: 'text-amber-400', bg: 'bg-amber-500/10' },
];

const curatedSets = [
    {
        id: 1,
        title: '2026 1학기 중간고사 대비 - 심화',
        target: '심화 그룹',
        problemCount: 25,
        status: 'pending',
        thumbnail: 'f(x) = \\lim_{n \\to \\infty} \\frac{x^{2n}}{1+x^{2n}}'
    },
    {
        id: 2,
        title: '함수의 극한 - 기초 다지기',
        target: '보충 그룹',
        problemCount: 15,
        status: 'ready',
        thumbnail: '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'
    }
];

const analyticsData = [
    { name: '1주', score: 65 },
    { name: '2주', score: 72 },
    { name: '3주', score: 78 },
    { name: '4주', score: 85 },
    { name: '예측', score: 92 },
];

// ============================================================================
// Helper Components
// ============================================================================

function StatusToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
            <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{label}</span>
            <button
                onClick={onToggle}
                className={`w-9 h-5 rounded-full p-1 transition-colors duration-300 ${active ? 'bg-indigo-600' : 'bg-zinc-800'}`}
            >
                <div className={`w-3 h-3 rounded-full bg-white transition-transform duration-300 ${active ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
        </div>
    );
}

// ============================================================================
// Page Component
// ============================================================================

export default function CurationPage() {
    const [autoCreate, setAutoCreate] = useState(true);
    const [isRunning, setIsRunning] = useState(false);

    const handleRunNow = () => {
        setIsRunning(true);
        setTimeout(() => setIsRunning(false), 3000);
    };

    return (
        <div className="min-h-screen bg-black text-white p-6 space-y-8">
            {/* 1. Header Section */}
            <div className="flex items-end justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 px-2 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 tracking-tighter uppercase">
                            AI Automation
                        </div>
                        <span className="text-zinc-500 text-xs font-medium uppercase tracking-widest">v2.0 Beta</span>
                    </div>
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">
                        AI 자동큐레이션
                    </h1>
                </div>
                <div className="flex gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold rounded-lg border border-white/10 transition-all text-zinc-400 hover:text-white">
                        <Clock size={14} /> 히스토리
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold rounded-lg border border-white/10 transition-all text-zinc-400 hover:text-white">
                        <Settings size={14} /> 설정전환
                    </button>
                </div>
            </div>

            {/* 2. Hero Action: Run Now */}
            <GlowCard className="bg-gradient-to-br from-indigo-500/10 via-black to-black border-indigo-500/20 py-12">
                <div className="flex flex-col items-center justify-center text-center space-y-6">
                    <div className="relative">
                        <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full" />
                        <motion.button
                            onClick={handleRunNow}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            disabled={isRunning}
                            className={`
                                relative flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg transition-all
                                ${isRunning
                                    ? 'bg-zinc-800 text-zinc-500'
                                    : 'bg-white text-black hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]'}
                            `}
                        >
                            {isRunning ? (
                                <>
                                    <RefreshCw size={20} className="animate-spin" />
                                    큐레이션 엔진 가동 중...
                                </>
                            ) : (
                                <>
                                    <PlayCircle size={20} />
                                    지능형 큐레이션 즉시 실행
                                </>
                            )}
                        </motion.button>
                    </div>
                    <p className="text-zinc-400 text-sm max-w-md">
                        현재 학습 데이터를 실시간으로 분석하여 <span className="text-indigo-400">심화, 보충, 재시험</span> 그룹별
                        최적화된 문항 세트를 자동으로 구성합니다.
                    </p>
                </div>
            </GlowCard>

            {/* 3. Bento Grid Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* A. 스마트 그룹화 현황 */}
                <GlowCard>
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            <Users size={16} className="text-indigo-400" />
                            스마트 그룹화
                        </h3>
                        <ArrowUpRight size={14} className="text-zinc-600" />
                    </div>
                    <div className="space-y-4">
                        {groupStats.map((group) => (
                            <div key={group.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-white/5 group hover:border-white/10 transition-all">
                                <div>
                                    <div className="text-sm font-bold text-white mb-0.5">{group.name}</div>
                                    <div className="text-[10px] text-zinc-500 font-medium">{group.count} Students Active</div>
                                </div>
                                <div className={`px-2 py-1 rounded-md text-[10px] font-bold ${group.bg} ${group.color} border border-white/5`}>
                                    {group.status.toUpperCase()}
                                </div>
                            </div>
                        ))}
                    </div>
                </GlowCard>

                {/* B. 영향도 예측 (Chart) */}
                <GlowCard className="md:col-span-2">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            <TrendingUp size={16} className="text-rose-400" />
                            성취도 향상 예측
                        </h3>
                        <div className="flex items-center gap-4">
                            <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                <Zap size={10} /> +12.4% 기대 성취도
                            </div>
                            <ArrowUpRight size={14} className="text-zinc-600" />
                        </div>
                    </div>
                    <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={analyticsData}>
                                <defs>
                                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#000', border: '1px solid #27272a', borderRadius: '8px', fontSize: '10px' }}
                                />
                                <Area type="monotone" dataKey="score" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorScore)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </GlowCard>

                {/* C. 자동화 컨트롤 */}
                <GlowCard>
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            <Database size={16} className="text-emerald-400" />
                            엔진 설정
                        </h3>
                    </div>
                    <div className="space-y-1">
                        <StatusToggle label="주간 정기 큐레이션" active={autoCreate} onToggle={() => setAutoCreate(!autoCreate)} />
                        <StatusToggle label="난이도 적응형 상향" active={true} onToggle={() => { }} />
                        <StatusToggle label="유사 오답 변형 포함" active={true} onToggle={() => { }} />
                        <StatusToggle label="학부모 리포트 자동 생성" active={false} onToggle={() => { }} />
                    </div>
                </GlowCard>

                {/* D. 추천 문항 세트 리스트 */}
                <GlowCard className="md:col-span-2">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            <Layers size={16} className="text-amber-400" />
                            주간 추천 문제지
                        </h3>
                        <button className="text-[10px] text-zinc-500 hover:text-white font-bold transition-colors">
                            전체 보기
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {curatedSets.map(set => (
                            <div key={set.id} className="relative group bg-zinc-900/30 border border-white/5 rounded-2xl p-4 hover:border-indigo-500/40 transition-all cursor-pointer overflow-hidden">
                                <div className="absolute top-0 right-0 p-3 bg-indigo-500/5 rounded-bl-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ArrowUpRight size={14} className="text-indigo-400" />
                                </div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-[10px] font-bold text-zinc-500 px-2 py-0.5 rounded-full bg-zinc-800 border border-white/5">
                                        {set.target}
                                    </span>
                                    <span className="text-[10px] text-zinc-600 font-medium">{set.problemCount} 문항</span>
                                </div>
                                <h4 className="font-bold text-sm text-white mb-4 line-clamp-1">{set.title}</h4>

                                <div className="p-3 bg-black flex items-center justify-center rounded-xl border border-white/5 mb-4 group-hover:bg-zinc-950 transition-colors">
                                    <MathRenderer content={set.thumbnail} className="text-zinc-400 text-xs" />
                                </div>

                                <div className="flex items-center justify-between pt-1">
                                    <div className={`flex items-center gap-1.5 text-[10px] font-bold ${set.status === 'ready' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        <div className={`w-1 h-1 rounded-full ${set.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                                        {set.status.toUpperCase()}
                                    </div>
                                    <button className="flex items-center gap-1 text-[10px] font-bold text-white bg-indigo-600/80 hover:bg-indigo-600 px-3 py-1.5 rounded-lg transition-all">
                                        검토 및 발행 <ChevronRight size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </GlowCard>

            </div>
        </div>
    );
}
