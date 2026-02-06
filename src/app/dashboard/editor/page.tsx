'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Save,
    Share2,
    Sparkles,
    Search,
    FileText,
    Star,
    ChevronRight,
    ChevronLeft,
    Settings,
    RefreshCw,
    ArrowRightLeft,
    Calculator,
    Sigma,
    Pi,
    Eye
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { PreviewModal } from '@/components/editor/PreviewModal';

// Mock Data
const LIBRARY_ITEMS = [
    { id: '1', title: '23년 6월 모의고사 30번 (OCR)', type: 'SCAN', date: '2023.06.01' },
    { id: '2', title: '수학(상) 다항식 예제', type: 'MANUAL', date: '2023.05.28' },
    { id: '3', title: '미적분 킬러문제 모음.pdf', type: 'PDF', date: '2023.05.20' },
    { id: '4', title: '22년 4월 학평 21번', type: 'SCAN', date: '2023.04.15' },
];

const AI_SUGGESTIONS = [
    { id: 1, level: '유사', content: 'f(x) = x^3 - 3x^2 + 4' },
    { id: 2, level: '심화', content: 'f(x) = \\int_{0}^{x} (t^2 - 3t + 4) dt' },
    { id: 3, level: '변형', content: 'g(x) = f(x) + k' },
];

export default function ProblemEditorPage() {
    const [activeItem, setActiveItem] = useState('1');
    const [latexContent, setLatexContent] = useState<string>('f(x) = \\lim_{n \\to \\infty} \\frac{1}{1+x^{2n}}');
    const [difficulty, setDifficulty] = useState(3);
    const [showAiPanel, setShowAiPanel] = useState(true);
    const [showPreview, setShowPreview] = useState(false);

    // insert text at cursor position (simplified for textarea)
    const insertLatex = (latex: string) => {
        setLatexContent(prev => prev + ' ' + latex);
    };

    return (
        <div className="flex h-[calc(100vh-2rem)] gap-0 overflow-hidden bg-zinc-950 text-zinc-300 font-sans">

            {/* 
        ============================================================================
        COL 1: LEFT LIBRARY (20%)
        ============================================================================ 
      */}
            <div className="w-[280px] flex-shrink-0 flex flex-col border-r border-white/5 bg-zinc-900/30">
                <div className="h-14 flex items-center px-4 border-b border-white/5 justify-between">
                    <span className="font-semibold text-zinc-100 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-400" />
                        Library
                    </span>
                    <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded border border-white/5">
                        {LIBRARY_ITEMS.length} items
                    </span>
                </div>

                <div className="p-3 border-b border-white/5">
                    <div className="relative group">
                        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-600 transition-colors group-hover:text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search resources..."
                            className="w-full bg-zinc-950/50 border border-white/5 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-zinc-700"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pt-2 custom-scrollbar">
                    {LIBRARY_ITEMS.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveItem(item.id)}
                            className={`
                w-full text-left p-3 rounded-lg mb-1 transition-all duration-200 group border border-transparent
                ${activeItem === item.id
                                    ? 'bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                                    : 'hover:bg-white/5 hover:border-white/5'}
              `}
                        >
                            <div className="flex items-start justify-between mb-1">
                                <span className={`text-sm font-medium transition-colors ${activeItem === item.id ? 'text-indigo-200' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                                    {item.title}
                                </span>
                                {activeItem === item.id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shadow-[0_0_5px_currentColor]" />}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                                <span className={`px-1.5 rounded border ${item.type === 'SCAN' ? 'bg-amber-900/20 border-amber-500/20 text-amber-500' :
                                    item.type === 'PDF' ? 'bg-rose-900/20 border-rose-500/20 text-rose-500' :
                                        'bg-emerald-900/20 border-emerald-500/20 text-emerald-500'
                                    }`}>
                                    {item.type}
                                </span>
                                <span>{item.date}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 
        ============================================================================
        COL 2: CENTER EDITOR (MAIN)
        ============================================================================ 
      */}
            <div className="flex-1 flex flex-col min-w-0 bg-zinc-950 relative">
                {/* Floating Toolbar (Top) */}
                <div className="h-14 border-b border-indigo-500/10 flex items-center justify-between px-6 bg-zinc-900/20 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-4">
                        <h1 className="text-zinc-200 font-bold text-sm">Problem Editor</h1>
                        <div className="h-4 w-[1px] bg-white/10" />
                        <div className="flex items-center gap-1">
                            {[
                                { label: 'Fraction', tex: '\\frac{a}{b}', icon: <span className="font-serif italic">a/b</span> },
                                { label: 'Sqrt', tex: '\\sqrt{x}', icon: <span className="font-serif">√</span> },
                                { label: 'Sum', tex: '\\sum', icon: <Sigma className="w-3.5 h-3.5" /> },
                                { label: 'Int', tex: '\\int', icon: <span className="font-serif italic text-sm">∫</span> }
                            ].map((tool, i) => (
                                <button
                                    key={i}
                                    onClick={() => insertLatex(tool.tex)}
                                    className="p-1.5 rounded hover:bg-white/5 text-zinc-500 hover:text-indigo-400 transition-colors"
                                    title={tool.label}
                                >
                                    {tool.icon}
                                </button>
                            ))}
                            <button className="p-1.5 rounded hover:bg-white/5 text-zinc-500 hover:text-indigo-400 transition-colors ml-1">
                                <HistoryIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowPreview(true)}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/5 bg-zinc-900 text-zinc-400 hover:text-white hover:border-indigo-500/50 hover:shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all"
                        >
                            <Eye className="w-3.5 h-3.5" />
                            Preview
                        </button>
                        <button
                            onClick={() => setShowAiPanel(!showAiPanel)}
                            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all
                  ${showAiPanel
                                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                                    : 'bg-zinc-900 text-zinc-500 border-white/5 hover:text-zinc-300'}
                `}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            AI Logic
                        </button>
                    </div>
                </div>

                {/* Start of Split View Editor */}
                <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">

                    {/* Left: Raw Input */}
                    <div className="flex-1 flex flex-col border-r border-white/5 bg-zinc-900/10">
                        <div className="flex-1 relative">
                            <textarea
                                value={latexContent}
                                onChange={(e) => setLatexContent(e.target.value)}
                                className="w-full h-full bg-transparent p-6 text-sm font-mono text-zinc-300 resize-none focus:outline-none custom-scrollbar leading-relaxed"
                                spellCheck={false}
                                placeholder="Type LaTeX content here..."
                            />
                        </div>
                        <div className="px-4 py-2 text-[10px] text-zinc-600 border-t border-white/5 font-mono select-none">
                            LaTeX Mode Active • {latexContent.length} chars
                        </div>
                    </div>

                    {/* Right: Live Preview */}
                    <div className="flex-1 bg-[url('/grid-pattern.svg')] flex flex-col relative overflow-hidden">
                        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                        <div className="flex-1 p-8 flex items-center justify-center overflow-auto custom-scrollbar">
                            <div className="bg-zinc-900/80 backdrop-blur border border-white/5 p-8 rounded-xl shadow-2xl shadow-black/50 min-w-[300px] text-center">
                                <MathRenderer content={latexContent || '\\text{No content}'} className="text-xl text-indigo-100" />
                            </div>
                        </div>

                        <div className="absolute top-4 right-4 px-2 py-1 bg-black/50 backdrop-blur rounded text-[10px] text-zinc-500 font-mono border border-white/5">
                            LIVE PREVIEW
                        </div>
                    </div>

                </div>

                {/* Sticky Footer */}
                <div className="h-16 border-t border-indigo-500/20 bg-zinc-900/80 backdrop-blur-md flex items-center justify-between px-6 absolute bottom-0 w-full z-20">
                    <div className="text-xs text-zinc-500">
                        Last saved 2 mins ago
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors">
                            Preview
                        </button>
                        <button className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] transition-all flex items-center gap-2">
                            <Save className="w-3.5 h-3.5" />
                            Save to Repository
                        </button>
                    </div>
                </div>

            </div>

            {/* 
        ============================================================================
        COL 3: RIGHT AI METADATA (30% - Collapsible)
        ============================================================================ 
      */}
            <AnimatePresence>
                {showAiPanel && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 320, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="flex-shrink-0 border-l border-white/5 bg-zinc-900/30 flex flex-col"
                    >
                        <div className="h-14 flex items-center px-5 border-b border-white/5">
                            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                <Settings className="w-3.5 h-3.5" />
                                Configuration
                            </h2>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8 custom-scrollbar pb-24">

                            {/* 1. Metadata Form */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-zinc-200">Properties</h3>

                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-500 uppercase font-medium">Difficulty</label>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <button
                                                key={star}
                                                onClick={() => setDifficulty(star)}
                                                className={`p-1 transition-colors ${star <= difficulty ? 'text-amber-400' : 'text-zinc-800'}`}
                                            >
                                                <Star className="w-5 h-5 fill-current" />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-500 uppercase font-medium">Topic Tag</label>
                                    <select className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:border-indigo-500/50 outline-none appearance-none">
                                        <option>Calculus &gt; Limits</option>
                                        <option>Geometry &gt; Vectors</option>
                                    </select>
                                </div>
                            </div>

                            <div className="h-[1px] bg-white/5" />

                            {/* 2. AI Generator */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-emerald-400" />
                                        AI Twin Generator
                                    </h3>
                                    <button className="p-1.5 rounded-md hover:bg-white/5 text-zinc-500 hover:text-emerald-400">
                                        <RefreshCw className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <p className="text-xs text-zinc-500 leading-relaxed">
                                    Based on current LaTeX content, AI suggests 3 variations. Click to swap.
                                </p>

                                <div className="space-y-3">
                                    {AI_SUGGESTIONS.map((sug) => (
                                        <div
                                            key={sug.id}
                                            onClick={() => setLatexContent(sug.content)}
                                            className="group relative p-3 rounded-xl border border-white/5 bg-zinc-950 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all cursor-pointer"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-white/5 text-zinc-400 group-hover:text-indigo-300 transition-colors">
                                                    {sug.level}
                                                </span>
                                                <ArrowRightLeft className="w-3 h-3 text-zinc-600 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                                            </div>
                                            <div className="text-xs text-zinc-300 font-mono truncate opacity-60 group-hover:opacity-100 transition-opacity">
                                                {sug.content}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button className="w-full py-2.5 rounded-lg border border-dashed border-zinc-700 text-zinc-500 text-xs font-medium hover:border-indigo-500/30 hover:text-indigo-400 hover:bg-indigo-500/5 transition-all">
                                    + Generate More
                                </button>
                            </div>

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Preview Modal */}
            <AnimatePresence>
                {showPreview && (
                    <PreviewModal
                        isOpen={showPreview}
                        onClose={() => setShowPreview(false)}
                        content={latexContent}
                    />
                )}
            </AnimatePresence>

        </div>
    );
}

function HistoryIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12" />
            <path d="M3 3v9h9" />
            <path d="M12 7v5l4 2" />
        </svg>
    )
}
