'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity,
    Users,
    CheckCircle2,
    AlertCircle,
    Clock,
    Zap,
    MoreHorizontal,
    Search,
    Filter,
    ArrowUpRight,
    Trophy,
    MessageCircle
} from 'lucide-react';
import { GlowCard } from '@/components/shared/GlowCard';

// ============================================================================
// Types & Mock Data
// ============================================================================

interface StudentRealtime {
    id: string;
    name: string;
    status: 'solving' | 'completed' | 'blocked' | 'idle';
    progress: number;
    score: number;
    lastActive: string;
    currentProblem: number;
    alerts?: string[];
}

const mockStudents: StudentRealtime[] = [
    { id: '1', name: '김정우', status: 'solving', progress: 65, score: 78, lastActive: '방금 전', currentProblem: 12 },
    { id: '2', name: '이민지', status: 'completed', progress: 100, score: 92, lastActive: '2분 전', currentProblem: 20 },
    { id: '3', name: '박하늘', status: 'blocked', progress: 40, score: 35, lastActive: '방금 전', currentProblem: 8, alerts: ['오답 3회 연속', '풀이 시간 초과'] },
    { id: '4', name: '최서윤', status: 'solving', progress: 85, score: 88, lastActive: '방금 전', currentProblem: 17 },
    { id: '5', name: '정동현', status: 'idle', progress: 10, score: 0, lastActive: '5분 전', currentProblem: 2 },
];

// ============================================================================
// Components
// ============================================================================

const StatusBadge = ({ status }: { status: StudentRealtime['status'] }) => {
    const configs = {
        solving: { color: 'text-indigo-400', bg: 'bg-indigo-500/10', label: '풀이 중', icon: Activity },
        completed: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '완료', icon: CheckCircle2 },
        blocked: { color: 'text-rose-400', bg: 'bg-rose-500/10', label: '도움 필요', icon: AlertCircle },
        idle: { color: 'text-zinc-500', bg: 'bg-zinc-800', label: '대기', icon: Clock },
    };
    const config = configs[status];
    return (
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border border-white/5 ${config.bg} ${config.color}`}>
            <config.icon size={10} />
            {config.label}
        </div>
    );
};

export default function MonitorPage() {
    return (
        <div className="min-h-screen bg-black text-white p-6 space-y-8">
            {/* 1. Header Section */}
            <div className="flex items-end justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 px-2 rounded bg-rose-500/10 border border-rose-500/20 text-[10px] font-bold text-rose-400 tracking-tighter uppercase">
                            Live Session
                        </div>
                        <span className="text-zinc-500 text-xs font-medium uppercase tracking-widest">Real-time Class Monitor</span>
                    </div>
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">
                        실시간 클래스 모니터
                    </h1>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4 text-right">
                        <div>
                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">Current Class</div>
                            <div className="text-sm font-bold text-white">고1 의대반 A</div>
                        </div>
                        <div className="w-[1px] h-8 bg-white/10" />
                        <div>
                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">Active Students</div>
                            <div className="text-sm font-bold text-white">12 / 15</div>
                        </div>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-[0_0_20px_rgba(225,29,72,0.3)] transition-all">
                        <Zap size={14} /> 세션 종료
                    </button>
                </div>
            </div>

            {/* 2. Top Stats Bento */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <GlowCard className="bg-indigo-500/5 border-indigo-500/10">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                            <Activity size={18} />
                        </div>
                        <span className="text-[10px] text-zinc-500 font-bold uppercase transition-colors">Avg. Pace</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">1.2m <span className="text-xs font-normal text-zinc-500">/ prob</span></div>
                    <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                        <ArrowUpRight size={10} /> 8% Faster than goal
                    </div>
                </GlowCard>

                <GlowCard className="bg-emerald-500/5 border-emerald-500/10">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                            <CheckCircle2 size={18} />
                        </div>
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Success Rate</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">78.5%</div>
                    <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                        <ArrowUpRight size={10} /> +2.1% from last week
                    </div>
                </GlowCard>

                <GlowCard className="bg-rose-500/5 border-rose-500/10">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
                            <AlertCircle size={18} />
                        </div>
                        <span className="text-[10px] text-zinc-500 font-bold uppercase transition-colors">Interventions</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">3 <span className="text-xs font-normal text-zinc-500">Students</span></div>
                    <div className="text-[10px] text-rose-400 font-bold">Action Required immediately</div>
                </GlowCard>

                <GlowCard className="bg-amber-500/5 border-amber-500/10">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                            <Trophy size={18} />
                        </div>
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Class Score</span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">842 <span className="text-xs font-normal text-zinc-500">Pts</span></div>
                    <div className="text-[10px] text-amber-400 font-bold">New High Score Potential</div>
                </GlowCard>
            </div>

            {/* 3. Real-time Student Grid */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        <Users size={16} className="text-indigo-400" />
                        학생별 실시간 현황
                    </h3>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={14} />
                            <input
                                type="text"
                                placeholder="학생 이름 검색..."
                                className="bg-zinc-900/50 border border-white/5 rounded-lg py-1.5 pl-9 pr-4 text-xs focus:outline-none focus:border-white/10 w-48"
                            />
                        </div>
                        <button className="p-2 rounded-lg bg-zinc-900 border border-white/5 text-zinc-500 hover:text-white">
                            <Filter size={14} />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence>
                        {mockStudents.map((student) => (
                            <motion.div
                                key={student.id}
                                layout
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                whileHover={{ y: -4 }}
                                className={`
                                    relative p-5 rounded-2xl border transition-all cursor-pointer backdrop-blur-md
                                    ${student.status === 'blocked'
                                        ? 'bg-rose-500/10 border-rose-500/30'
                                        : 'bg-zinc-900/40 border-white/5 hover:border-white/20'}
                                `}
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 flex items-center justify-center font-bold text-zinc-400">
                                            {student.name[0]}
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-white">{student.name}</div>
                                            <div className="text-[10px] text-zinc-500 font-medium">Last active: {student.lastActive}</div>
                                        </div>
                                    </div>
                                    <StatusBadge status={student.status} />
                                </div>

                                <div className="space-y-4">
                                    {/* Progress Bar */}
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
                                            <span className="text-zinc-500">Progress</span>
                                            <span className="text-white">{student.progress}%</span>
                                        </div>
                                        <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${student.progress}%` }}
                                                className={`h-full rounded-full ${student.status === 'blocked' ? 'bg-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.5)]' : 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]'
                                                    }`}
                                            />
                                        </div>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                                            <div className="text-[9px] font-bold text-zinc-600 uppercase mb-1">Current</div>
                                            <div className="text-xs font-bold text-zinc-300"># {student.currentProblem} <span className="text-[9px] font-normal text-zinc-600">Problem</span></div>
                                        </div>
                                        <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                                            <div className="text-[9px] font-bold text-zinc-600 uppercase mb-1">Score</div>
                                            <div className="text-xs font-bold text-zinc-300">{student.score} <span className="text-[9px] font-normal text-zinc-600">Points</span></div>
                                        </div>
                                    </div>

                                    {/* Alerts / Actions */}
                                    {student.alerts && (
                                        <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/20 space-y-1">
                                            {student.alerts.map((alert, idx) => (
                                                <div key={idx} className="flex items-center gap-2 text-[10px] font-bold text-rose-400">
                                                    <div className="w-1 h-1 rounded-full bg-rose-500" />
                                                    {alert}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="pt-2 flex items-center justify-between">
                                        <button className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 hover:text-white transition-colors">
                                            <MessageCircle size={12} /> 상담 메시지
                                        </button>
                                        <button className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                                            학습 상세 <ArrowUpRight size={12} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
