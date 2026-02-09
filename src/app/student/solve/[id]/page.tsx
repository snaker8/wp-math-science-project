'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Send, Sparkles, Lightbulb, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Mock Problem Data
const problemData = {
    id: 'p1',
    title: '삼각함수의 활용',
    content: `삼각형 ABC에서 $a=8, b=10, \\cos C = \\frac{1}{2}$일 때, 변 $c$의 길이를 구하시오.`,
    isEssay: false,
};

export default function SolvePage() {
    const router = useRouter();
    const [answer, setAnswer] = useState('');
    const [showHint, setShowHint] = useState(false);

    // AI Chat Mock
    const [aiChatOpen, setAiChatOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'ai' | 'user', text: string }[]>([
        { role: 'ai', text: '안녕하세요! 문제 풀다가 막히면 언제든 물어보세요. 제가 힌트를 드릴게요!' }
    ]);
    const [inputMsg, setInputMsg] = useState('');

    const handleSendMessage = () => {
        if (!inputMsg.trim()) return;
        setMessages(prev => [...prev, { role: 'user', text: inputMsg }]);
        setInputMsg('');

        // Mock AI Response
        setTimeout(() => {
            setMessages(prev => [...prev, { role: 'ai', text: '코사인 법칙을 사용해보는 건 어떨까요? $c^2 = a^2 + b^2 - 2ab\\cos C$ 공식을 떠올려보세요.' }]);
        }, 1000);
    };

    return (
        <div className="min-h-screen bg-white text-zinc-900 font-sans flex flex-col">
            {/* Header */}
            <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10">
                <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <div className="flex flex-col items-center">
                    <span className="text-xs font-medium text-gray-500">Problem 01/10</span>
                    <div className="w-32 h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-indigo-500 w-[10%]" />
                    </div>
                </div>
                <button
                    onClick={() => setAiChatOpen(true)}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                >
                    <Sparkles size={24} />
                </button>
            </header>

            {/* Problem Content */}
            <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
                <span className="inline-block bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded mb-4">
                    {problemData.title}
                </span>

                {/* Math Content (Mock Rendering) */}
                <div className="text-lg leading-relaxed font-serif mb-12">
                    삼각형 ABC에서 <span className="font-serif italic">a=8</span>, <span className="font-serif italic">b=10</span>, <span className="font-serif italic">cos C = 1/2</span>일 때, 변 <span className="font-serif italic">c</span>의 길이를 구하시오.
                </div>

                {/* Input Area */}
                <div className="space-y-6">
                    <div className="relative">
                        <input
                            type="text"
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            placeholder="정답을 입력하세요"
                            className="w-full text-center text-2xl font-bold border-b-2 border-gray-200 py-4 focus:outline-none focus:border-indigo-600 transition-colors bg-transparent"
                        />
                        <span className="absolute right-0 bottom-4 text-gray-400 font-serif italic">c = ?</span>
                    </div>

                    <div className="flex gap-3">
                        <button
                            className="flex-1 bg-gray-100 text-gray-600 font-bold py-4 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                            onClick={() => setShowHint(!showHint)}
                        >
                            <Lightbulb size={20} className={showHint ? "text-amber-500 fill-amber-500" : ""} />
                            {showHint ? "힌트 닫기" : "힌트 보기"}
                        </button>
                        <button
                            onClick={() => {
                                if (!answer.trim()) {
                                    alert('정답을 입력해주세요.');
                                    return;
                                }
                                const correctAnswer = '2√21';
                                const isCorrect = answer.trim() === correctAnswer || answer.trim() === '2루트21' || answer.trim() === '2root21';
                                if (isCorrect) {
                                    alert('🎉 정답입니다! 잘했어요!\n\n코사인 법칙을 정확히 적용했습니다.');
                                } else {
                                    alert(`❌ 오답입니다.\n\n입력한 답: ${answer}\n정답: ${correctAnswer}\n\n코사인 법칙: c² = a² + b² - 2ab·cosC\n= 64 + 100 - 2(8)(10)(1/2)\n= 164 - 80 = 84\nc = √84 = 2√21`);
                                }
                            }}
                            className="flex-[2] bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30"
                        >
                            제출하기
                        </button>
                    </div>

                    {/* Simple Hint Box */}
                    <AnimatePresence>
                        {showHint && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-amber-800 text-sm">
                                    💡 <strong>Hint:</strong> 코사인 법칙을 사용하세요.
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            {/* AI Tutor Chat Overlay */}
            <AnimatePresence>
                {aiChatOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: '100%' }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: '100%' }}
                        transition={{ duration: 0.3, ease: 'circOut' }}
                        className="fixed inset-0 z-50 bg-white flex flex-col"
                    >
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white shadow-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                                    <Sparkles size={16} />
                                </div>
                                <span className="font-bold">AI Math Tutor</span>
                            </div>
                            <button onClick={() => setAiChatOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-tr-none'
                                            : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm'
                                        }`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-white">
                            <div className="flex gap-2">
                                <input
                                    value={inputMsg}
                                    onChange={(e) => setInputMsg(e.target.value)}
                                    placeholder="질문을 입력하세요..."
                                    className="flex-1 bg-gray-100 border-none rounded-full px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                />
                                <button
                                    onClick={handleSendMessage}
                                    className="bg-indigo-600 text-white p-3 rounded-full hover:bg-indigo-700 transition-colors"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
