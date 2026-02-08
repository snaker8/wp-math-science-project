'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { ChevronRight, CheckCircle2, PlayCircle, Clock } from 'lucide-react';
import Link from 'next/link';

const goalData = [
    { name: 'Completed', value: 75 },
    { name: 'Remaining', value: 25 },
];
const COLORS = ['#4f46e5', '#e5e7eb']; // Indigo-600, Gray-200

export default function StudentDashboard() {
    return (
        <div className="p-4 space-y-6">
            {/* Greeting */}
            <section>
                <h2 className="text-2xl font-bold text-gray-900">
                    안녕하세요, 민수 학생! 👋
                </h2>
                <p className="text-gray-500 text-sm">오늘도 목표를 향해 달려볼까요?</p>
            </section>

            {/* Today's Goal Ring */}
            <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex items-center gap-6">
                <div className="w-32 h-32 relative flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={goalData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={55}
                                startAngle={90}
                                endAngle={-270}
                                dataKey="value"
                                stroke="none"
                            >
                                {goalData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-indigo-600">75%</span>
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Today</span>
                    </div>
                </div>
                <div>
                    <h3 className="font-bold text-lg mb-1">오늘의 학습 목표</h3>
                    <p className="text-sm text-gray-500 mb-3">수학 I - 삼각함수의 활용 외 2건이 남아있어요.</p>
                    <button className="bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-full hover:bg-indigo-700 transition-colors">
                        이어서 학습하기
                    </button>
                </div>
            </section>

            {/* Recent Assignments */}
            <section>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">최근 과제</h3>
                    <Link href="/student/study" className="text-indigo-600 text-sm font-medium flex items-center">
                        전체보기 <ChevronRight size={16} />
                    </Link>
                </div>

                <div className="space-y-3">
                    {/* Card 1 */}
                    <motion.div
                        whileTap={{ scale: 0.98 }}
                        className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                                <PlayCircle size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 text-sm">삼각함수의 활용 (심화)</h4>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                    <Clock size={12} /> 30분 소요 예정
                                </p>
                            </div>
                        </div>
                        <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full">
                            진행중
                        </span>
                    </motion.div>

                    {/* Card 2 */}
                    <motion.div
                        whileTap={{ scale: 0.98 }}
                        className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between opacity-60"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                <CheckCircle2 size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 text-sm">지수함수와 로그함수</h4>
                                <p className="text-xs text-gray-500">어제 완료함</p>
                            </div>
                        </div>
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full">
                            완료
                        </span>
                    </motion.div>
                </div>
            </section>
        </div>
    );
}
