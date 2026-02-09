'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  UserX,
} from 'lucide-react';

interface Invitation {
  id: string;
  className: string;
  teacherName: string;
  date: string;
  status: 'pending' | 'accepted' | 'rejected';
}

const mockInvitations: Invitation[] = [
  {
    id: 'inv1',
    className: '중등 수학 A반',
    teacherName: '김선생님',
    date: '2025-03-15',
    status: 'pending',
  },
  {
    id: 'inv2',
    className: '고등 수학 기초반',
    teacherName: '이선생님',
    date: '2025-03-10',
    status: 'pending',
  },
  {
    id: 'inv3',
    className: '수능 대비 심화반',
    teacherName: '박선생님',
    date: '2025-03-05',
    status: 'pending',
  },
];

export default function StudentInvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>(mockInvitations);

  const pendingCount = invitations.filter((i) => i.status === 'pending').length;
  const acceptedCount = invitations.filter((i) => i.status === 'accepted').length;
  const rejectedCount = invitations.filter((i) => i.status === 'rejected').length;

  const handleAccept = (id: string) => {
    setInvitations((prev) =>
      prev.map((inv) => (inv.id === id ? { ...inv, status: 'accepted' as const } : inv))
    );
    const invitation = invitations.find((i) => i.id === id);
    alert(`"${invitation?.className}" 초대를 수락했습니다.`);
  };

  const handleReject = (id: string) => {
    setInvitations((prev) =>
      prev.map((inv) => (inv.id === id ? { ...inv, status: 'rejected' as const } : inv))
    );
    const invitation = invitations.find((i) => i.id === id);
    alert(`"${invitation?.className}" 초대를 거절했습니다.`);
  };

  const getStatusDisplay = (status: Invitation['status']) => {
    switch (status) {
      case 'accepted':
        return (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 size={16} className="text-green-500" />
            <span className="text-sm font-medium text-green-700">수락됨</span>
          </div>
        );
      case 'rejected':
        return (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
            <XCircle size={16} className="text-red-500" />
            <span className="text-sm font-medium text-red-700">거절됨</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/student"
            className="p-2 rounded-lg border border-gray-200 text-zinc-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">초대 목록</h1>
            <p className="text-sm text-zinc-500 mt-1">받은 초대를 확인하고 응답하세요</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
            <Clock size={20} className="text-amber-500" />
            <div>
              <p className="text-lg font-bold text-zinc-900">{pendingCount}</p>
              <p className="text-xs text-zinc-500">대기중</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
            <UserCheck size={20} className="text-green-500" />
            <div>
              <p className="text-lg font-bold text-zinc-900">{acceptedCount}</p>
              <p className="text-xs text-zinc-500">수락</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
            <UserX size={20} className="text-red-500" />
            <div>
              <p className="text-lg font-bold text-zinc-900">{rejectedCount}</p>
              <p className="text-xs text-zinc-500">거절</p>
            </div>
          </div>
        </div>

        {/* Invitation Cards */}
        <div className="space-y-4">
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <Mail size={18} className="text-indigo-500" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-zinc-900">
                    {invitation.className}
                  </h3>
                  <div className="flex items-center gap-3 mt-1.5 text-sm text-zinc-500">
                    <span>{invitation.teacherName}</span>
                    <span className="text-zinc-300">|</span>
                    <span>{invitation.date}</span>
                  </div>

                  {/* Actions or Status */}
                  <div className="mt-4">
                    {invitation.status === 'pending' ? (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleAccept(invitation.id)}
                          className="flex items-center gap-1.5 px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle2 size={14} />
                          수락
                        </button>
                        <button
                          onClick={() => handleReject(invitation.id)}
                          className="flex items-center gap-1.5 px-5 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
                        >
                          <XCircle size={14} />
                          거절
                        </button>
                      </div>
                    ) : (
                      getStatusDisplay(invitation.status)
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {invitations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Mail size={48} className="text-gray-300 mb-4" />
            <p className="text-zinc-600 font-medium">초대가 없습니다</p>
            <p className="text-sm text-zinc-400 mt-1">새로운 초대가 도착하면 여기에 표시됩니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
