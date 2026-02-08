'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    BrainCircuit,
    Target,
    TrendingUp,
    Lightbulb,
    Files,
    Printer,
    UserCheck
} from 'lucide-react';
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    ResponsiveContainer
} from 'recharts';

interface StudentAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: {
        student: string;
        unit: string;
        score: number;
    } | null;
}

// Mock Radar Data for 5 Core Competencies
const radarData = [
    { subject: '이해력', A: 120, fullMark: 150 },
    { subject: '계산력', A: 98, fullMark: 150 },
    { subject: '추론력', A: 86, fullMark: 150 },
    { subject: '문제해결', A: 99, fullMark: 150 },
    { subject: '응용력', A: 85, fullMark: 150 },
];

export function StudentAnalysisModal({ isOpen, onClose, data }: StudentAnalysisModalProps) {
    if (!data) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[100]"
                    />

                    {/* Modal Content */}
                    <div className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
                            className="bg-zinc-950 border border-indigo-500/30 rounded-2xl shadow-2xl w-full max-w-4xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-zinc-900/50">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                        <span className="text-lg font-bold text-indigo-400">{data.student[0]}</span>
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                            {data.student}
                                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-400 font-medium animate-pulse">
                                                AI 정밀 진단 중
                                            </span>
                                        </h2>
                                        <div className="flex items-center gap-2 text-sm text-zinc-400 mt-1">
                                            <span>{data.unit}</span>
                                            <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                            <span className="text-indigo-400 font-semibold">숙련도 {data.score}%</span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Body - Bento Grid */}
                            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto custom-scrollbar">

                                {/* 1. Radar Chart (Left Col) */}
                                <div className="md:col-span-1 bg-zinc-900/40 border border-white/5 rounded-xl p-4 flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                                            <Target className="w-4 h-4 text-emerald-400" />
                                            5대 수학 역량 분석
                                        </h3>
                                        <div className="h-[250px] w-full -ml-4">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                                    <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                                    <PolarAngleAxis
                                                        dataKey="subject"
                                                        tick={{ fill: '#a1a1aa', fontSize: 11 }}
                                                    />
                                                    <Radar
                                                        name={data.student}
                                                        dataKey="A"
                                                        stroke="#818cf8"
                                                        strokeWidth={2}
                                                        fill="#818cf8"
                                                        fillOpacity={0.3}
                                                    />
                                                </RadarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                    <div className="mt-4 p-3 bg-indigo-500/5 rounded-lg border border-indigo-500/10">
                                        <p className="text-xs text-indigo-300 leading-relaxed text-center">
                                            &quot;평균 대비 <strong>이해력</strong>이 우수하나, <br /><strong>응용력</strong> 보완이 필요합니다.&quot;
                                        </p>
                                    </div>
                                </div>

                                {/* 2. Right Column (Details) */}
                                <div className="md:col-span-2 space-y-6">
                                    {/* Weakness Analysis */}
                                    <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-5">
                                        <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                                            <BrainCircuit className="w-4 h-4 text-rose-400" />
                                            AI 취약 포인트 진단
                                        </h3>
                                        <div className="space-y-3">
                                            <div className="flex items-start gap-3 p-3 bg-rose-500/5 border border-rose-500/10 rounded-lg">
                                                <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                                                <p className="text-sm text-zinc-300 leading-relaxed">
                                                    <span className="text-rose-400 font-medium">개념 혼동 감지:</span> 로그 함수의 밑 조건(a{'>'}0, a≠1)에 대한 개념 적용이 불안정합니다. 관련 필수 예제 풀이를 권장합니다.
                                                </p>
                                            </div>
                                            <div className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                                                <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                                                <p className="text-sm text-zinc-300 leading-relaxed">
                                                    <span className="text-amber-400 font-medium">연산 실수:</span> 복잡한 지수 계산 과정에서 부호 실수가 반복적으로 관측됩니다.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Learning Trajectory */}
                                    <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-5">
                                        <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-blue-400" />
                                            학습 제안
                                        </h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 bg-zinc-900 rounded-lg border border-white/5 hover:border-indigo-500/30 transition-colors cursor-pointer group">
                                                <div className="text-xs text-zinc-500 mb-1 group-hover:text-indigo-400 transition-colors">추천 문제집</div>
                                                <div className="text-sm text-white font-medium flex items-center gap-2">
                                                    <Files className="w-3.5 h-3.5" />
                                                    개념원리 RPM 심화
                                                </div>
                                            </div>
                                            <div className="p-3 bg-zinc-900 rounded-lg border border-white/5 hover:border-emerald-500/30 transition-colors cursor-pointer group">
                                                <div className="text-xs text-zinc-500 mb-1 group-hover:text-emerald-400 transition-colors">클리닉 테마</div>
                                                <div className="text-sm text-white font-medium flex items-center gap-2">
                                                    <Lightbulb className="w-3.5 h-3.5" />
                                                    로그함수 그래프 개형
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer - Quick Actions */}
                            <div className="p-6 border-t border-white/5 bg-zinc-900/80 flex items-center justify-between">
                                <span className="text-xs text-zinc-500">
                                    데이터 업데이트: 2024.03.14 14:00 (실시간)
                                </span>
                                <div className="flex gap-3">
                                    <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors border border-white/5">
                                        <Printer className="w-4 h-4" />
                                        상세 리포트 출력
                                    </button>
                                    <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40">
                                        <UserCheck className="w-4 h-4" />
                                        클리닉 배정하기
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
