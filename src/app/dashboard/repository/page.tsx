'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useExams, ExamPaper } from '@/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  LayoutGrid,
  List,
  FileText,
  FilePlus,
  Search,
  Filter,
  Calendar,
  MoreVertical,
  Download,
  Eye,
  Tag,
  Clock,
  Zap,
  BookOpen
} from 'lucide-react';
import { GlowCard } from '@/components/shared/GlowCard';
import { MathRenderer } from '@/components/shared/MathRenderer';

// ExamPaper type imported from useExams hook

// ============================================================================
// Components
// ============================================================================

const FilterBadge = ({ label, active }: { label: string; active?: boolean }) => (
  <button className={`
        px-3 py-1.5 rounded-full text-[10px] font-bold tracking-tighter transition-all border
        ${active
      ? 'bg-white text-black border-white'
      : 'bg-zinc-900 text-zinc-500 border-white/5 hover:border-white/10 hover:text-zinc-300'}
    `}>
    {label}
  </button>
);

export default function RepositoryPage() {
  const router = useRouter();
  const { exams, isLoading } = useExams();
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = React.useState('');

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-8">
      {/* 1. Header & Primary Action */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1 px-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-400 tracking-tighter uppercase">
              Digital Asset
            </div>
            <span className="text-zinc-500 text-xs font-medium uppercase tracking-widest">Library</span>
          </div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">
            학습 자산 저장소
          </h1>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => router.push('/dashboard/create')}
          className="flex items-center gap-2 px-6 py-3 bg-white text-black font-bold rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-all"
        >
          <FilePlus size={18} />
          <span>새 시험지 제작</span>
        </motion.button>
      </div>

      {/* 2. Advanced Search & Filter Bar */}
      <GlowCard className="p-4 bg-zinc-950/50 border-white/5">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 group w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-white transition-colors" size={18} />
            <input
              type="text"
              placeholder="시험지 제목, 단원, 키워드로 검색..."
              className="w-full bg-black border border-white/5 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-white/20 transition-all placeholder:text-zinc-700"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            <FilterBadge label="전체" active />
            <FilterBadge label="고등부" />
            <FilterBadge label="중등부" />
            <FilterBadge label="심화문항" />
            <FilterBadge label="최근수정" />
            <div className="h-6 w-[1px] bg-white/10 mx-2 flex-shrink-0" />
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="p-2.5 rounded-xl bg-zinc-900 border border-white/5 text-zinc-500 hover:text-white transition-all"
            >
              {viewMode === 'grid' ? <List size={18} /> : <LayoutGrid size={18} />}
            </button>
          </div>
        </div>
      </GlowCard>

      {/* 3. Asset Grid */}
      <div className={`
                grid gap-6
                ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}
            `}>
        <AnimatePresence mode="popLayout">
          {exams.map((paper, idx) => (
            <motion.div
              key={paper.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <GlowCard className="group h-full flex flex-col p-0 overflow-hidden border-white/5 hover:border-white/20 transition-all">
                {/* Thumbnail Section */}
                <div className="relative h-40 bg-zinc-900 flex items-center justify-center p-6 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 z-10" />
                  <div className="relative z-20 opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">
                    <MathRenderer content={paper.thumbnail} className="text-zinc-500 text-lg font-serif" />
                  </div>

                  {/* Badges */}
                  <div className="absolute top-4 left-4 z-30 flex gap-2">
                    <div className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-bold text-zinc-300">
                      {paper.grade}
                    </div>
                    <div className={`px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-bold ${paper.difficulty === 'Lv.5' ? 'text-rose-400' : 'text-emerald-400'
                      }`}>
                      {paper.difficulty}
                    </div>
                  </div>

                  {/* Action Overlay */}
                  <div className="absolute inset-0 z-40 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button className="p-2 rounded-full bg-white text-black hover:bg-zinc-200 transition-colors">
                      <Eye size={18} />
                    </button>
                    <button className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/30">
                      <Zap size={18} />
                    </button>
                    <button className="p-2 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-colors">
                      <Download size={18} />
                    </button>
                  </div>
                </div>

                {/* Content Section */}
                <div className="p-5 space-y-4 flex-1 flex flex-col">
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold text-zinc-600 flex items-center gap-1 uppercase tracking-tighter">
                        <Tag size={10} /> {paper.unit}
                      </span>
                      <button className="p-1 text-zinc-600 hover:text-white">
                        <MoreVertical size={14} />
                      </button>
                    </div>
                    <h4 className="font-bold text-sm text-zinc-100 leading-snug group-hover:text-white transition-colors">
                      {paper.title}
                    </h4>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">Problems</span>
                        <span className="text-xs font-bold text-zinc-300">{paper.problemCount}</span>
                      </div>
                      <div className="w-[1px] h-6 bg-white/5" />
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">Updated</span>
                        <span className="text-xs font-bold text-zinc-300">2d ago</span>
                      </div>
                    </div>
                    <div className={`
                                            flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border
                                            ${paper.status === 'published'
                        ? 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5'
                        : 'text-zinc-500 border-zinc-800 bg-zinc-900'}
                                        `}>
                      <div className={`w-1 h-1 rounded-full ${paper.status === 'published' ? 'bg-indigo-400' : 'bg-zinc-600'}`} />
                      {paper.status.toUpperCase()}
                    </div>
                  </div>
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 4. Empty State Example (Hidden if data exists) */}
      {exams.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-zinc-950/30 rounded-3xl border border-dashed border-white/5">
          <div className="p-6 rounded-full bg-zinc-900 border border-white/5 mb-6 opacity-20">
            <BookOpen size={48} className="text-white" />
          </div>
          <h3 className="text-xl font-bold text-zinc-400 mb-2">저장된 자산이 없습니다</h3>
          <p className="text-sm text-zinc-600 max-w-xs text-center">
            새로운 시험지를 제작하거나 외부 파일을 임포트하여 나만의 학습 저장소를 꾸려보세요.
          </p>
        </div>
      )}
    </div>
  );
}
