'use client';

// ... imports
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    UploadCloud,
    FileText,
    CheckCircle2,
    ScanLine,
    BrainCircuit,
    ArrowRight,
    Loader2,
    Send,
    RefreshCw,
    AlertCircle
} from 'lucide-react';
import { GlowCard } from '@/components/shared/GlowCard';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { DeepGradingPanel } from '@/components/workflow/DeepGradingPanel';
import CloudFlowUploader from '@/components/workflow/CloudFlowUploader';
import { supabaseBrowser } from '@/lib/supabase/client';

// Type Definitions
type WorkflowStep = 'upload' | 'grading' | 'clinic';

interface GradingCheckItem {
    id: string;
    label: string;
    status: 'pending' | 'processing' | 'completed';
}

export default function WorkflowPage() {
    const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
    const [userId, setUserId] = useState<string>('');

    // Fetch User ID
    useEffect(() => {
        const fetchUser = async () => {
            if (supabaseBrowser) {
                const { data: { user } } = await supabaseBrowser.auth.getUser();
                if (user) {
                    setUserId(user.id);
                }
            }
        };
        fetchUser();
    }, []);

    // Grading State
    const [gradingChecks, setGradingChecks] = useState<GradingCheckItem[]>([
        { id: 'ocr', label: '필적 인식 (OCR)', status: 'pending' },
        { id: 'analysis', label: '풀이 과정 분석', status: 'pending' },
        { id: 'error', label: '오류 식별', status: 'pending' },
        { id: 'score', label: '최종 점수 산출', status: 'pending' },
    ]);

    // Handle File Drop (Legacy Mock - Removed)

    // Simulate Grading Process (Legacy Mock - Kept for visualization if needed)
    const startGradingProcess = () => {
        const sequence = ['ocr', 'analysis', 'error', 'score'];
        let currentIndex = 0;

        const interval = setInterval(() => {
            if (currentIndex >= sequence.length) {
                clearInterval(interval);
                setTimeout(() => setCurrentStep('clinic'), 800);
                return;
            }

            setGradingChecks(prev => prev.map((item, idx) => {
                if (idx === currentIndex) return { ...item, status: 'completed' };
                if (idx === currentIndex + 1) return { ...item, status: 'processing' };
                return item;
            }));

            currentIndex++;
        }, 1200);
    };

    return (
        <div className="min-h-screen p-8 max-w-7xl mx-auto space-y-12">
            {/* 1. Header & Stepper */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">완전학습 워크플로우</h1>
                    <p className="text-zinc-400 text-sm">Upload → Deep Grading → Zero-Wrong Clinic</p>
                </div>

                {/* Minimal Stepper */}
                <div className="flex items-center gap-4">
                    {['upload', 'grading', 'clinic'].map((step, idx) => {
                        const isActive = step === currentStep;
                        const isCompleted =
                            (currentStep === 'grading' && step === 'upload') ||
                            (currentStep === 'clinic');

                        return (
                            <div key={step} className="flex items-center gap-3">
                                <div className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-300
                  ${isActive
                                        ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                                        : isCompleted
                                            ? 'bg-zinc-900 border-zinc-700 text-zinc-500'
                                            : 'bg-zinc-900/50 border-white/5 text-zinc-600'
                                    }
                `}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-indigo-400 animate-pulse' : isCompleted ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                                    <span className="uppercase tracking-wide">
                                        {step === 'upload' ? 'Cloud Flow' : step === 'grading' ? 'Deep Grading' : 'Zero-Wrong Loop'}
                                    </span>
                                </div>
                                {idx < 2 && <div className="w-6 h-[1px] bg-zinc-800" />}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 2. Main Content Area */}
            <div className="relative min-h-[600px]">
                <AnimatePresence mode="wait">

                    {/* STEP 1: Cloud Flow (Upload) */}
                    {currentStep === 'upload' && (
                        <motion.div
                            key="upload"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.4 }}
                            className="w-full h-full flex flex-col items-center justify-start pt-10"
                        >
                            <div className="w-full max-w-3xl">
                                <CloudFlowUploader
                                    userId={userId}
                                    onComplete={(results) => {
                                        // Optional: Automatically move to next step or show specific results
                                        // For now, we stay here to see the results in the uploader list
                                        // or user can manually click a button to proceed if we add one.
                                        console.log("Upload & Analysis Complete", results);
                                    }}
                                />
                            </div>
                        </motion.div>
                    )}

                    {/* STEP 2: Deep Grading */}
                    {currentStep === 'grading' && (
                        <motion.div
                            key="grading"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            transition={{ duration: 0.5 }}
                            className="w-full h-full"
                        >
                            <DeepGradingPanel checks={gradingChecks} />
                        </motion.div>
                    )}

                    {/* STEP 3: Clinic (Zero-Wrong Loop) */}
                    {currentStep === 'clinic' && (
                        <motion.div
                            key="clinic"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.6 }}
                            className="w-full pt-4"
                        >
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[700px]">
                                {/* 1. Original Error (Left) */}
                                <div className="lg:col-span-5 flex flex-col gap-6">
                                    <GlowCard className="h-full flex flex-col relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-3 bg-rose-500/10 rounded-bl-xl border-l border-b border-rose-500/20 text-rose-400 text-xs font-bold flex items-center gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            주요 오답
                                        </div>

                                        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                                            <ScanLine className="w-5 h-5 text-zinc-400" />
                                            원본 오답 분석
                                        </h3>

                                        <div className="flex-1 bg-zinc-950/50 rounded-xl border border-dashed border-zinc-800 p-6 flex flex-col items-center justify-center relative">
                                            <div className="absolute top-4 left-4 text-xs text-zinc-600 font-mono">Q. 14번 문항</div>
                                            <div className="w-full max-w-[80%] opacity-80 filter brightness-90">
                                                {/* Placeholder for Handwriting Image */}
                                                <div className="aspect-[4/3] bg-zinc-900 rounded-lg flex items-center justify-center border border-white/5">
                                                    <span className="text-zinc-600 text-sm">학생 풀이 이미지 영역</span>
                                                </div>
                                            </div>
                                            <div className="mt-6 p-4 w-full bg-rose-500/5 border border-rose-500/10 rounded-lg">
                                                <p className="text-sm text-zinc-300 leading-relaxed">
                                                    <span className="text-rose-400 font-semibold mb-1 block">Diagnosis:</span>
                                                    로그 부등식의 진수 성립 조건(x{'>'}0)을 누락하여 해의 범위를 잘못 도출함.
                                                </p>
                                            </div>
                                        </div>
                                    </GlowCard>
                                </div>

                                {/* 2. Twin Problems (Right) */}
                                <div className="lg:col-span-7 flex flex-col gap-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                            <BrainCircuit className="w-6 h-6 text-emerald-400" />
                                            AI Twin Problems 생성 완료
                                        </h3>
                                        <button className="text-xs text-zinc-500 flex items-center gap-1 hover:text-white transition-colors">
                                            <RefreshCw className="w-3 h-3" /> 재생성
                                        </button>
                                    </div>

                                    <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                                        {[1, 2, 3].map((num) => (
                                            <div key={num} className="bg-zinc-900 border border-white/5 rounded-xl p-5 hover:border-emerald-500/30 transition-all cursor-pointer group">
                                                <div className="flex justify-between items-start mb-3">
                                                    <h4 className="text-sm font-medium text-emerald-400">유사 문항 {num}</h4>
                                                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-white/5">난이도: 상</span>
                                                </div>
                                                <MathRenderer
                                                    content={`f(x) = \\log_2(x-${num}) + \\log_2(x+${num * 2}) < 4`}
                                                    className="text-zinc-300 text-sm mb-3"
                                                />
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                                                    <button className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 rounded border border-white/10">교체</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Bottom Action */}
                                    <div className="mt-2 flex justify-end">
                                        <button className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:scale-105 transition-all">
                                            <Send className="w-4 h-4" />
                                            학생에게 클리닉 전송
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>
        </div>
    );
}
