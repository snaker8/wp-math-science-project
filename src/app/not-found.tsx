'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Home, RefreshCcw, AlertTriangle } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center relative overflow-hidden selection:bg-indigo-500/30">
            {/* 1. Background Grid (Coordinate System) */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

            {/* 2. Floating Mathematical Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    animate={{
                        y: [0, -20, 0],
                        rotate: [0, 5, -5, 0],
                        opacity: [0.1, 0.3, 0.1]
                    }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-1/4 left-1/4 text-9xl font-bold text-indigo-500/5 blur-sm"
                >
                    404
                </motion.div>
                <motion.div
                    animate={{
                        y: [0, 30, 0],
                        x: [0, 20, 0],
                        rotate: [0, -10, 10, 0],
                        opacity: [0.1, 0.2, 0.1]
                    }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute bottom-1/3 right-1/4 text-[10rem] font-serif text-white/5 blur-md"
                >
                    ∫
                </motion.div>
                <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                    transition={{ duration: 5, repeat: Infinity }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px]"
                />
            </div>

            {/* 3. Main Content */}
            <div className="relative z-10 text-center px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="inline-flex items-center justify-center p-4 bg-indigo-500/10 rounded-full mb-8 ring-1 ring-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                        <AlertTriangle size={32} className="text-indigo-400" />
                    </div>

                    <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
                        404
                    </h1>

                    <h2 className="text-2xl md:text-3xl font-light text-indigo-200 mb-6 tracking-wide">
                        Undefined Coordinate
                    </h2>

                    <p className="text-zinc-400 max-w-md mx-auto mb-10 text-lg leading-relaxed">
                        요청하신 좌표는 현재 함수의 <span className="text-indigo-400 font-mono">domain</span>에 포함되어 있지 않습니다.<br />
                        경로를 재계산하여 이동해주세요.
                    </p>

                    <Link href="/dashboard">
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white text-black rounded-xl font-bold text-lg overflow-hidden transition-all hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
                            <RefreshCcw size={20} className="group-hover:rotate-180 transition-transform duration-500" />
                            <span>Recalculate Path</span>
                            <ArrowIcon />
                        </motion.button>
                    </Link>
                </motion.div>
            </div>

            {/* 4. Footer Technical Detail */}
            <div className="absolute bottom-8 text-center text-xs text-zinc-600 font-mono">
                Error Code: 0x194 | System Status: Stable | <Link href="/support" className="hover:text-indigo-400 underline decoration-zinc-700 underline-offset-4 transition-colors">Contact Support</Link>
            </div>
        </div>
    );
}

function ArrowIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="transform group-hover:translate-x-1 transition-transform">
            <path d="M3.33331 8H12.6666" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 3.33331L12.6667 7.99998L8 12.6666" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}
