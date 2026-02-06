'use client';

import { motion } from 'framer-motion';
import { X, Smartphone, Printer, FileText, Download, Loader2, Hexagon } from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface PreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    content: string;
}

type PreviewMode = 'A4' | 'TABLET';

export function PreviewModal({ isOpen, onClose, content }: PreviewModalProps) {
    const [mode, setMode] = useState<PreviewMode>('A4');
    const [isGenerating, setIsGenerating] = useState(false);

    if (!isOpen) return null;

    const handleDownloadPDF = async () => {
        try {
            if (mode !== 'A4') {
                alert('PDF download is only available in A4 mode.');
                setMode('A4');
                return;
            }

            setIsGenerating(true);

            // Wait for mode switch render if needed
            await new Promise(resolve => setTimeout(resolve, 100));

            const element = document.getElementById('preview-a4-paper');
            if (!element) throw new Error('Preview element not found');

            const canvas = await html2canvas(element, {
                scale: 2, // High resolution
                useCORS: true,
                backgroundColor: '#ffffff'
            } as any);

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save('Kwasaram_Exam_Sheet.pdf');

        } catch (error) {
            console.error('PDF Generation Failed:', error);
            alert('Failed to generate PDF. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/90 backdrop-blur-2xl"
                onClick={onClose}
            />

            {/* Modal Container */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.3 }}
                className="relative z-10 w-full max-w-6xl h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6 px-4">
                    <div className="flex items-center gap-4 bg-zinc-900/50 p-1.5 rounded-xl border border-white/10 backdrop-blur-md">
                        <button
                            onClick={() => setMode('A4')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'A4' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
                        >
                            <Printer className="w-4 h-4" />
                            A4 Paper
                        </button>
                        <button
                            onClick={() => setMode('TABLET')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'TABLET' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
                        >
                            <Smartphone className="w-4 h-4" />
                            Student App
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleDownloadPDF}
                            disabled={isGenerating}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-400/20"
                        >
                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {isGenerating ? 'Generating...' : 'Download PDF'}
                        </button>
                        <div className="w-[1px] h-6 bg-white/10 mx-1" />
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors border border-white/5"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Preview Viewport */}
                <div className="flex-1 overflow-hidden flex items-center justify-center p-8">

                    {/* A4 MODE */}
                    {mode === 'A4' && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            id="preview-a4-paper"
                            className="bg-white text-black w-[210mm] max-h-full aspect-[210/297] shadow-2xl overflow-y-auto px-[20mm] py-[20mm] relative"
                        >
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-zinc-200 to-zinc-100" /> {/* Paper Binding Effect */}

                            <div className="flex justify-between items-end border-b-2 border-black pb-4 mb-8">
                                <div>
                                    <h1 className="text-2xl font-serif font-bold tracking-tight">수학 영역</h1>
                                    <p className="text-sm font-serif mt-1">2026학년도 1학기 중간고사 대비</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-4xl font-serif font-black">A</div>
                                    <div className="text-xs font-serif mt-1">고2 공통</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-12 h-full content-start">
                                {/* Left Column */}
                                <div className="border-r border-dashed border-gray-300 pr-12 h-full">
                                    <div className="mb-4">
                                        <span className="font-serif font-bold text-lg mr-2">1.</span>
                                        <span className="font-serif">다음 수식을 만족하는 값은? [3점]</span>
                                    </div>
                                    <div className="pl-4 py-4">
                                        <MathRenderer content={content} className="text-black text-lg" />
                                    </div>
                                    <div className="mt-8 space-y-2 font-serif text-sm">
                                        <p>① 12</p>
                                        <p>② 14</p>
                                        <p>③ 16</p>
                                        <p>④ 18</p>
                                        <p>⑤ 20</p>
                                    </div>
                                </div>

                                {/* Right Column (Placeholder for visual balance) */}
                                <div className="pl-2 opacity-30 select-none">
                                    <div className="mb-4">
                                        <span className="font-serif font-bold text-lg mr-2">2.</span>
                                        <span className="font-serif text-gray-400">.......................?</span>
                                    </div>
                                    <div className="h-32 bg-gray-100 rounded flex items-center justify-center">
                                        <span className="text-xs text-gray-400 font-serif">빈 문항 영역</span>
                                    </div>
                                </div>
                            </div>

                            {/* Footer - Professional Brand Footer */}
                            <div className="absolute bottom-[10mm] left-0 w-full px-[20mm] flex items-center justify-between font-serif text-[10px] text-zinc-400">
                                <div className="flex items-center gap-1 opacity-80">
                                    <span>ⓒ Gwasaram. All rights reserved.</span>
                                </div>

                                <div className="flex items-center gap-2 opacity-80">
                                    <Hexagon className="w-3 h-3 fill-zinc-300 text-zinc-400" />
                                    <span className="tracking-widest font-medium">과사람 With-People <span className="mx-1.5 text-zinc-300">|</span> 대치 본원</span>
                                </div>

                                <div className="flex items-center gap-1 opacity-80 font-medium">
                                    <span>-</span> <span>1</span> <span className="text-zinc-300">/</span> <span>1</span> <span>-</span>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* TABLET MODE */}
                    {mode === 'TABLET' && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="relative w-[1024px] max-w-full aspect-[4/3] bg-white rounded-[2rem] border-[12px] border-zinc-900 shadow-2xl overflow-hidden flex flex-col"
                        >
                            {/* Status Bar */}
                            <div className="h-6 bg-white px-6 flex items-center justify-between text-[10px] font-medium text-black">
                                <span>9:41</span>
                                <div className="flex gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-black" /> {/* Signal */}
                                    <div className="w-3 h-3 rounded-full bg-black/20" /> {/* WiFi */}
                                    <div className="w-6 h-3 rounded-full bg-black/20 border border-black" /> {/* Battery */}
                                </div>
                            </div>

                            {/* App Header */}
                            <div className="h-14 border-b flex items-center justify-between px-6 bg-white z-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                                        <FileText className="w-4 h-4" />
                                    </div>
                                    <span className="font-bold text-gray-900">단원별 모의고사 (미적분)</span>
                                </div>
                                <div className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">
                                    02:45 남음
                                </div>
                            </div>

                            {/* Problem View */}
                            <div className="flex-1 bg-slate-50 p-8 overflow-y-auto">
                                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-3xl mx-auto">
                                    <div className="flex gap-2 mb-6">
                                        <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold">Q. 01</span>
                                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-xs font-medium">4점</span>
                                    </div>

                                    <p className="text-lg font-medium text-slate-800 mb-6 leading-relaxed">
                                        다음 식을 만족하는 상수 <MathRenderer content="k" className="inline text-lg" />의 값을 구하시오.
                                    </p>

                                    <div className="p-8 bg-slate-50 rounded-xl border border-slate-200 flex justify-center my-8">
                                        <MathRenderer content={content} className="text-2xl text-slate-900" />
                                    </div>

                                    {/* Multiple Choice (App Style) */}
                                    <div className="grid grid-cols-1 gap-3">
                                        {[12, 14, 16, 18, 20].map((num, i) => (
                                            <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer group">
                                                <div className="w-6 h-6 rounded-full border-2 border-slate-300 group-hover:border-indigo-500 flex items-center justify-center text-xs font-bold text-slate-400 group-hover:text-indigo-600">
                                                    {i + 1}
                                                </div>
                                                <span className="text-base font-medium text-slate-700 group-hover:text-indigo-900">{num}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
