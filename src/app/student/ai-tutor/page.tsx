'use client';

import { useState } from 'react';
import { Bot, Send, User, Sparkles, BookOpen, Calculator } from 'lucide-react';

interface Message {
  id: number;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

export default function AITutorPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'ai',
      content: '안녕하세요! AI 수학 튜터입니다. 수학 관련 질문이 있으시면 편하게 물어보세요. 이차방정식, 함수, 미분, 적분 등 어떤 주제든 도와드릴게요! 📚',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const quickQuestions = [
    { icon: Calculator, text: '이차방정식 풀이 방법' },
    { icon: BookOpen, text: '미분의 정의가 뭐예요?' },
    { icon: Sparkles, text: '확률 문제 도와주세요' },
  ];

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: messages.length + 1,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Mock AI response (실제로는 API 호출)
    setTimeout(() => {
      const aiMessage: Message = {
        id: messages.length + 2,
        role: 'ai',
        content: `좋은 질문이에요! "${input}"에 대해 설명해 드릴게요.\n\n이 내용은 실제 AI 튜터 API가 연결되면 더 자세한 답변을 받으실 수 있어요. 현재는 데모 모드입니다.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black text-white flex flex-col">
      {/* Header */}
      <header className="p-6 border-b border-white/10">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <Bot className="text-indigo-400" size={28} />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI 수학 튜터</h1>
            <p className="text-sm text-zinc-400">24시간 언제든 질문하세요</p>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map(message => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
            >
              {message.role === 'ai' && (
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <Bot size={18} className="text-indigo-400" />
                </div>
              )}
              <div
                className={`max-w-[80%] p-4 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800/50 border border-white/10'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
                  <User size={18} />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <Bot size={18} className="text-indigo-400 animate-pulse" />
              </div>
              <div className="bg-zinc-800/50 border border-white/10 p-4 rounded-2xl">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Questions */}
      {messages.length <= 1 && (
        <div className="px-6 pb-4">
          <div className="max-w-3xl mx-auto">
            <p className="text-sm text-zinc-500 mb-3">자주 묻는 질문</p>
            <div className="flex gap-2 flex-wrap">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setInput(q.text)}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 border border-white/10 rounded-full text-sm hover:border-indigo-500/50 transition-all"
                >
                  <q.icon size={16} className="text-indigo-400" />
                  {q.text}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-6 border-t border-white/10">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="수학 질문을 입력하세요..."
            className="flex-1 bg-zinc-800/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500/50 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-xl transition-all"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
