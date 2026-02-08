'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Home,
  BarChart3,
  CreditCard,
  Check,
  Clock,
  Calendar,
  Receipt,
  ChevronRight,
  Download,
  AlertCircle
} from 'lucide-react';

interface PaymentHistory {
  id: string;
  date: string;
  amount: number;
  description: string;
  status: 'paid' | 'pending' | 'overdue';
  method?: string;
}

export default function ParentPaymentPage() {
  const [paymentHistory] = useState<PaymentHistory[]>([
    { id: '1', date: '2024-02-01', amount: 350000, description: '2월 수업료', status: 'paid', method: '카드결제' },
    { id: '2', date: '2024-01-01', amount: 350000, description: '1월 수업료', status: 'paid', method: '카드결제' },
    { id: '3', date: '2023-12-01', amount: 350000, description: '12월 수업료', status: 'paid', method: '계좌이체' },
    { id: '4', date: '2023-11-01', amount: 350000, description: '11월 수업료', status: 'paid', method: '카드결제' },
  ]);

  const [upcomingPayment] = useState({
    dueDate: '2024-03-01',
    amount: 350000,
    daysLeft: 5,
    description: '3월 수업료',
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount);
  };

  const getStatusBadge = (status: PaymentHistory['status']) => {
    switch (status) {
      case 'paid':
        return (
          <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
            <Check size={12} />
            결제완료
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1 text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full">
            <Clock size={12} />
            대기중
          </span>
        );
      case 'overdue':
        return (
          <span className="flex items-center gap-1 text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-full">
            <AlertCircle size={12} />
            연체
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">결제 관리</h1>
              <p className="text-sm text-zinc-400">수업료 결제 및 내역 관리</p>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-white/5 bg-zinc-900/50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1">
            {[
              { href: '/parent', icon: Home, label: '홈' },
              { href: '/parent/report', icon: BarChart3, label: '리포트' },
              { href: '/parent/payment', icon: CreditCard, label: '결제 관리', active: true },
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
        {/* Upcoming Payment Card */}
        <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-2xl p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-sm mb-2">
                <Calendar size={16} />
                다음 결제 예정
              </div>
              <h2 className="text-2xl font-bold mb-1">{upcomingPayment.description}</h2>
              <p className="text-zinc-400">
                결제 예정일: {upcomingPayment.dueDate} ({upcomingPayment.daysLeft}일 남음)
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-white mb-3">
                ₩{formatCurrency(upcomingPayment.amount)}
              </div>
              <button className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium transition-colors flex items-center gap-2 ml-auto">
                <CreditCard size={18} />
                지금 결제하기
              </button>
            </div>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Check className="text-green-400" size={20} />
              </div>
              <span className="text-zinc-400 text-sm">총 결제 완료</span>
            </div>
            <div className="text-2xl font-bold">₩{formatCurrency(1400000)}</div>
            <div className="text-xs text-zinc-500 mt-1">최근 4개월</div>
          </div>

          <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <Clock className="text-amber-400" size={20} />
              </div>
              <span className="text-zinc-400 text-sm">예정 금액</span>
            </div>
            <div className="text-2xl font-bold">₩{formatCurrency(upcomingPayment.amount)}</div>
            <div className="text-xs text-zinc-500 mt-1">{upcomingPayment.dueDate} 예정</div>
          </div>

          <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <Receipt className="text-indigo-400" size={20} />
              </div>
              <span className="text-zinc-400 text-sm">자동결제</span>
            </div>
            <div className="text-2xl font-bold text-green-400">설정됨</div>
            <div className="text-xs text-zinc-500 mt-1">카드 ****-1234</div>
          </div>
        </div>

        {/* Payment History */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">결제 내역</h2>
            <button className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              <Download size={14} />
              내역 다운로드
            </button>
          </div>

          <div className="divide-y divide-white/5">
            {paymentHistory.map((payment) => (
              <div
                key={payment.id}
                className="p-5 hover:bg-zinc-800/30 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-zinc-800 rounded-xl">
                    <Receipt className="text-zinc-400" size={20} />
                  </div>
                  <div>
                    <div className="font-medium">{payment.description}</div>
                    <div className="text-sm text-zinc-500 flex items-center gap-2">
                      <span>{payment.date}</span>
                      {payment.method && (
                        <>
                          <span className="w-1 h-1 bg-zinc-600 rounded-full" />
                          <span>{payment.method}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold">₩{formatCurrency(payment.amount)}</div>
                  </div>
                  {getStatusBadge(payment.status)}
                  <button className="p-2 hover:bg-zinc-700/50 rounded-lg transition-colors">
                    <ChevronRight size={18} className="text-zinc-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Methods Section */}
        <div className="mt-8 bg-zinc-900/50 border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">결제 수단</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl border border-indigo-500/30">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/20 rounded-xl">
                  <CreditCard className="text-indigo-400" size={20} />
                </div>
                <div>
                  <div className="font-medium">신용카드</div>
                  <div className="text-sm text-zinc-500">**** **** **** 1234</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded-full">
                  기본 결제수단
                </span>
                <button className="text-sm text-zinc-400 hover:text-white px-3 py-1">
                  수정
                </button>
              </div>
            </div>

            <button className="w-full p-4 border border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center gap-2">
              <CreditCard size={18} />
              새 결제수단 추가
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
