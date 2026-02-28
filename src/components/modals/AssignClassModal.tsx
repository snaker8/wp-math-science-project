'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Calendar,
    Clock,
    Users,
    ChevronRight,
    Check,
    Bell,
    Lock,
    Globe,
    Zap,
    FileText
} from 'lucide-react';
import { GlowCard } from '@/components/shared/GlowCard';

interface AssignClassModalProps {
    isOpen: boolean;
    onClose: () => void;
    paperTitle: string;
}

const classes = [
    { id: 'c1', name: '고1 의대반 A', students: 12, time: '월/수 19:00' },
    { id: 'c2', name: '고1 심화반 B', students: 15, time: '화/목 18:30' },
    { id: 'c3', name: '중3 영재교 준비반', students: 8, time: '토 10:00' },
    { id: 'c4', name: '고2 미적분 정규반', students: 20, time: '금 20:00' },
];

export default function AssignClassModal({ isOpen, onClose, paperTitle }: AssignClassModalProps) {
    const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
    const [isScheduling, setIsScheduling] = useState(false);

    const toggleClass = (id: string) => {
        setSelectedClasses(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-surface-base/80 backdrop-blur-md"
                />

                {/* Modal Content */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-2xl bg-surface-raised border border rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-subtle flex items-center justify-between bg-surface-card/50">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Zap size={14} className="text-indigo-400" />
                                <span className="text-[10px] font-bold text-content-tertiary uppercase tracking-widest">Assign Asset</span>
                            </div>
                            <h2 className="text-xl font-bold text-content-primary">학급 배정 및 배포</h2>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-content-tertiary hover:text-content-primary transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 space-y-8">
                        {/* Paper Info */}
                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
                            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                <FileText size={24} />
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-indigo-400/60 uppercase tracking-tighter">Selected Paper</div>
                                <div className="text-sm font-bold text-content-primary uppercase">{paperTitle}</div>
                            </div>
                        </div>

                        {/* Class Selection */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-content-tertiary uppercase tracking-widest flex items-center gap-2">
                                    <Users size={14} /> 대상 학급 선택
                                </h3>
                                <span className="text-[10px] text-content-muted font-medium">{selectedClasses.length}개 학급 선택됨</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {classes.map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => toggleClass(c.id)}
                                        className={`
                                            flex items-center justify-between p-4 rounded-2xl border transition-all text-left
                                            ${selectedClasses.includes(c.id)
                                                ? 'bg-white border-white'
                                                : 'bg-surface-card/50 border-subtle hover:border'}
                                        `}
                                    >
                                        <div>
                                            <div className={`text-sm font-bold mb-1 ${selectedClasses.includes(c.id) ? 'text-black' : 'text-content-primary'}`}>
                                                {c.name}
                                            </div>
                                            <div className={`text-[10px] font-medium ${selectedClasses.includes(c.id) ? 'text-content-muted' : 'text-content-tertiary'}`}>
                                                {c.students} Students • {c.time}
                                            </div>
                                        </div>
                                        {selectedClasses.includes(c.id) && (
                                            <div className="bg-surface-base rounded-full p-1 text-content-primary">
                                                <Check size={12} strokeWidth={4} />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Options */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-content-tertiary uppercase tracking-widest flex items-center gap-2">
                                    <Calendar size={14} /> 배포 설정
                                </h3>
                                <div className="bg-surface-card/50 rounded-2xl border border-subtle p-4 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-content-secondary">즉시 배포</span>
                                        <button
                                            onClick={() => setIsScheduling(!isScheduling)}
                                            className={`w-9 h-5 rounded-full p-1 transition-colors ${!isScheduling ? 'bg-indigo-600' : 'bg-surface-raised'}`}
                                        >
                                            <div className={`w-3 h-3 rounded-full bg-white transition-transform ${!isScheduling ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between opacity-50">
                                        <span className="text-xs text-content-secondary">예약 배포</span>
                                        <Clock size={14} className="text-content-muted" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-content-tertiary uppercase tracking-widest flex items-center gap-2">
                                    <Bell size={14} /> 알림 설정
                                </h3>
                                <div className="bg-surface-card/50 rounded-2xl border border-subtle p-4 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-content-secondary">학생 푸시 알림</span>
                                        <button className="w-9 h-5 bg-indigo-600 rounded-full p-1">
                                            <div className="w-3 h-3 translate-x-4 rounded-full bg-white" />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-content-secondary">학부모 리포트 예약</span>
                                        <button className="w-9 h-5 bg-surface-raised rounded-full p-1">
                                            <div className="w-3 h-3 translate-x-0 rounded-full bg-white" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 bg-surface-card/50 border-t border-subtle flex items-center justify-between">
                        <div className="flex items-center gap-2 text-content-tertiary text-[10px] font-bold uppercase">
                            <Lock size={12} /> Secure Distribution
                        </div>
                        <div className="flex gap-3">
                            <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-surface-raised hover:bg-zinc-700 text-xs font-bold text-content-primary transition-all">
                                취소
                            </button>
                            <button
                                disabled={selectedClasses.length === 0}
                                className={`
                                    px-8 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                                    ${selectedClasses.length > 0
                                        ? 'bg-white text-black hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                                        : 'bg-surface-raised text-content-tertiary cursor-not-allowed'}
                                `}
                            >
                                <Globe size={14} /> 배포 실행
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
