'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send,
    Image as ImageIcon,
    Paperclip,
    Smile,
    MoreVertical,
    ChevronLeft,
    Zap,
    MessageSquare,
    CheckCheck,
    Search,
    User
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';

// ============================================================================
// Types & Mock Data
// ============================================================================

interface Message {
    id: string;
    sender: 'user' | 'tutor' | 'ai';
    content: string;
    timestamp: string;
    isMath?: boolean;
    status?: 'sent' | 'read';
}

const mockMessages: Message[] = [
    { id: '1', sender: 'tutor', content: '안녕하세요 정우님! 오늘 학습하신 "이차함수" 단원에서 궁금한 점이 있으신가요?', timestamp: '오후 2:30', status: 'read' },
    { id: '2', sender: 'user', content: '네 선생님, 이 문제에서 판별식을 어떻게 활용해야 할지 잘 모르겠어요.', timestamp: '오후 2:31', status: 'read' },
    { id: '3', sender: 'user', content: 'D = b^2 - 4ac > 0 이면 항상 서로 다른 두 실근을 갖는 건가요?', timestamp: '오후 2:31', isMath: true, status: 'read' },
    { id: '4', sender: 'tutor', content: '맞습니다! 계수가 실수라는 조건하에 판별식이 0보다 크면 항상 서로 다른 두 실근을 갖게 됩니다.', timestamp: '오후 2:32', status: 'sent' },
];

const aiSuggestions = [
    "근의 공식과의 관계를 설명해줄까요?",
    "판별식이 0인 경우도 함께 알아볼까요?",
    "관련된 예제 문제를 하나 풀어볼까요?"
];

// ============================================================================
// Components
// ============================================================================

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>(mockMessages);
    const [inputValue, setInputValue] = useState('');

    const handleSend = () => {
        if (!inputValue.trim()) return;
        const newMessage: Message = {
            id: Date.now().toString(),
            sender: 'tutor',
            content: inputValue,
            timestamp: new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }),
            status: 'sent'
        };
        setMessages([...messages, newMessage]);
        setInputValue('');
    };

    return (
        <div className="flex h-screen bg-[#F5F5F7] text-[#1D1D1F]">
            {/* 1. Sidebar (Tutor Only View - Mocked) */}
            <aside className="hidden md:flex w-80 flex-col bg-white border-r border-[#D2D2D7]/30">
                <div className="p-6 border-b border-[#D2D2D7]/30">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold tracking-tight">상담 대화</h2>
                        <button className="p-2 rounded-xl bg-[#F5F5F7] text-zinc-500 hover:text-indigo-600 transition-colors">
                            <MessageSquare size={18} />
                        </button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
                        <input
                            type="text"
                            placeholder="이름 또는 내용 검색"
                            className="w-full bg-[#F5F5F7] border-none rounded-xl py-2 pl-9 pr-4 text-xs focus:ring-2 focus:ring-indigo-500/20"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className={`p-4 flex items-center gap-3 cursor-pointer transition-colors ${i === 1 ? 'bg-indigo-50 border-r-4 border-indigo-500' : 'hover:bg-[#F5F5F7]'}`}>
                            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                                <User size={20} />
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <div className="flex justify-between items-baseline mb-0.5">
                                    <span className="text-sm font-bold truncate">김정우 학생</span>
                                    <span className="text-[10px] text-zinc-400">오후 2:31</span>
                                </div>
                                <p className="text-xs text-zinc-500 truncate">D = b^2 - 4ac &gt; 0 ...</p>
                            </div>
                        </div>
                    ))}
                </div>
            </aside>

            {/* 2. Main Chat Area */}
            <main className="flex-1 flex flex-col bg-[#F5F5F7]">
                {/* Header */}
                <header className="bg-white/80 backdrop-blur-xl border-b border-[#D2D2D7]/30 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button className="md:hidden p-2 rounded-full hover:bg-[#F5F5F7]">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                            김
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-[#1D1D1F]">김정우 학생</h3>
                            <div className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="text-[10px] text-zinc-400 font-medium tracking-tight">온라인</span>
                            </div>
                        </div>
                    </div>
                    <button className="p-2 rounded-full hover:bg-[#F5F5F7] text-zinc-400">
                        <MoreVertical size={20} />
                    </button>
                </header>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <AnimatePresence>
                        {messages.map((msg) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                className={`flex ${msg.sender === 'tutor' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-[75%] space-y-1 ${msg.sender === 'tutor' ? 'items-end' : 'items-start'}`}>
                                    <div className={`
                                        rounded-2xl px-4 py-2.5 text-[13px] font-medium leading-relaxed shadow-sm
                                        ${msg.sender === 'tutor'
                                            ? 'bg-indigo-600 text-white rounded-tr-none'
                                            : 'bg-white text-[#1D1D1F] rounded-tl-none border border-[#D2D2D7]/20'}
                                    `}>
                                        {msg.isMath ? (
                                            <div className="py-1">
                                                <MathRenderer content={msg.content} className={msg.sender === 'tutor' ? 'text-white' : 'text-[#1D1D1F]'} />
                                            </div>
                                        ) : (
                                            msg.content
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 px-1">
                                        <span className="text-[9px] text-zinc-400 font-bold uppercase">{msg.timestamp}</span>
                                        {msg.sender === 'tutor' && (
                                            <CheckCheck size={12} className={msg.status === 'read' ? 'text-indigo-500' : 'text-zinc-300'} />
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {/* Footer / Input */}
                <footer className="p-6 bg-white/80 backdrop-blur-xl border-t border-[#D2D2D7]/30 space-y-4">
                    {/* AI Suggestions */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        <div className="flex-shrink-0 p-1.5 rounded-lg bg-indigo-50 text-indigo-500 border border-indigo-100">
                            <Zap size={14} fill="currentColor" />
                        </div>
                        {aiSuggestions.map((s, idx) => (
                            <button
                                key={idx}
                                onClick={() => setInputValue(s)}
                                className="flex-shrink-0 px-3 py-1.5 bg-white border border-[#D2D2D7]/40 rounded-full text-[11px] font-bold text-zinc-500 hover:border-indigo-500 hover:text-indigo-600 transition-all whitespace-nowrap"
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            <button className="p-2 text-zinc-400 hover:text-indigo-500 transition-colors">
                                <ImageIcon size={20} />
                            </button>
                            <button className="p-2 text-zinc-400 hover:text-indigo-500 transition-colors">
                                <Paperclip size={20} />
                            </button>
                        </div>
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="메시지를 입력하세요 (수식은 KaTeX 문법 사용)..."
                                className="w-full bg-[#F5F5F7] border-none rounded-2xl py-3 px-4 text-sm focus:ring-2 focus:ring-indigo-500/20 placeholder:text-zinc-400"
                            />
                            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-indigo-500 transition-colors">
                                <Smile size={20} />
                            </button>
                        </div>
                        <button
                            onClick={handleSend}
                            disabled={!inputValue.trim()}
                            className={`
                                p-3 rounded-2xl shadow-lg transition-all
                                ${inputValue.trim() ? 'bg-indigo-600 text-white shadow-indigo-500/30' : 'bg-zinc-100 text-zinc-400 shadow-none'}
                            `}
                        >
                            <Send size={20} fill={inputValue.trim() ? 'currentColor' : 'none'} />
                        </button>
                    </div>
                </footer>
            </main>
        </div>
    );
}
