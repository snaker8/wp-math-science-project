'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend
} from 'recharts';
import {
    Clock,
    Calendar,
    TrendingUp,
    Award,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    XCircle,
    BrainCircuit,
    User,
    GraduationCap,
    School
} from 'lucide-react';
import { GlowCard } from '@/components/shared/GlowCard';
import {
    growthTrendData,
    competencyData,
    mockHistoryTimeline,
    mockStudentProfile,
    HistoryEvent
} from '@/lib/mock-data';

// ============================================================================
// Components
// ============================================================================

const TimelineEvent = ({ event, index }: { event: HistoryEvent; index: number }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="pl-8 relative border-l border-white/10 pb-8 last:pb-0 group"
        >
            {/* Timeline Node */}
            <div className={`absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full border border-black transition-all duration-300 ${event.badge === 'Mastered' ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' :
                    event.badge === 'Passing' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' :
                        'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'
                }`} />

            {/* Event Card */}
            <motion.div
                layout
                onClick={() => setIsExpanded(!isExpanded)}
                className={`cursor-pointer rounded-2xl border ${isExpanded ? 'bg-zinc-900/80 border-indigo-500/30' : 'bg-zinc-900/30 border-white/5 hover:border-white/10'} overflow-hidden transition-colors`}
            >
                <div className="p-4 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{event.date}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${event.badge === 'Mastered' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                    event.badge === 'Passing' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                        'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                }`}>
                                {event.badge.toUpperCase()}
                            </span>
                        </div>
                        <h3 className="text-sm font-bold text-white mb-1">{event.examName}</h3>
                        <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">
                            {event.score}<span className="text-xs text-zinc-600 font-medium ml-1">점</span>
                        </div>
                    </div>
                    <div className="text-zinc-500">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                </div>

                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-black/20 border-t border-white/5"
                        >
                            <div className="p-4 space-y-4">
                                {event.weakness.length > 0 && (
                                    <div>
                                        <div className="text-[10px] text-zinc-500 font-bold uppercase mb-2">Weakness Detected</div>
                                        <div className="flex flex-wrap gap-2">
                                            {event.weakness.map((w, i) => (
                                                <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold">
                                                    <AlertCircle size={12} /> {w}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div className="text-[10px] text-zinc-500 font-bold uppercase mb-2 flex items-center gap-2">
                                        <BrainCircuit size={12} className="text-indigo-400" /> AI Analysis
                                    </div>
                                    <p className="text-xs text-zinc-300 leading-relaxed bg-indigo-500/5 p-3 rounded-lg border border-indigo-500/10">
                                        {event.aiComment}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
};

export default function StudentHistoryPage({ params }: { params: { id: string } }) {
    return (
        <div className="min-h-screen bg-black text-white p-6 space-y-8">
            {/* 1. Header & Profile */}
            <div className="flex items-end justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 px-2 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 tracking-tighter uppercase">
                            Admin Console
                        </div>
                        <span className="text-zinc-500 text-xs font-medium uppercase tracking-widest">Student Management</span>
                    </div>
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">
                        학습 히스토리
                    </h1>
                </div>
            </div>

            {/* Profile Summary */}
            <GlowCard className="bg-zinc-900/30 border-white/5 p-0 overflow-hidden">
                <div className="p-6 flex items-center gap-8">
                    <div className={`w-20 h-20 rounded-2xl ${mockStudentProfile.avatar} flex items-center justify-center text-3xl font-bold shadow-2xl shadow-indigo-500/20`}>
                        {mockStudentProfile.name[0]}
                    </div>
                    <div className="flex-1 grid grid-cols-3 gap-8">
                        <div>
                            <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1 flex items-center gap-2">
                                <User size={12} /> Student Name
                            </div>
                            <div className="text-2xl font-bold text-white">{mockStudentProfile.name}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1 flex items-center gap-2">
                                <School size={12} /> School / Grade
                            </div>
                            <div className="text-xl font-bold text-zinc-300">{mockStudentProfile.school} <span className="text-zinc-600">|</span> {mockStudentProfile.grade}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1 flex items-center gap-2">
                                <Clock size={12} /> Total Learning Time
                            </div>
                            <div className="text-2xl font-bold text-indigo-400">{mockStudentProfile.totalLearningTime}</div>
                        </div>
                    </div>
                </div>
            </GlowCard>

            <div className="grid grid-cols-12 gap-8">
                {/* Left Column: Visualizations */}
                <div className="col-span-12 lg:col-span-8 space-y-8">
                    {/* Achievement Trend */}
                    <div className="p-6 rounded-3xl bg-zinc-900/30 border border-white/5 backdrop-blur-sm relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                        <div className="flex items-center justify-between mb-8 relative z-10">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <TrendingUp size={18} className="text-indigo-400" /> Achievement Trend
                                </h3>
                                <p className="text-xs text-zinc-500 mt-1">Monthly performance analysis over the last 6 months</p>
                            </div>
                        </div>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={growthTrendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                                    <XAxis
                                        dataKey="month"
                                        stroke="#52525b"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                    />
                                    <YAxis
                                        stroke="#52525b"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        domain={[0, 100]}
                                    />
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px' }}
                                        itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="studentScore"
                                        stroke="#6366f1"
                                        strokeWidth={3}
                                        dot={{ fill: '#6366f1', r: 4, strokeWidth: 0 }}
                                        activeDot={{ r: 6, stroke: '#818cf8', strokeWidth: 2 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="averageScore"
                                        stroke="#3f3f46"
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={false}
                                        activeDot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Competency Radar */}
                    <div className="grid grid-cols-2 gap-8">
                        <div className="p-6 rounded-3xl bg-zinc-900/30 border border-white/5 backdrop-blur-sm relative overflow-hidden flex flex-col justify-center items-center">
                            <div className="w-full mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Award size={18} className="text-emerald-400" /> Core Competencies
                                </h3>
                            </div>
                            <div className="h-[250px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={competencyData}>
                                        <PolarGrid stroke="#27272a" />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 10, fontWeight: 'bold' }} />
                                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                        <Radar
                                            name="Student"
                                            dataKey="value"
                                            stroke="#10b981"
                                            strokeWidth={2}
                                            fill="#10b981"
                                            fillOpacity={0.2}
                                        />
                                        <RechartsTooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px' }} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="p-6 rounded-3xl bg-zinc-900/30 border border-white/5 backdrop-blur-sm">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <BrainCircuit size={18} className="text-rose-400" /> Weakness Analysis
                            </h3>
                            <div className="space-y-3">
                                {['삼각함수 미분', '공간도형의 방정식', '확률분포'].map((item, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                                        <span className="text-sm font-medium text-zinc-300">{item}</span>
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">Critical</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-6 pt-6 border-t border-white/5">
                                <p className="text-xs text-zinc-500 leading-relaxed">
                                    최근 3개월간 기하와 미적분 영역에서 오답률이 상승하고 있습니다.
                                    특히 공간지각 관련 문항에서 취약점이 발견되었습니다.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Timeline */}
                <div className="col-span-12 lg:col-span-4">
                    <div className="sticky top-6">
                        <div className="flex items-center gap-2 mb-6">
                            <div className="p-2 rounded-lg bg-zinc-800 text-white">
                                <Calendar size={16} />
                            </div>
                            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">Mastery Timeline</h2>
                        </div>

                        <div className="space-y-0">
                            {mockHistoryTimeline.map((event, index) => (
                                <TimelineEvent key={event.id} event={event} index={index} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
