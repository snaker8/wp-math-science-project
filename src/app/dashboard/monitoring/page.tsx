'use client';

import React, { useState, useEffect } from 'react';
import {
    Clock,
    AlertCircle,
    MessageSquare,
    Zap,
    ChevronRight
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

type StudentStatus = 'solving' | 'stuck' | 'idle' | 'finished' | 'help';
type AlertType = 'stuck' | 'idle' | 'finished' | 'help' | null;

interface Student {
    id: number | string;
    name: string;
    status: StudentStatus;
    currentQ: number;
    accuracy: number;
    alert: AlertType;
    avatar: string;
}

interface StudentMonitorCardProps {
    student: Student;
}

// Mock Data
const students: Student[] = [
    { id: 1, name: '김민준', status: 'solving', currentQ: 7, accuracy: 85, alert: null, avatar: 'M' },
    { id: 2, name: '이서연', status: 'stuck', currentQ: 5, accuracy: 60, alert: 'stuck', avatar: 'S' },
    { id: 3, name: '박지호', status: 'solving', currentQ: 12, accuracy: 92, alert: null, avatar: 'J' },
    { id: 4, name: '최수아', status: 'idle', currentQ: 3, accuracy: 40, alert: 'idle', avatar: 'S' },
    { id: 5, name: '정예준', status: 'solving', currentQ: 8, accuracy: 88, alert: null, avatar: 'Y' },
    { id: 6, name: '한소희', status: 'finished', currentQ: 20, accuracy: 95, alert: 'finished', avatar: 'H' },
    { id: 7, name: '장동건', status: 'solving', currentQ: 6, accuracy: 75, alert: null, avatar: 'D' },
    { id: 8, name: '강동원', status: 'help', currentQ: 4, accuracy: 50, alert: 'help', avatar: 'K' },
];

const StudentMonitorCard: React.FC<StudentMonitorCardProps> = ({ student }) => {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'stuck': return 'border-amber-200 bg-amber-50';
            case 'idle': return 'border-gray-200 bg-gray-50';
            case 'help': return 'border-red-200 bg-red-50';
            case 'finished': return 'border-emerald-200 bg-emerald-50';
            default: return 'border-warm-border-soft bg-white';
        }
    };

    return (
        <div className={`relative flex flex-col rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md ${getStatusColor(student.status)}`}>
            {/* Alert Badge */}
            {student.alert === 'stuck' && (
                <div className="absolute -right-2 -top-2 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700 shadow-sm border border-amber-200">
                    <Clock size={10} /> 3분 정체
                </div>
            )}
            {student.alert === 'help' && (
                <div className="absolute -right-2 -top-2 flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700 shadow-sm border border-red-200">
                    <AlertCircle size={10} /> 도움 요청
                </div>
            )}

            <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${student.status === 'solving' ? 'bg-indigo-100 text-indigo-600' : 'bg-white text-gray-600 shadow-sm'
                    }`}>
                    {student.avatar}
                </div>
                <div>
                    <h4 className="text-sm font-bold text-warm-text-primary">{student.name}</h4>
                    <p className="text-xs text-warm-text-secondary">
                        {student.status === 'finished' ? '제출 완료' : `#${student.currentQ}번 풀이 중`}
                    </p>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
                <div className="flex justify-between text-[10px] text-warm-text-muted mb-1">
                    <span>정답률</span>
                    <span className={`font-bold ${student.accuracy >= 90 ? 'text-emerald-600' :
                            student.accuracy >= 70 ? 'text-indigo-600' : 'text-amber-600'
                        }`}>{student.accuracy}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-black/5 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${student.accuracy >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                        style={{ width: `${student.accuracy}%` }}
                    />
                </div>
            </div>

            {/* Actions */}
            <div className="mt-auto pt-3 flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100">
                <button className="rounded-full p-1.5 hover:bg-black/5 text-warm-text-secondary">
                    <MessageSquare size={16} />
                </button>
            </div>
        </div>
    );
};

export default function MonitoringPage() {
    const [activeCount, setActiveCount] = useState(24);

    // Pulse effect simulation
    useEffect(() => {
        const interval = setInterval(() => {
            // Just a dummy effect re-render
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex h-full flex-col font-pretendard">
            {/* Top Status Bar */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-warm-border-soft bg-white/80 px-6 py-4 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-lg font-bold text-warm-text-primary">고1 심화수학 A반</h1>
                        <p className="text-xs text-warm-text-muted">담당: 김수학 선생님</p>
                    </div>
                    <div className="h-8 w-px bg-warm-border-soft mx-2"></div>
                    <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-bold text-emerald-700">{activeCount}명 접속 중</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-warm-border-soft bg-white px-3 py-1.5 text-xs font-medium text-warm-text-secondary shadow-sm">
                        <Clock size={12} />
                        <span>수업 경과: 45분 20초</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-1.5 rounded-xl bg-warm-surface-strong px-4 py-2 text-sm font-semibold text-warm-text-primary transition-colors hover:bg-warm-border-soft">
                        <Zap size={16} className="text-amber-500" />
                        <span>전체 힌트 전송</span>
                    </button>
                    <button className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-colors hover:bg-indigo-700">
                        <span>수업 종료</span>
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Main Grid */}
                <div className="flex-1 overflow-y-auto bg-warm-surface p-6">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {students.map((student) => (
                            <StudentMonitorCard key={student.id} student={student} />
                        ))}
                        {/* Duplicate for demo density */}
                        {students.map((student) => (
                            <StudentMonitorCard key={`dup-${student.id}`} student={{ ...student, id: `dup-${student.id}` }} />
                        ))}
                        {students.map((student) => (
                            <StudentMonitorCard key={`dup2-${student.id}`} student={{ ...student, id: `dup2-${student.id}` }} />
                        ))}
                    </div>
                </div>

                {/* Right Sidebar: Real-time Stats */}
                <div className="w-80 border-l border-warm-border-soft bg-white p-6 hidden xl:flex flex-col gap-6">
                    <div>
                        <h3 className="mb-4 text-sm font-bold text-warm-text-primary">실시간 풀이 현황</h3>
                        <div className="space-y-4">
                            <div className="rounded-xl border border-warm-border-soft bg-warm-surface p-4">
                                <div className="flex justify-between text-xs mb-2">
                                    <span className="text-warm-text-secondary">학급 평균 정답률</span>
                                    <span className="font-bold text-indigo-600">72%</span>
                                </div>
                                {/* Dummy Line Chart Visualization */}
                                <div className="flex items-end gap-1 h-16 w-full px-1">
                                    {[40, 50, 45, 60, 75, 70, 80, 72].map((h, i) => (
                                        <div key={i} className="bg-indigo-200 w-full rounded-t-sm" style={{ height: `${h}%` }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-4 text-sm font-bold text-warm-text-primary text-red-600/90 flex items-center gap-2">
                            <AlertCircle size={14} className="text-red-500" />
                            주의 필요 문항
                        </h3>
                        <div className="space-y-2">
                            {[5, 12, 18].map((q) => (
                                <div key={q} className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50/50 p-3">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-6 w-6 items-center justify-center rounded bg-white text-xs font-bold shadow-sm">#{q}</span>
                                        <span className="text-xs text-red-800">오답률 65% 급증</span>
                                    </div>
                                    <ChevronRight size={14} className="text-red-400" />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-auto rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 p-5 text-white shadow-lg">
                        <h3 className="font-bold">AI 수업 조교</h3>
                        <p className="mt-2 text-xs text-indigo-100 opacity-90">
                            &quot;현재 7번 문항에서 5명의 학생이 정체 중입니다. <br />
                            관련 개념 힌트를 전송할까요?&quot;
                        </p>
                        <button className="mt-4 w-full rounded-lg bg-white/20 py-2 text-xs font-semibold hover:bg-white/30 backdrop-blur-sm">
                            힌트 자동 전송
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
