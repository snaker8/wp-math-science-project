'use client';

import React from 'react';
import {
    BarChart,
    TrendingUp,
    Brain,
    AlertTriangle,
    FileText,
    Printer,
    Share2,
    Calendar,
    ChevronRight,
    Sparkles,
    type LucideIcon,
} from 'lucide-react';

interface KPICardProps {
    title: string;
    value: string;
    subtext: string;
    icon: LucideIcon;
    colorClass: string;
}

interface InsightCardProps {
    type: 'critical' | 'normal';
    title: string;
    description: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtext, icon: Icon, colorClass }) => (
    <div className="flex flex-1 flex-col rounded-2xl border border-warm-border-soft bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
            <div>
                <p className="text-sm font-medium text-warm-text-secondary">{title}</p>
                <h3 className="mt-1 text-2xl font-bold text-warm-text-primary">{value}</h3>
            </div>
            <div className={`rounded-xl p-2.5 ${colorClass} bg-opacity-10`}>
                <Icon className={`h-5 w-5 ${colorClass.replace('bg-', 'text-')}`} />
            </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs">
            <TrendingUp className="h-3 w-3 text-emerald-500" />
            <span className="font-medium text-emerald-600">{subtext}</span>
            <span className="text-warm-text-muted">vs last month</span>
        </div>
    </div>
);

const InsightCard: React.FC<InsightCardProps> = ({ type, title, description }) => {
    const isCritical = type === 'critical';
    return (
        <div className={`rounded-xl border p-4 ${isCritical
                ? 'border-red-100 bg-red-50/50'
                : 'border-warm-border-soft bg-white'
            }`}>
            <div className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-full p-1.5 ${isCritical ? 'bg-red-100 text-red-600' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                    {isCritical ? <AlertTriangle size={14} /> : <Brain size={14} />}
                </div>
                <div>
                    <h4 className={`text-sm font-semibold ${isCritical ? 'text-red-900' : 'text-warm-text-primary'
                        }`}>{title}</h4>
                    <p className={`mt-1 text-xs ${isCritical ? 'text-red-700' : 'text-warm-text-secondary'
                        }`}>{description}</p>
                </div>
            </div>
        </div>
    );
};

export default function AnalyticsPage() {
    return (
        <div className="flex h-full flex-col gap-6 p-6 font-pretendard">
            {/* Header Section */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 text-sm text-warm-text-muted">
                        <span>AI 처방</span>
                        <ChevronRight size={14} />
                        <span className="font-medium text-warm-text-primary">상세 분석 (Clinic Detail)</span>
                    </div>
                    <h1 className="mt-1 text-xl font-bold text-warm-text-primary">김민준 학생 분석 리포트</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 rounded-xl border border-warm-border-soft bg-white px-4 py-2 text-sm font-medium text-warm-text-secondary hover:bg-warm-surface transition-colors">
                        <Share2 size={16} />
                        <span>학부모 공유</span>
                    </button>
                    <button className="flex items-center gap-2 rounded-xl bg-warm-primary px-4 py-2 text-sm font-bold text-white shadow-md shadow-indigo-100 transition-transform hover:-translate-y-0.5">
                        <Printer size={16} />
                        <span>분석지 출력</span>
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="flex gap-4">
                <KPICard
                    title="종합 성취도"
                    value="A Grade"
                    subtext="+12%"
                    icon={BarChart}
                    colorClass="bg-indigo-500 text-indigo-500"
                />
                <KPICard
                    title="취약 유형 해결"
                    value="28/32"
                    subtext="+5"
                    icon={Brain}
                    colorClass="bg-emerald-500 text-emerald-500"
                />
                <KPICard
                    title="필수 학습 시간"
                    value="12.5h"
                    subtext="+2.1h"
                    icon={Calendar}
                    colorClass="bg-amber-500 text-amber-500"
                />
            </div>

            {/* Main Analysis Area */}
            <div className="flex flex-1 gap-6 min-h-0">
                {/* Left: Charts & Visuals */}
                <div className="flex flex-[2] flex-col gap-6">
                    {/* Performance Radar & Trend */}
                    <div className="flex flex-1 gap-4 min-h-[300px]">
                        {/* Radar Chart Placeholder */}
                        <div className="flex-1 rounded-2xl border border-warm-border-soft bg-white p-6 shadow-sm">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="font-bold text-warm-text-primary">Performance DNA</h3>
                                <button className="text-xs text-warm-text-muted hover:text-warm-primary">상세보기</button>
                            </div>
                            <div className="flex h-64 items-center justify-center rounded-xl bg-warm-surface-strong/50 border border-dashed border-warm-border-soft">
                                <span className="text-sm text-warm-text-muted">Radar Chart Visualization Area</span>
                                {/* Implementing Chart.js or Recharts here in production */}
                            </div>
                        </div>

                        {/* Retention Trend */}
                        <div className="flex-1 rounded-2xl border border-warm-border-soft bg-white p-6 shadow-sm">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="font-bold text-warm-text-primary">학습 유지율 (Retention)</h3>
                                <select className="rounded-lg border border-warm-border-soft bg-warm-surface px-2 py-1 text-xs">
                                    <option>최근 6개월</option>
                                </select>
                            </div>
                            <div className="flex h-64 items-center justify-center rounded-xl bg-warm-surface-strong/50 border border-dashed border-warm-border-soft">
                                <span className="text-sm text-warm-text-muted">Line Chart Visualization Area</span>
                            </div>
                        </div>
                    </div>

                    {/* Weakness Heatmap */}
                    <div className="rounded-2xl border border-warm-border-soft bg-white p-6 shadow-sm">
                        <div className="mb-4">
                            <h3 className="font-bold text-warm-text-primary">단원별 취약점 (Weakness Map)</h3>
                            <p className="text-xs text-warm-text-secondary">붉은색 영역이 집중 처방이 필요한 구간입니다.</p>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {['다항식', '방정식', '부등식', '도형의 방정식', '함수', '유리함수', '무리함수', '순열과 조합'].map((topic, i) => (
                                <div key={topic} className={`rounded-lg border p-3 ${i === 1 || i === 4 ? 'bg-red-50 border-red-100' : 'bg-warm-surface border-transparent'
                                    }`}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`text-xs font-semibold ${i === 1 || i === 4 ? 'text-red-700' : 'text-warm-text-secondary'
                                            }`}>{topic}</span>
                                        {(i === 1 || i === 4) && <AlertTriangle size={12} className="text-red-500" />}
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-black/5 overflow-hidden">
                                        <div className={`h-full rounded-full ${i === 1 || i === 4 ? 'bg-red-500 w-[60%]' : 'bg-emerald-500 w-[90%]'
                                            }`} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: AI Insights & Actions */}
                <div className="flex flex-1 flex-col gap-4">
                    {/* AI Insight Panel */}
                    <div className="rounded-2xl border border-warm-border-soft bg-white/60 p-5 shadow-sm backdrop-blur-md">
                        <div className="mb-4 flex items-center gap-2">
                            <Sparkles className="text-indigo-500" size={18} />
                            <h3 className="font-bold text-warm-text-primary">AI 학습 인사이트</h3>
                        </div>
                        <div className="flex flex-col gap-3">
                            <InsightCard
                                type="critical"
                                title="이차방정식 개념 흔들림"
                                description="최근 풀이에서 판별식(D) 활용 오류가 3회 반복되었습니다. 개념 재학습이 시급합니다."
                            />
                            <InsightCard
                                type="normal"
                                title="기하 영역 재능 발견"
                                description="도형의 이동 단원 정답률이 상위 5%에 해당합니다. 심화 문제 추천을 고려하세요."
                            />
                        </div>
                    </div>

                    {/* Prescription Actions */}
                    <div className="flex flex-1 flex-col rounded-2xl border border-warm-border-soft bg-white p-5 shadow-sm">
                        <h3 className="mb-4 font-bold text-warm-text-primary">추천 처방 액션</h3>
                        <div className="space-y-3">
                            <button className="flex w-full items-center justify-between rounded-xl bg-warm-surface p-3 transition-colors hover:bg-warm-surface-strong">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
                                        <FileText size={20} className="text-indigo-500" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-semibold text-warm-text-primary">맞춤 클리닉지 생성</p>
                                        <p className="text-xs text-warm-text-muted">취약점 기반 12문제</p>
                                    </div>
                                </div>
                                <ChevronRight size={16} className="text-warm-text-muted" />
                            </button>

                            <button className="flex w-full items-center justify-between rounded-xl bg-warm-surface p-3 transition-colors hover:bg-warm-surface-strong">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
                                        <Brain size={20} className="text-emerald-500" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-semibold text-warm-text-primary">개념 보강 영상 전송</p>
                                        <p className="text-xs text-warm-text-muted">이차방정식 판별식 강의</p>
                                    </div>
                                </div>
                                <ChevronRight size={16} className="text-warm-text-muted" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
