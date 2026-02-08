'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Home,
  BarChart3,
  CreditCard,
  Bell,
  TrendingUp,
  TrendingDown,
  BookOpen,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight
} from 'lucide-react';

export default function ParentDashboardPage() {
  const [notifications] = useState([
    { id: 1, type: 'grade', message: '홍길동 학생이 수학 시험에서 95점을 받았습니다.', time: '오늘 14:30' },
    { id: 2, type: 'homework', message: '이번 주 숙제가 등록되었습니다.', time: '어제' },
    { id: 3, type: 'payment', message: '다음 달 수업료 결제일이 5일 남았습니다.', time: '2일 전' },
  ]);

  const [studentStats] = useState({
    name: '홍길동',
    grade: '고등학교 2학년',
    attendance: 95,
    avgScore: 87,
    completedHomework: 12,
    totalHomework: 14,
    recentScores: [85, 90, 88, 95, 87],
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">학부모 대시보드</h1>
              <p className="text-sm text-zinc-400">{studentStats.name} 학생의 학습 현황</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="relative p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors">
                <Bell size={20} className="text-zinc-400" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center">
                  3
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-white/5 bg-zinc-900/50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1">
            {[
              { href: '/parent', icon: Home, label: '홈', active: true },
              { href: '/parent/report', icon: BarChart3, label: '리포트' },
              { href: '/parent/payment', icon: CreditCard, label: '결제 관리' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  item.active
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-sm">평균 성적</span>
              <TrendingUp className="text-green-400" size={18} />
            </div>
            <div className="text-2xl font-bold">{studentStats.avgScore}점</div>
            <div className="text-xs text-green-400 mt-1">+5점 지난달 대비</div>
          </div>

          <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-sm">출석률</span>
              <CheckCircle2 className="text-emerald-400" size={18} />
            </div>
            <div className="text-2xl font-bold">{studentStats.attendance}%</div>
            <div className="text-xs text-zinc-500 mt-1">이번 달 기준</div>
          </div>

          <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-sm">숙제 완료</span>
              <BookOpen className="text-blue-400" size={18} />
            </div>
            <div className="text-2xl font-bold">
              {studentStats.completedHomework}/{studentStats.totalHomework}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {Math.round((studentStats.completedHomework / studentStats.totalHomework) * 100)}% 완료
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-sm">다음 수업</span>
              <Clock className="text-amber-400" size={18} />
            </div>
            <div className="text-2xl font-bold">2일</div>
            <div className="text-xs text-zinc-500 mt-1">월요일 16:00</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Scores Chart */}
          <div className="lg:col-span-2 bg-zinc-900/50 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">최근 성적 추이</h2>
            <div className="h-48 flex items-end justify-between gap-4">
              {studentStats.recentScores.map((score, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full bg-indigo-500/30 rounded-t-lg relative"
                    style={{ height: `${score}%` }}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 bg-indigo-500 rounded-t-lg"
                      style={{ height: `${(score / 100) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-400">{score}점</span>
                  <span className="text-xs text-zinc-500">시험 {idx + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Bell size={18} className="text-zinc-400" />
              알림
            </h2>
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 p-1.5 rounded-full ${
                      notification.type === 'grade' ? 'bg-green-500/20 text-green-400' :
                      notification.type === 'homework' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>
                      {notification.type === 'grade' ? <TrendingUp size={12} /> :
                       notification.type === 'homework' ? <BookOpen size={12} /> :
                       <AlertCircle size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 line-clamp-2">{notification.message}</p>
                      <p className="text-xs text-zinc-500 mt-1">{notification.time}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/parent/report"
            className="flex items-center justify-between p-5 bg-zinc-900/50 border border-white/10 rounded-xl hover:border-indigo-500/50 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-500/20 rounded-xl">
                <BarChart3 className="text-indigo-400" size={24} />
              </div>
              <div>
                <h3 className="font-semibold">상세 리포트</h3>
                <p className="text-sm text-zinc-400">성적 분석 보기</p>
              </div>
            </div>
            <ChevronRight className="text-zinc-600 group-hover:text-indigo-400 transition-colors" />
          </Link>

          <Link
            href="/parent/payment"
            className="flex items-center justify-between p-5 bg-zinc-900/50 border border-white/10 rounded-xl hover:border-indigo-500/50 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl">
                <CreditCard className="text-emerald-400" size={24} />
              </div>
              <div>
                <h3 className="font-semibold">결제 관리</h3>
                <p className="text-sm text-zinc-400">수업료 납부</p>
              </div>
            </div>
            <ChevronRight className="text-zinc-600 group-hover:text-indigo-400 transition-colors" />
          </Link>

          <button
            className="flex items-center justify-between p-5 bg-zinc-900/50 border border-white/10 rounded-xl hover:border-indigo-500/50 transition-all group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500/20 rounded-xl">
                <Bell className="text-amber-400" size={24} />
              </div>
              <div>
                <h3 className="font-semibold">상담 요청</h3>
                <p className="text-sm text-zinc-400">선생님과 상담하기</p>
              </div>
            </div>
            <ChevronRight className="text-zinc-600 group-hover:text-indigo-400 transition-colors" />
          </button>
        </div>
      </main>
    </div>
  );
}
