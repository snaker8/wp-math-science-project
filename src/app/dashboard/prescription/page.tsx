'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, ChevronDown, Menu, Printer, Send, Sparkles, AlertCircle } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from 'recharts';
import { motion } from 'framer-motion';

// Types & Mock Data (Reused/Extended)
interface Student {
  id: string;
  name: string;
  grade: string;
  class: string;
}

const mockStudents: Student[] = [
  { id: '1', name: '김민준', grade: '중1', class: 'A반' },
  { id: '2', name: '이서연', grade: '중1', class: 'A반' },
  { id: '3', name: '박지호', grade: '중2', class: 'B반' },
  { id: '4', name: '최수아', grade: '중2', class: 'B반' },
  { id: '5', name: '정예준', grade: '중3', class: 'C반' },
];

const mockRadarData = [
  { subject: '계산력', A: 120, fullMark: 150 },
  { subject: '이해력', A: 98, fullMark: 150 },
  { subject: '추론력', A: 86, fullMark: 150 },
  { subject: '문제해결', A: 99, fullMark: 150 },
  { subject: '실전력', A: 85, fullMark: 150 },
];

const mockHeatmapData = [
  { unit: '지수함수', level: 1, status: 'mastered' },
  { unit: '로그함수', level: 2, status: 'review' },
  { unit: '삼각함수', level: 3, status: 'critical' },
  { unit: '수열', level: 2, status: 'mastered' },
  { unit: '극한', level: 1, status: 'learning' },
];

// Components
function ClinicCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-zinc-900 border border-white/10 rounded-2xl p-6 backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

function ActionButton({ icon: Icon, label, primary = false }: any) {
  return (
    <button className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${primary
        ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'
        : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
      }`}>
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}

function PrescriptionContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get('studentId') || '1';
  const student = mockStudents.find(s => s.id === studentId) || mockStudents[0];
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Filter Logic Simplified for Demo
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      {/* Sidebar (Simplified) */}
      <div className={`flex-shrink-0 border-r border-white/10 bg-zinc-950 transition-all ${sidebarCollapsed ? 'w-0' : 'w-72'} flex flex-col`}>
        <div className="p-4 border-b border-white/10">
          <h2 className="font-bold text-lg mb-4">학생 선택</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름 검색..."
              className="w-full bg-zinc-900 border border-white/10 rounded-lg py-2 pl-10 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {mockStudents.map(s => (
            <Link
              key={s.id}
              href={`/dashboard/prescription?studentId=${s.id}`}
              className={`block p-3 rounded-xl transition-colors ${s.id === student.id ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'hover:bg-white/5 text-gray-400'
                }`}
            >
              <div className="font-bold text-sm">{s.name}</div>
              <div className="text-xs opacity-70">{s.grade} • {s.class}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-black/50 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-2 hover:bg-white/10 rounded-lg">
              <Menu size={20} />
            </button>
            <div>
              <h1 className="font-bold text-xl flex items-center gap-2">
                AI Clinic
                <span className="bg-indigo-900/50 text-indigo-400 text-xs px-2 py-0.5 rounded border border-indigo-500/30">Beta</span>
              </h1>
              <p className="text-xs text-gray-500">정밀 진단 및 맞춤형 처방</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-bold text-sm">{student.name}</div>
              <div className="text-xs text-gray-500">{student.grade} | {student.class}</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold">
              {student.name[0]}
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Row: Radar & Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Radar Chart */}
            <ClinicCard className="col-span-2">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-400" />
                  수학 역량 진단 (Radar)
                </h3>
                <div className="flex gap-2 text-xs">
                  <span className="flex items-center gap-1 text-indigo-400"><div className="w-2 h-2 rounded-full bg-indigo-500" /> 학생</span>
                  <span className="flex items-center gap-1 text-gray-500"><div className="w-2 h-2 rounded-full bg-gray-500" /> 반 평균</span>
                </div>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={mockRadarData}>
                    <PolarGrid stroke="#333" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
                    <Radar
                      name="Student"
                      dataKey="A"
                      stroke="#6366f1"
                      strokeWidth={3}
                      fill="#6366f1"
                      fillOpacity={0.2}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#333', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </ClinicCard>

            {/* Actions & Status */}
            <div className="space-y-6">
              <ClinicCard>
                <h3 className="font-bold text-gray-400 text-sm mb-4 uppercase tracking-wider">Quick Actions</h3>
                <div className="space-y-3">
                  <ActionButton icon={Printer} label="맞춤형 학습지 출력" primary />
                  <ActionButton icon={Send} label="학부모 리포트 전송" />
                </div>
              </ClinicCard>

              <ClinicCard className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border-indigo-500/20">
                <div className="flex items-start gap-3">
                  <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400">
                    <AlertCircle size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-indigo-300 mb-1">처방 필요</h4>
                    <p className="text-xs text-indigo-200/70 leading-relaxed">
                      &apos;삼각함수&apos; 단원의 오답률이 급격히 상승했습니다.
                      개념 보구 처방이 시급합니다.
                    </p>
                    <Link href="/tutor/clinic" className="mt-3 inline-block text-xs font-bold text-white bg-indigo-600 px-3 py-1.5 rounded hover:bg-indigo-500">
                      처방 생성하기
                    </Link>
                  </div>
                </div>
              </ClinicCard>
            </div>
          </div>

          {/* Heatmap Section */}
          <ClinicCard>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg">단원별 취약점 Heatmap</h3>
              <Link href="/dashboard/prescription/analytics" className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                상세 분석 보기 <ChevronDown className="-rotate-90" size={16} />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {mockHeatmapData.map((item, idx) => (
                <motion.div
                  key={idx}
                  whileHover={{ scale: 1.05 }}
                  className={`relative aspect-square rounded-xl p-4 flex flex-col justify-between border ${item.status === 'critical' ? 'bg-red-900/20 border-red-500/30' :
                      item.status === 'learning' ? 'bg-yellow-900/20 border-yellow-500/30' :
                        item.status === 'review' ? 'bg-blue-900/20 border-blue-500/30' :
                          'bg-emerald-900/20 border-emerald-500/30'
                    }`}
                >
                  <div className="text-lg font-bold text-gray-200">{item.unit}</div>
                  <div className={`text-xs font-bold px-2 py-1 rounded w-fit ${item.status === 'critical' ? 'bg-red-500/20 text-red-400' :
                      item.status === 'learning' ? 'bg-yellow-500/20 text-yellow-400' :
                        item.status === 'review' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-emerald-500/20 text-emerald-400'
                    }`}>
                    {item.status.toUpperCase()}
                  </div>
                </motion.div>
              ))}
            </div>
          </ClinicCard>
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-black text-white">Loading Clinic...</div>}>
      <PrescriptionContent />
    </Suspense>
  );
}
