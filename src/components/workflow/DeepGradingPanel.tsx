'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanLine,
  CheckCircle2,
  Loader2,
  ArrowDown,
  Binary,
  Search,
  Zap
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';

interface GradingCheckItem {
  id: string;
  label: string;
  status: 'pending' | 'processing' | 'completed';
}

interface DeepGradingPanelProps {
  checks?: GradingCheckItem[];
  answers?: any[];
  examTitle?: string;
  onGrade?: (answerId: string, status: any, feedback?: string) => Promise<void>;
  onComplete?: () => void;
}

export function DeepGradingPanel({ checks = [], answers, examTitle, onGrade, onComplete }: DeepGradingPanelProps) {
  // Mock Data for "Detected" formulas
  const detectedFormulas = [
    { id: 1, raw: 'log_2(x-1) + log_2(x+2) < 4', parsed: '\\log_2(x-1) + \\log_2(x+2) < 4', stage: 'analysis' },
    { id: 2, raw: '(x-1)(x+2) < 2^4', parsed: '(x-1)(x+2) < 16', stage: 'analysis' },
    { id: 3, raw: 'x^2 + x - 2 - 16 < 0', parsed: 'x^2 + x - 18 < 0', stage: 'error' }, // Error point
    { id: 4, raw: 'Condition: x>1', parsed: '\\text{Condition: } x > 1', stage: 'score' }
  ];

  return (
    <div className="w-full max-w-6xl mx-auto pt-4 grid grid-cols-1 lg:grid-cols-2 gap-8 h-[600px]">

      {/* LEFT: Scanning Area */}
      <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900/50 group">
        {/* Background Grid (Digital Overlay) */}
        <div className="absolute inset-0 opacity-[0.1]"
          style={{ backgroundImage: 'linear-gradient(rgba(129, 140, 248, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(129, 140, 248, 0.2) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />

        {/* Mock Handwriting Image Placeholder */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-zinc-700 text-lg font-handwriting italic opacity-30 select-none">
            (Handwritten Solution Image)
            <br />
            log2(x-1) + log2(x+2) {'<'} 4
            <br />
            ...
          </span>
        </div>

        {/* 1. Scanning Line Animation */}
        <motion.div
          className="absolute left-0 right-0 h-1 bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,1)] z-20"
          animate={{ top: ['0%', '100%', '0%'] }}
          transition={{ duration: 4, ease: "linear", repeat: Infinity }}
        />

        {/* Scanning Gradient Trail */}
        <motion.div
          className="absolute left-0 right-0 h-24 bg-gradient-to-b from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 z-10"
          animate={{ top: ['-5%', '95%', '-5%'] }}
          transition={{ duration: 4, ease: "linear", repeat: Infinity }}
        />

        {/* Bounding Boxes (Appearing randomly) */}
        <AnimatePresence>
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{
                opacity: [0, 1, 1, 0],
                borderColor: ['rgba(99,102,241,0)', 'rgba(99,102,241,0.8)', 'rgba(99,102,241,0.8)', 'rgba(99,102,241,0)']
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 1 + i,
                times: [0, 0.1, 0.8, 1]
              }}
              className="absolute border border-indigo-500/50 rounded bg-indigo-500/5 z-10 box-content"
              style={{
                top: `${20 + i * 20}%`,
                left: `${10 + i * 15}%`,
                width: '200px',
                height: '40px'
              }}
            >
              <div className="absolute -top-3 -right-1 text-[8px] text-indigo-400 font-mono bg-zinc-900 border border-indigo-500/30 px-1 rounded">
                CONF: {(0.9 + i * 0.02).toFixed(2)}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Status Indicators */}
        <div className="absolute bottom-4 left-4 flex items-center gap-3 z-30">
          <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-indigo-500/30 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
            <span className="text-xs text-indigo-200 font-mono">SCANNING...</span>
          </div>
          <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-2">
            <Binary className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs text-zinc-400 font-mono">VECTORIZING...</span>
          </div>
        </div>
      </div>

      {/* RIGHT: Digital Transformation (KaTeX Morphing) */}
      <div className="flex flex-col h-full">
        <div className="mb-6 pb-4 border-b border-white/5">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400 fill-amber-400/20" />
            Digital Analysis
          </h2>
          <p className="text-zinc-500 text-sm mt-1">AI가 필기를 인식하여 논리 구조를 분석합니다.</p>
        </div>

        {/* Process Steps */}
        <div className="flex-1 space-y-6 overflow-y-auto custom-scrollbar pr-2">
          {/* 1. Checklist (Summary) */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {checks.map((check) => (
              <div key={check.id} className={`
                      flex items-center gap-2 p-3 rounded-lg border text-xs font-medium transition-colors
                      ${check.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : check.status === 'processing' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                    : 'bg-zinc-900 border-white/5 text-zinc-600'}
                  `}>
                {check.status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : check.status === 'processing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <div className="w-3.5 h-3.5 rounded-full border border-current opacity-50" />}
                {check.label}
              </div>
            ))}
          </div>

          {/* 2. Detected Logic Flow (KaTeX Stream) */}
          <div className="relative pl-6 border-l border-dashed border-zinc-800 space-y-8">
            {detectedFormulas.map((formula, idx) => (
              <motion.div
                key={formula.id}
                initial={{ opacity: 0, x: -10, filter: 'blur(8px)' }}
                animate={{
                  opacity: checks[1]?.status === 'processing' || checks[1]?.status === 'completed' ? 1 : 0,
                  x: 0,
                  filter: 'blur(0px)'
                }}
                transition={{ delay: idx * 0.8, duration: 0.8 }}
                className="relative group"
              >
                {/* Logic Connector Arrow (Visual) */}
                {idx > 0 && (
                  <div className="absolute -top-6 -left-[25px] flex justify-center w-4">
                    <ArrowDown className="w-3 h-3 text-zinc-700" />
                  </div>
                )}

                {/* Timeline Dot */}
                <div className={`absolute -left-[29px] top-3 w-2.5 h-2.5 rounded-full border-2 bg-zinc-950 transition-colors duration-500
                          ${formula.stage === 'error' ? 'border-rose-500' : 'border-indigo-500'}
                      `} />

                <div className={`
                          p-4 rounded-xl border transition-all duration-300
                          ${formula.stage === 'error'
                    ? 'bg-rose-950/20 border-rose-500/30 hover:bg-rose-500/10'
                    : 'bg-zinc-900 border-white/5 hover:border-indigo-500/30'}
                      `}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                      {formula.stage === 'error' ? 'LOGIC ERROR DETECTED' : `STEP ${idx + 1} DETECTED`}
                    </span>
                    {formula.stage === 'error' && (
                      <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded">Check Required</span>
                    )}
                  </div>

                  {/* KaTeX Renderer with Glow */}
                  <div className={`text-base font-medium ${formula.stage === 'error' ? 'text-rose-300' : 'text-indigo-300 drop-shadow-[0_0_8px_rgba(99,102,241,0.15)]'}`}>
                    <MathRenderer content={formula.parsed} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeepGradingPanel;
