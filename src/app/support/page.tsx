'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    MessageCircle,
    ChevronDown,
    Book,
    FileText,
    MonitorPlay,
    CreditCard,
    Settings,
    HelpCircle,
    ArrowRight
} from 'lucide-react';

// Mock Data for Support
const categories = [
    { icon: Book, title: '학습 가이드', desc: '교재 및 커리큘럼 활용법' },
    { icon: MonitorPlay, title: '동영상 강의', desc: '플레이어 및 재생 오류 해결' },
    { icon: FileText, title: '리포트/평가', desc: '성적표 해석 및 발송 방법' },
    { icon: CreditCard, title: '결제/환불', desc: '수강료 납부 및 영수증 발급' },
    { icon: Settings, title: '계정 설정', desc: '비밀번호 변경 및 정보 수정' },
    { icon: HelpCircle, title: '기타 문의', desc: '서비스 이용 전반에 대한 문의' },
];

const faqs = [
    { q: 'AI 쌍둥이 문제는 어떻게 만드나요?', a: '관리자 페이지의 [문제 은행] 메뉴에서 원하는 단원과 난이도를 선택한 후 "AI 쌍둥이 생성" 버튼을 클릭하면, 원본 문제와 유사한 유형의 변형 문제가 자동으로 생성됩니다.' },
    { q: '학부모 리포트 전송이 안 됩니다.', a: '리포트 전송은 [학생 관리] > [리포트] 탭에서 가능합니다. 만약 전송 실패가 계속된다면, 해당 학생의 학부모 연락처가 올바르게 등록되었는지 확인해 주세요.' },
    { q: '수식 렌더링 오류 해결 방법', a: '일시적인 네트워크 오류일 수 있습니다. 페이지를 새로고침하거나 브라우저 캐시를 삭제해 보세요. 문제가 지속되면 [1:1 문의]를 통해 오류 화면을 캡처해 보내주세요.' },
    { q: '태블릿에서도 사용할 수 있나요?', a: '네, 안티그래비티는 반응형 웹을 지원하여 PC, 태블릿, 모바일 모든 기기에서 최적화된 화면으로 이용하실 수 있습니다.' },
];

const FAQItem = ({ question, answer }: { question: string, answer: string }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-zinc-100 last:border-none">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between py-5 text-left group"
            >
                <span className={`text-base font-medium transition-colors ${isOpen ? 'text-indigo-600' : 'text-zinc-800 group-hover:text-indigo-600'}`}>
                    {question}
                </span>
                <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-zinc-400 group-hover:text-indigo-500"
                >
                    <ChevronDown size={20} />
                </motion.span>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <p className="pb-5 text-sm text-zinc-500 leading-relaxed">
                            {answer}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default function SupportPage() {
    return (
        <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
            {/* 1. Hero Section */}
            <section className="relative pt-32 pb-20 px-6 flex flex-col items-center justify-center text-center bg-gradient-to-b from-zinc-50/50 to-white">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-2xl w-full space-y-8"
                >
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900">
                        무엇을 도와드릴까요?
                    </h1>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder="질문 키워드를 입력해보세요 (예: 리포트, 결제)"
                            className="w-full py-4 pl-12 pr-4 rounded-2xl bg-white border border-zinc-200 shadow-sm text-base placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all hover:shadow-md"
                        />
                    </div>
                </motion.div>
            </section>

            {/* 2. Category Grid */}
            <section className="max-w-5xl mx-auto px-6 py-12">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {categories.map((cat, idx) => (
                        <motion.div
                            key={cat.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            whileHover={{ y: -5 }}
                            className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] hover:border-indigo-100 transition-all cursor-pointer group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                <cat.icon size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-900 mb-1 group-hover:text-indigo-600 transition-colors">{cat.title}</h3>
                            <p className="text-sm text-zinc-500">{cat.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* 3. FAQ Section */}
            <section className="max-w-3xl mx-auto px-6 py-12">
                <div className="text-center mb-10">
                    <h2 className="text-2xl font-bold text-zinc-900">자주 묻는 질문</h2>
                    <p className="text-zinc-500 mt-2">가장 많이 찾는 질문들을 모아봤습니다.</p>
                </div>
                <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm p-8">
                    {faqs.map((faq, idx) => (
                        <FAQItem key={idx} question={faq.q} answer={faq.a} />
                    ))}
                </div>
                <div className="mt-8 text-center">
                    <button className="text-indigo-600 font-bold hover:underline flex items-center justify-center gap-1 mx-auto">
                        모든 질문 보기 <ArrowRight size={16} />
                    </button>
                </div>
            </section>

            {/* 4. Footer Help */}
            <section className="py-20 bg-zinc-50 border-t border-zinc-100 mt-12">
                <div className="max-w-5xl mx-auto px-6 text-center">
                    <h2 className="text-xl font-bold text-zinc-900 mb-4">아직 해결되지 않으셨나요?</h2>
                    <p className="text-zinc-500 mb-8">고객센터 운영시간: 평일 09:00 - 18:00 (점심시간 12:00 - 13:00)</p>
                    <div className="flex justify-center gap-4">
                        <button className="px-6 py-3 rounded-xl bg-white border border-zinc-200 text-zinc-700 font-medium hover:bg-zinc-100 transition-colors shadow-sm">
                            이메일 문의
                        </button>
                        <button className="px-6 py-3 rounded-xl bg-zinc-900 text-white font-medium hover:bg-zinc-800 transition-colors shadow-lg shadow-zinc-900/20">
                            카카오톡 상담
                        </button>
                    </div>
                </div>
            </section>

            {/* 5. Floating FAB */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="fixed bottom-8 right-8 w-16 h-16 bg-indigo-600 text-white rounded-full shadow-[0_4px_20px_rgba(79,70,229,0.4)] flex items-center justify-center hover:bg-indigo-700 transition-colors z-50 group"
            >
                <div className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-20" />
                <MessageCircle size={28} />
                <span className="absolute right-full mr-4 bg-zinc-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0 pointer-events-none">
                    1:1 문의하기
                </span>
            </motion.button>
        </div>
    );
}
