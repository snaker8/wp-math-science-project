'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Brain, TrendingUp, AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const performanceData = [
    { month: '3월', score: 78, classAvg: 75 },
    { month: '4월', score: 82, classAvg: 76 },
    { month: '5월', score: 80, classAvg: 78 },
    { month: '6월', score: 88, classAvg: 79 },
    { month: '7월', score: 86, classAvg: 80 },
    { month: '8월', score: 92, classAvg: 81 },
];

const skillData = [
    { skill: '계산', value: 85 },
    { skill: '이해', value: 92 },
    { skill: '추론', value: 78 },
    { skill: '문제해결', value: 88 },
];

function Card({ children, title, icon: Icon, className = '' }: any) {
    return (
        <div className={`bg-black border border-white/10 rounded-2xl p-6 ${className}`}>
            <div className="flex items-center gap-2 mb-6 text-gray-400">
                {Icon && <Icon size={18} />}
                <h3 className="font-bold text-sm uppercase tracking-wider">{title}</h3>
            </div>
            {children}
        </div>
    );
}

export default function AnalyticsPage() {
    return (
        <div className="min-h-screen bg-zinc-950 text-white p-8 space-y-8 font-sans">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/prescription" className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Deep-Dive Analytics</h1>
                    <p className="text-gray-500 text-sm">AI 기반 심층 학습 분석 리포트</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Performance DNA */}
                <Card title="Performance DNA" icon={TrendingUp} className="lg:col-span-2">
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={performanceData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis dataKey="month" stroke="#6b7280" />
                                <YAxis stroke="#6b7280" domain={[60, 100]} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#000', borderColor: '#333' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="classAvg" stroke="#4b5563" strokeDasharray="5 5" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* skill Distribution */}
                <Card title="Skill Distribution" icon={Brain}>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={skillData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                                <XAxis type="number" domain={[0, 100]} stroke="#6b7280" />
                                <YAxis dataKey="skill" type="category" stroke="#9ca3af" width={60} />
                                <Tooltip cursor={{ fill: '#ffffff10' }} contentStyle={{ backgroundColor: '#000', borderColor: '#333' }} />
                                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={32} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {/* AI Insight Panel */}
            <Card title="AI Diagnostic Insights" icon={Brain} className="bg-gradient-to-r from-indigo-950/30 to-purple-950/30 border-indigo-500/20">
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0 text-indigo-400">
                            <TrendingUp size={24} />
                        </div>
                        <div>
                            <h4 className="font-bold text-lg text-indigo-200">로그 함수 계산 능력 우수</h4>
                            <p className="text-gray-400 text-sm leading-relaxed mt-1">
                                기본적인 로그 연산 속도는 상위 5% 수준입니다. 복잡한 합성함수 미분에서도 정확도가 높습니다.
                            </p>
                        </div>
                    </div>
                    <div className="w-full h-px bg-white/10 my-4" />
                    <div className="flex gap-4">
                        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 text-red-400">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h4 className="font-bold text-lg text-red-200">정의 조건 누락 실수 패턴 감지</h4>
                            <p className="text-gray-400 text-sm leading-relaxed mt-1">
                                로그의 밑 조건(&gt;0, !=1)과 진수 조건(&gt;0)을 확인하지 않아 발생하는 실수가 최근 5회 중 3회 발견되었습니다.
                                <br /> <span className="text-indigo-400 font-bold underline cursor-pointer">관련 클리닉 문제 생성하기</span>
                            </p>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}
