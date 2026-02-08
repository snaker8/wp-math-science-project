'use client';

import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, Award, TrendingUp } from 'lucide-react';

const radarData = [
    { subject: '이해력', A: 120, fullMark: 150 },
    { subject: '계산력', A: 98, fullMark: 150 },
    { subject: '추론력', A: 86, fullMark: 150 },
    { subject: '문제해결', A: 99, fullMark: 150 },
    { subject: '실전', A: 85, fullMark: 150 },
];

export default function ParentReportPage({ params }: { params: { id: string } }) {
    return (
        <div className="p-4 space-y-6">
            {/* Summary Card */}
            <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Award size={100} className="text-indigo-600" />
                </div>
                <h2 className="text-slate-500 text-sm font-medium mb-1">2월 종합 성취도</h2>
                <div className="text-3xl font-bold text-slate-900 mb-4">Top 12% <span className="text-sm font-normal text-indigo-600 ml-2">▲ 2% 상승</span></div>

                <div className="flex gap-4 mt-6">
                    <div className="bg-slate-50 rounded-2xl p-4 flex-1">
                        <div className="text-xs text-slate-400 mb-1">평균 점수</div>
                        <div className="text-xl font-bold text-slate-800">88.5</div>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4 flex-1">
                        <div className="text-xs text-slate-400 mb-1">과제 수행</div>
                        <div className="text-xl font-bold text-slate-800">92%</div>
                    </div>
                </div>
            </section>

            {/* Performance DNA */}
            <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-lg text-slate-800">학습 역량 DNA</h3>
                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-bold">Strong</span>
                </div>

                <div className="h-64 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
                            <Radar
                                name="Student"
                                dataKey="A"
                                stroke="#4f46e5"
                                strokeWidth={3}
                                fill="#4f46e5"
                                fillOpacity={0.2}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
                <p className="text-center text-xs text-slate-500 mt-2">
                    * 또래 평균 대비 이해력과 문제해결력이 매우 우수합니다.
                </p>
            </section>

            {/* AI Insight */}
            <section className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-500/30">
                <div className="flex items-center gap-2 mb-4">
                    <SparklesIcon className="w-5 h-5 text-yellow-300" />
                    <h3 className="font-bold">AI 학습 조언</h3>
                </div>
                <p className="text-sm leading-relaxed text-indigo-100 mb-4">
                    &quot;민수는 현재 삼각함수 단원에서 놀라운 집중력을 보이고 있습니다. 다만, 계산 실수로 인한 감점이 간혹 발생하니, 검산하는 습관만 보완한다면 완벽한 성취를 이룰 수 있습니다.&quot;
                </p>
                <button className="w-full bg-white/20 hover:bg-white/30 backdrop-blur transition-colors py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                    상세 리포트 보기 <ArrowUpRight size={16} />
                </button>
            </section>

            {/* Recent Activity List */}
            <section>
                <h3 className="font-bold text-lg text-slate-800 mb-4 ml-2">최근 학습 기록</h3>
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                                    <TrendingUp size={20} className="text-slate-500" />
                                </div>
                                <div>
                                    <div className="font-bold text-slate-800 text-sm">일일 테스트 완료</div>
                                    <div className="text-xs text-slate-400">2시간 전 • 95점</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
            <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM9" clipRule="evenodd" />
        </svg>
    )
}
