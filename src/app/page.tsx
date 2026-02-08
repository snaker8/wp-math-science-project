'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { ChevronRight, Zap, Target, BarChart3, ArrowUpRight } from 'lucide-react';

// --- Components ---

function Hero() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, 200]);
  const y2 = useTransform(scrollY, [0, 500], [0, -150]);
  const rotateX = useTransform(scrollY, [0, 800], [0, 25]);
  const opacity = useTransform(scrollY, [0, 600], [1, 0.5]);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-black pt-32 pb-20">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[128px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[128px] translate-x-1/3 translate-y-1/3 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.05] pointer-events-none" />

      {/* Content */}
      <div className="z-10 text-center px-6 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-indigo-300 backdrop-blur-md mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            v2.0 Public Beta is Live
          </span>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 leading-[1.1]">
            Math Academy OS <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50">
              for the Future
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            과사람 수학프로그램은 단순한 문제은행이 아닙니다. <br className="hidden md:block" />
            AI 정밀 채점과 완전무결한 오답 관리 루프로 수학 교육의 본질을 혁신합니다.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth/login" className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-full bg-indigo-600 px-8 font-medium text-white transition-all duration-300 hover:bg-indigo-500 hover:scale-105 active:scale-95">
              <div className="absolute inset-0 flex items-center justify-center [transform:skew(-12deg)_translateX(-100%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(100%)]">
                <div className="relative h-full w-8 bg-white/20" />
              </div>
              <span>Join Beta Waitlist</span>
              <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link href="/dashboard" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
              View Dashboard Demo
            </Link>
          </div>
        </motion.div>
      </div>

      {/* 3D Dashboard Visual */}
      <motion.div
        style={{ y: y1, rotateX, opacity }}
        className="relative mt-20 w-full max-w-6xl mx-auto px-4 perspective-1000"
      >
        <div className="relative rounded-2xl border border-white/10 bg-gray-900/50 backdrop-blur-xl shadow-2xl shadow-indigo-500/10 overflow-hidden aspect-[16/10] group">
          {/* Dashboard Header Mock */}
          <div className="h-10 border-b border-white/10 flex items-center px-4 gap-2 bg-white/5">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
              <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
            </div>
            <div className="flex-1 text-center text-[10px] text-gray-500 font-mono">dashboard.preview.tsx</div>
          </div>
          {/* Simple Mock Content */}
          <div className="p-8 grid grid-cols-3 gap-6 h-full">
            <div className="col-span-2 space-y-6">
              <div className="h-40 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 animate-pulse relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-100%] animate-shimmer" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="h-24 rounded-xl bg-white/5 border border-white/5" />
                <div className="h-24 rounded-xl bg-white/5 border border-white/5" />
              </div>
            </div>
            <div className="col-span-1 h-full rounded-xl bg-white/5 border border-white/5 flex flex-col p-4 gap-3">
              <div className="h-8 w-1/2 bg-white/10 rounded" />
              <div className="h-4 w-full bg-white/5 rounded" />
              <div className="h-4 w-3/4 bg-white/5 rounded" />
              <div className="mt-auto h-32 rounded bg-indigo-500/10 border border-indigo-500/20" />
            </div>
          </div>

          {/* Floating UI Elements */}
          <motion.div
            style={{ y: y2 }}
            className="absolute -right-10 top-20 bg-black/80 backdrop-blur-md border border-white/10 p-4 rounded-xl shadow-2xl z-20 w-64"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                <Zap size={20} fill="currentColor" />
              </div>
              <div>
                <div className="text-xs text-gray-400">AI Analysis</div>
                <div className="text-sm font-bold text-white">Optimization +24%</div>
              </div>
            </div>
            <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 w-[74%]" />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

function BentoItem({ title, description, icon: Icon, value, label, colSpan = 1 }: any) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={isInView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-8 hover:bg-white/[0.04] transition-colors ${colSpan === 2 ? 'md:col-span-2' : ''}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10 flex flex-col h-full justify-between">
        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-indigo-400 mb-6 group-hover:scale-110 transition-transform duration-300">
            <Icon size={24} />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
          <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
        </div>

        {value && (
          <div className="pt-6 border-t border-white/5">
            <div className="text-3xl font-bold text-white mb-1 flex items-baseline gap-1">
              {value}
              <span className="text-sm text-gray-500 font-normal">{label}</span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function BentoGrid() {
  return (
    <section className="bg-black py-32 px-6 relative">
      <div className="max-w-6xl mx-auto">
        <div className="mb-20">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Redefining <span className="text-indigo-500">Precision</span>
          </h2>
          <p className="text-gray-400 max-w-xl text-lg">
            데이터에 기반한 의사결정과 AI의 속도가 만나
            가장 완벽한 수학 교육 경험을 제공합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <BentoItem
            title="AI Precision Grading"
            description="단순 채점을 넘어 풀이 과정의 논리적 오류까지 찾아내는 딥러닝 기반 정밀 채점 시스템입니다."
            icon={Target}
            value="99.8%"
            label="Accuracy"
            colSpan={2}
          />
          <BentoItem
            title="Zero-Wrong Loop"
            description="틀린 문제는 3배수 유사 변형 문제로 자동 출제되어, 완벽히 이해할 때까지 반복됩니다."
            icon={Zap}
            value="3.5x"
            label="Speed"
          />
          <BentoItem
            title="Real-time Insights"
            description="학생의 학습 상태를 실시간으로 분석하여, 선생님과 학부모에게 즉각적인 피드백을 제공합니다."
            icon={BarChart3}
          />
          <BentoItem
            title="Seamless Cloud"
            description="어디서든 이어지는 끊김 없는 학습 경험. 태블릿, PC, 모바일 완벽 동기화."
            icon={ArrowUpRight}
            colSpan={2}
          />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-black border-t border-white/10 py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="text-center md:text-left">
          <div className="text-xl font-bold text-white tracking-tight mb-2">과사람 <span className="text-indigo-500">With-People</span></div>
          <p className="text-xs text-gray-500">© 2026 Math Academy OS. All rights reserved.</p>
        </div>
        <div className="flex gap-6 text-sm text-gray-400">
          <Link href="#" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="#" className="hover:text-white transition-colors">Terms</Link>
          <Link href="#" className="hover:text-white transition-colors">Contact</Link>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-indigo-500/30">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b border-white/5 bg-black/50 h-16 flex items-center px-6">
        <div className="max-w-6xl w-full mx-auto flex justify-between items-center">
          <div className="font-bold text-lg tracking-tight">With-People</div>
          <div className="flex gap-6 text-sm font-medium text-gray-300">
            <Link href="/auth/login" className="hover:text-white transition-colors">Login</Link>
            <Link href="/auth/signup" className="text-indigo-400 hover:text-indigo-300 transition-colors">Sign up</Link>
          </div>
        </div>
      </nav>

      <Hero />
      <BentoGrid />
      <Footer />
    </div>
  );
}
