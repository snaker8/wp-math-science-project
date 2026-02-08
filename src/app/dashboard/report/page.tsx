'use client';

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    PieChart, Pie, Cell,
} from 'recharts';
import { Printer, Calendar, User, TrendingUp, BookOpen, BrainCircuit, Award, Zap, Clock, Target, MessageCircle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { competencyData, growthTrendData, topicMasteryData, aiInsights, attitudeData } from '@/lib/mock-data';

export default function ReportPage() {
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        window.print();
    };

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.6,
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 }
    };

    // Gauge Config
    const gaugeData = [
        { name: 'Low', value: 33, color: '#f43f5e' }, // rose-500
        { name: 'Medium', value: 33, color: '#f59e0b' }, // amber-500
        { name: 'High', value: 34, color: '#10b981' }, // emerald-500
    ];
    const cx = 150;
    const cy = 150;
    const iR = 80;
    const oR = 120;
    // Needle Angle Calculation
    const needleValue = attitudeData.totalScore;
    const needleAngle = 180 - (needleValue / 100) * 180; // 0 is right (100%), 180 is left (0%)

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-8 space-y-8 pb-16">
            {/* 1. Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 print:hidden">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-indigo-400">
                        <TrendingUp size={20} />
                        <span className="text-sm font-medium tracking-wider uppercase">Student Analysis Report</span>
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight">심층 분석 리포트</h1>
                    <p className="text-zinc-400">학부모 상담 및 학습 전략 수립을 위한 심층 데이터 분석 결과입니다.</p>
                </div>
                <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/20 group"
                >
                    <Printer size={20} className="group-hover:scale-110 transition-transform" />
                    상담용 PDF 출력
                </button>
            </div>

            {/* 2. Bento Grid Layout */}
            <motion.div
                ref={printRef}
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 md:grid-cols-12 gap-6 print:block print:bg-white print:text-black print:p-0"
            >
                {/* Student Profile (Full Width in Print) */}
                <motion.div
                    variants={itemVariants}
                    className="col-span-12 md:col-span-4 bg-zinc-900/50 border border-white/5 rounded-3xl p-8 space-y-6 relative overflow-hidden group print:border-none print:shadow-none print:bg-white print:p-0"
                >
                    <div className="absolute top-0 right-0 p-12 -mt-10 -mr-10 bg-indigo-500/10 blur-[100px] rounded-full group-hover:bg-indigo-500/20 transition-all duration-700" />

                    <div className="flex items-center gap-6">
                        <div className="w-24 h-24 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                            <User size={48} className="text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-bold">김민수</h2>
                            <p className="text-indigo-400 font-medium">고등부 심화반 (A1)</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 print:border-zinc-200">
                            <p className="text-xs text-zinc-500 uppercase font-bold tracking-tighter">분석 기간</p>
                            <p className="font-semibold mt-1">최근 6개월</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 print:border-zinc-200">
                            <p className="text-xs text-zinc-500 uppercase font-bold tracking-tighter">종합 등급</p>
                            <p className="font-semibold mt-1 text-indigo-400">Superior (A+)</p>
                        </div>
                    </div>

                    <div className="space-y-4 pt-2">
                        <div className="flex items-center gap-3 text-zinc-400 text-sm">
                            <Calendar size={16} />
                            <span>작성일시: 2026. 02. 07</span>
                        </div>
                        <div className="flex items-center gap-3 text-zinc-400 text-sm">
                            <Award size={16} />
                            <span>수행 완료 과제: 156건</span>
                        </div>
                    </div>

                    {/* Print Watermark Hidden by Default */}
                    <div className="hidden print:block absolute bottom-0 right-0 opacity-10 pointer-events-none">
                        <h3 className="text-2xl font-black italic">과사람 With-People</h3>
                    </div>
                </motion.div>

                {/* AI Insights (6 columns) */}
                <motion.div
                    variants={itemVariants}
                    className="col-span-12 md:col-span-8 bg-indigo-500/5 border border-indigo-500/10 rounded-3xl p-8 backdrop-blur-xl relative overflow-hidden flex flex-col justify-center print:bg-white print:border-zinc-100 print:mt-12"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <BrainCircuit size={28} className="text-indigo-400" />
                        <h3 className="text-xl font-bold text-indigo-100 print:text-black">AI 맞춤 분석 인사이트</h3>
                    </div>

                    <div className="space-y-4">
                        <p className="text-lg font-medium text-white print:text-black leading-relaxed">
                            &quot;{aiInsights.summary}&quot;
                        </p>
                        <ul className="space-y-3">
                            {aiInsights.details.map((detail, idx) => (
                                <li key={idx} className="flex gap-3 text-zinc-400 print:text-zinc-600 leading-relaxed">
                                    <span className="text-indigo-500/50 mt-1">•</span>
                                    <span>{detail}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-6 p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 print:bg-zinc-50 print:border-zinc-200">
                            <p className="text-sm text-indigo-300 print:text-indigo-600 font-bold mb-1 italic">Future Strategy:</p>
                            <p className="text-sm text-zinc-300 print:text-zinc-700">{aiInsights.recommendation}</p>
                        </div>
                    </div>
                </motion.div>

                {/* Performance DNA (Radar Chart) */}
                <motion.div
                    variants={itemVariants}
                    className="col-span-12 md:col-span-6 bg-zinc-900/50 border border-white/5 rounded-3xl p-8 flex flex-col print:bg-white print:mt-12 print:border-zinc-200"
                >
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xl font-bold">수학 역량 DNA</h3>
                        <span className="text-xs bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full font-bold">5-CORE METRICS</span>
                    </div>

                    <div className="flex-1 min-h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={competencyData}>
                                <PolarGrid stroke="#3f3f46" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 13 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar
                                    name="민수"
                                    dataKey="value"
                                    stroke="#6366f1"
                                    fill="#6366f1"
                                    fillOpacity={0.6}
                                    strokeWidth={3}
                                    animationDuration={2000}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-5 gap-2 mt-4">
                        {competencyData.map((d, i) => (
                            <div key={i} className="text-center">
                                <p className="text-[10px] text-zinc-500 mb-1">{d.subject}</p>
                                <p className="text-sm font-bold text-indigo-400">{d.value}%</p>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Growth Trend (Line Chart) */}
                <motion.div
                    variants={itemVariants}
                    className="col-span-12 md:col-span-6 bg-zinc-900/50 border border-white/5 rounded-3xl p-8 flex flex-col print:bg-white print:mt-12 print:border-zinc-200"
                >
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xl font-bold">최근 성취도 추이</h3>
                        <div className="flex gap-4 text-xs">
                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500" /> 학생</div>
                            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-600" /> 평균</div>
                        </div>
                    </div>

                    <div className="flex-1 min-h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={growthTrendData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis
                                    dataKey="month"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#71717a', fontSize: 12 }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#71717a', fontSize: 12 }}
                                    domain={[0, 100]}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                                    itemStyle={{ fontSize: '12px' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="studentScore"
                                    stroke="#6366f1"
                                    strokeWidth={4}
                                    dot={{ r: 6, fill: '#6366f1', strokeWidth: 2, stroke: '#18181b' }}
                                    activeDot={{ r: 8, strokeWidth: 0 }}
                                    animationDuration={2500}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="averageScore"
                                    stroke="#3f3f46"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    animationDuration={2500}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Topic Mastery Matrix */}
                <motion.div
                    variants={itemVariants}
                    className="col-span-12 bg-zinc-900/50 border border-white/5 rounded-3xl p-8 print:bg-white print:mt-12 print:border-zinc-200"
                >
                    <div className="flex items-center gap-2 mb-8">
                        <BookOpen size={24} className="text-indigo-400" />
                        <h3 className="text-xl font-bold">단원별 주제 숙련도</h3>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                        {topicMasteryData.map((topic, i) => (
                            <div key={i} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col justify-between h-32 group hover:border-indigo-500/30 transition-all print:border-zinc-200">
                                <p className="text-sm font-semibold text-zinc-300 print:text-zinc-700">{topic.topic}</p>
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-2xl font-bold">{topic.progress}%</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${topic.status === 'mastered' ? 'bg-emerald-500/20 text-emerald-400' :
                                            topic.status === 'improving' ? 'bg-amber-500/20 text-amber-400' :
                                                'bg-rose-500/20 text-rose-400'
                                            }`}>
                                            {topic.status.toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${topic.progress}%` }}
                                            transition={{ duration: 1.5, delay: 0.5 }}
                                            className={`h-full ${topic.status === 'mastered' ? 'bg-emerald-500' :
                                                topic.status === 'improving' ? 'bg-amber-500' :
                                                    'bg-rose-500'
                                                }`}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* New: Learning Attitude Section */}
                <motion.div
                    variants={itemVariants}
                    className="col-span-12 bg-zinc-900/50 border border-white/5 rounded-3xl p-8 flex flex-col md:flex-row gap-8 print:bg-white print:mt-12 print:border-zinc-200 page-break-inside-avoid"
                >
                    {/* Gauge Chart Section */}
                    <div className="w-full md:w-1/3 flex flex-col items-center justify-center border-r border-white/5 pr-8 print:border-zinc-200">
                        <div className="flex items-center gap-2 mb-4 self-start">
                            <Zap size={24} className="text-amber-400" />
                            <h3 className="text-xl font-bold">월간 학습 태도</h3>
                        </div>
                        <div className="relative w-[300px] h-[160px] flex justify-center overflow-hidden">
                            <PieChart width={300} height={300}>
                                <Pie
                                    data={gaugeData}
                                    cx={150}
                                    cy={150}
                                    startAngle={180}
                                    endAngle={0}
                                    innerRadius={80}
                                    outerRadius={120}
                                    paddingAngle={2}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {gaugeData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                            </PieChart>
                            {/* Needle */}
                            <motion.div
                                initial={{ rotate: 0 }}
                                animate={{ rotate: needleValue * 1.8 }}
                                transition={{ type: "spring", stiffness: 50, damping: 10, delay: 0.5 }}
                                className="absolute bottom-0 left-[148px] w-1 h-[120px] bg-indigo-500 origin-bottom rounded-full z-10"
                                style={{ transformOrigin: "bottom center" }}
                            />
                            <div className="absolute bottom-0 left-[142px] w-4 h-4 bg-white rounded-full z-20 shadow-lg shadow-indigo-500/50" />
                        </div>
                        <div className="mt-4 text-center">
                            <p className="text-4xl font-black text-white print:text-black">{attitudeData.totalScore}<span className="text-xl text-zinc-500 ml-1">/ 100</span></p>
                        </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="w-full md:w-2/3 flex flex-col justify-between">
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            {attitudeData.metrics.map((metric, idx) => (
                                <div key={idx} className="bg-white/5 rounded-2xl p-4 flex items-center justify-between print:bg-zinc-50 print:border print:border-zinc-200">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${metric.category === '출결 점수' ? 'bg-indigo-500/20 text-indigo-400' :
                                                metric.category === '과제 이행률' ? 'bg-emerald-500/20 text-emerald-400' :
                                                    metric.category === '수업 집중도' ? 'bg-rose-500/20 text-rose-400' :
                                                        'bg-amber-500/20 text-amber-400'
                                            }`}>
                                            {metric.category === '출결 점수' && <Clock size={16} />}
                                            {metric.category === '과제 이행률' && <Target size={16} />}
                                            {metric.category === '수업 집중도' && <Zap size={16} />}
                                            {metric.category === '질문 빈도' && <MessageCircle size={16} />}
                                        </div>
                                        <span className="font-semibold text-zinc-300 print:text-zinc-700">{metric.category}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-bold">{metric.score}</div>
                                        <div className={`text-xs flex items-center justify-end gap-1 ${metric.trend === 'up' ? 'text-emerald-400' :
                                                metric.trend === 'down' ? 'text-rose-400' : 'text-zinc-500'
                                            }`}>
                                            {metric.trend === 'up' && <ArrowUpRight size={12} />}
                                            {metric.trend === 'down' && <ArrowDownRight size={12} />}
                                            {metric.trend === 'stable' && <Minus size={12} />}
                                            {metric.score - metric.prevScore !== 0 ? Math.abs(metric.score - metric.prevScore) : '-'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* AI Attitude Comment */}
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 relative overflow-hidden print:bg-emerald-50 print:border-emerald-200">
                            <div className="absolute top-0 right-0 p-8 -mt-4 -mr-4 bg-emerald-500/10 blur-[40px] rounded-full" />
                            <div className="flex gap-3 relative z-10">
                                <div className="mt-1">
                                    <Award size={20} className="text-emerald-400" />
                                </div>
                                <div>
                                    <p className="font-bold text-emerald-100 mb-1 print:text-emerald-800">AI Teaching Assistant&apos;s Note</p>
                                    <p className="text-zinc-300 leading-relaxed text-sm print:text-zinc-700">
                                        &quot;{attitudeData.comment}&quot;
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

            </motion.div>

            {/* 3. Print Watermark Footer (Visible only in Print) */}
            <div className="hidden print:flex fixed bottom-8 left-1/2 -translate-x-1/2 w-full justify-between px-12 items-center text-zinc-300">
                <div className="text-sm">© 2026 과사람 With-People. All rights reserved.</div>
                <div className="text-2xl font-black italic opacity-20">과사람 WITH-PEOPLE</div>
            </div>

            {/* 4. Global Print Styles */}
            <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact;
          }
          .min-h-screen {
             min-height: auto !important;
             background-color: white !important;
          }
          /* Ensure charts are visible in print */
          .recharts-cartesian-grid-horizontal line,
          .recharts-cartesian-grid-vertical line {
            stroke: #e4e4e7 !important;
          }
          .recharts-polar-grid-concentric-path {
            stroke: #e4e4e7 !important;
          }
          .page-break-inside-avoid {
            page-break-inside: avoid;
          }
        }
      `}</style>
        </div>
    );
}
