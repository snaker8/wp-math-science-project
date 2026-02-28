'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useExams, ExamPaper } from '@/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid,
  List,
  FilePlus,
  Search,
  MoreVertical,
  Download,
  Eye,
  Tag,
  Zap,
  BookOpen,
  Copy,
  Trash2,
  FileOutput,
  X,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { GlowCard } from '@/components/shared/GlowCard';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { ExamViewerModal } from '@/components/papers/ExamViewerModal';

// ============================================================================
// ContextMenu (더보기 메뉴)
// ============================================================================

interface ContextMenuProps {
  exam: ExamPaper;
  position: { x: number; y: number };
  onClose: () => void;
  onView: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onExport: () => void;
}

function ContextMenu({ exam, position, onClose, onView, onCopy, onDelete, onExport }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const menuItems = [
    { icon: Eye, label: '시험지 보기', onClick: onView, color: 'text-content-secondary' },
    { icon: Copy, label: '유사시험지 만들기', onClick: onCopy, color: 'text-content-secondary' },
    { icon: FileOutput, label: '시험지 출력', onClick: onExport, color: 'text-content-secondary' },
    { icon: Trash2, label: '삭제', onClick: onDelete, color: 'text-rose-400' },
  ];

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed z-[60] min-w-[180px] py-1.5 rounded-xl bg-surface-card border border-white/10 shadow-2xl shadow-black/50 backdrop-blur-md"
      style={{ top: position.y, left: position.x }}
    >
      {menuItems.map((item, i) => {
        const Icon = item.icon;
        return (
          <React.Fragment key={i}>
            {i === menuItems.length - 1 && (
              <div className="my-1 border-t border-subtle" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm ${item.color} hover:bg-white/5 transition-colors`}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </motion.div>
  );
}

// ============================================================================
// CopyExamModal (유사시험지 만들기 팝업)
// ============================================================================

interface CopyExamModalProps {
  exam: ExamPaper;
  onClose: () => void;
  onCopy: (title: string, mode: 'simple' | 'similar') => Promise<void>;
}

function CopyExamModal({ exam, onClose, onCopy }: CopyExamModalProps) {
  const [title, setTitle] = useState(exam.title);
  const [mode, setMode] = useState<'simple' | 'similar'>('simple');
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleCopy = async () => {
    setIsCopying(true);
    try {
      await onCopy(title, mode);
      onClose();
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-surface-base/70 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative z-10 w-full max-w-xl rounded-2xl border border bg-surface-card shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Copy className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-content-primary">유사시험지 만들기</h2>
              <p className="text-xs text-content-tertiary">복사 방식을 선택하고 새 시험지 정보를 확인하세요.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-content-tertiary hover:text-content-primary hover:bg-surface-raised transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* 시험지명 */}
          <div>
            <label className="text-sm font-semibold text-content-secondary mb-2 block">시험지명</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-surface-raised border border text-content-primary text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
            <p className="text-[11px] text-content-muted mt-1.5">
              복사된 시험지의 제목으로 사용됩니다. 필요하다면 원본과 구분될 수 있도록 수정해 주세요.
            </p>
          </div>

          {/* 복사 방식 선택 */}
          <div>
            <label className="text-sm font-semibold text-content-secondary mb-3 block">복사 방식 선택</label>
            <p className="text-[11px] text-content-muted mb-3">
              단순 복사 또는 AI 기반 유사문제 복사를 선택할 수 있습니다.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* 단순 복사 */}
              <button
                onClick={() => setMode('simple')}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  mode === 'simple'
                    ? 'border-indigo-500 bg-indigo-500/5'
                    : 'border bg-surface-raised/50 hover:border-accent/30'
                }`}
              >
                {mode === 'simple' && (
                  <span className="absolute top-3 right-3 text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                    SELECTED
                  </span>
                )}
                <Copy className={`w-5 h-5 mb-2 ${mode === 'simple' ? 'text-indigo-400' : 'text-content-tertiary'}`} />
                <h4 className={`text-sm font-bold mb-2 ${mode === 'simple' ? 'text-content-primary' : 'text-content-secondary'}`}>
                  시험지 단순 복사
                </h4>
                <p className="text-[11px] text-content-tertiary leading-relaxed">
                  현재 시험지의 문제 구성을 그대로 복제하여 새 시험지를 만듭니다.
                </p>
                <p className="text-[11px] text-content-muted mt-2">
                  복사 후 출제 화면에서 필요 시 문제를 수정할 수 있습니다.
                </p>
              </button>

              {/* 유사문제 복사 */}
              <button
                onClick={() => setMode('similar')}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  mode === 'similar'
                    ? 'border-indigo-500 bg-indigo-500/5'
                    : 'border bg-surface-raised/50 hover:border-accent/30'
                }`}
              >
                {mode === 'similar' && (
                  <span className="absolute top-3 right-3 text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                    SELECTED
                  </span>
                )}
                <Sparkles className={`w-5 h-5 mb-2 ${mode === 'similar' ? 'text-indigo-400' : 'text-content-tertiary'}`} />
                <h4 className={`text-sm font-bold mb-2 ${mode === 'similar' ? 'text-content-primary' : 'text-content-secondary'}`}>
                  유사문제로 복사하기
                </h4>
                <p className="text-[11px] text-content-tertiary leading-relaxed">
                  동일한 유형과 난이도를 유지하면서 새로운 문제를 자동으로 구성해 시험지를 생성합니다.
                </p>
                <p className="text-[11px] text-content-muted mt-2">
                  생성된 시험지는 출제 화면에서 바로 확인하고 수정할 수 있습니다.
                </p>
              </button>
            </div>
          </div>

          {/* 안내 */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-surface-raised/50 border border/50">
            <div className="w-1 h-1 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
            <p className="text-[11px] text-content-tertiary">
              {mode === 'simple'
                ? '단순 복사는 기존 문제 구성을 유지합니다. 다른 문제로 구성하려면 유사문제로 복사를 선택하세요.'
                : '유사문제 복사는 AI를 사용하여 동일 유형의 새 문제를 자동 생성합니다. AI 포인트가 소모됩니다.'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-subtle">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-content-secondary hover:text-content-primary bg-surface-raised hover:bg-zinc-700 rounded-lg border border transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleCopy}
            disabled={isCopying || !title.trim()}
            className="px-5 py-2.5 text-sm font-bold text-content-primary bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCopying ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                복사 중...
              </>
            ) : (
              '복사'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// DeleteConfirmModal
// ============================================================================

function DeleteConfirmModal({
  examTitle,
  onClose,
  onConfirm,
}: {
  examTitle: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-surface-base/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border bg-surface-card p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-rose-500/10">
            <Trash2 className="w-5 h-5 text-rose-400" />
          </div>
          <h3 className="text-lg font-bold text-content-primary">시험지 삭제</h3>
        </div>
        <p className="text-sm text-content-secondary mb-1">다음 시험지를 삭제하시겠습니까?</p>
        <p className="text-sm text-content-primary font-medium mb-4">&ldquo;{examTitle}&rdquo;</p>
        <p className="text-xs text-content-muted mb-6">삭제된 시험지는 복구할 수 없습니다.</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-content-secondary bg-surface-raised rounded-lg border border hover:bg-zinc-700 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className="px-4 py-2 text-sm font-bold text-content-primary bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors"
          >
            삭제
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// FilterBadge
// ============================================================================

const FilterBadge = ({ label, active }: { label: string; active?: boolean }) => (
  <button className={`
    px-3 py-1.5 rounded-full text-[10px] font-bold tracking-tighter transition-all border
    ${active
      ? 'bg-white text-black border-white'
      : 'bg-surface-card text-content-tertiary border-subtle hover:border-white/10 hover:text-content-secondary'}
  `}>
    {label}
  </button>
);

// ============================================================================
// Main Page
// ============================================================================

export default function RepositoryPage() {
  const router = useRouter();
  const { exams, isLoading, deleteExam, duplicateExam } = useExams();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  // 팝업 뷰어 상태
  const [selectedExam, setSelectedExam] = useState<ExamPaper | null>(null);
  const [showViewer, setShowViewer] = useState(false);

  // 컨텍스트 메뉴 상태
  const [contextMenu, setContextMenu] = useState<{
    exam: ExamPaper;
    position: { x: number; y: number };
  } | null>(null);

  // 유사시험지 만들기 팝업 상태
  const [copyExam, setCopyExam] = useState<ExamPaper | null>(null);

  // 삭제 확인 팝업 상태
  const [deleteTarget, setDeleteTarget] = useState<ExamPaper | null>(null);

  const handleExamClick = useCallback((exam: ExamPaper) => {
    setSelectedExam(exam);
    setShowViewer(true);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setShowViewer(false);
    setSelectedExam(null);
  }, []);

  const handleMoreClick = useCallback((e: React.MouseEvent, exam: ExamPaper) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const menuWidth = 180;
    const menuHeight = 200;
    let x = rect.right;
    let y = rect.bottom + 4;
    if (x + menuWidth > window.innerWidth) x = rect.left - menuWidth;
    if (y + menuHeight > window.innerHeight) y = rect.top - menuHeight;
    setContextMenu({ exam, position: { x, y } });
  }, []);

  const handleCopyExam = useCallback(async (title: string, mode: 'simple' | 'similar') => {
    if (!copyExam) return;
    if (mode === 'simple') {
      await duplicateExam(copyExam.id, title);
    } else {
      // TODO: 유사문제 AI 생성 기능 (추후 구현)
      console.log('[Copy] AI similar copy not yet implemented');
      await duplicateExam(copyExam.id, title + ' (유사)');
    }
  }, [copyExam, duplicateExam]);

  const handleDeleteExam = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteExam(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, deleteExam]);

  // 검색 필터
  const filteredExams = searchQuery.trim()
    ? exams.filter((e) =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.unit.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.course.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : exams;

  return (
    <div className="min-h-screen bg-surface-base text-content-primary p-6 space-y-8">
      {/* 1. Header & Primary Action */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1 px-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-400 tracking-tighter uppercase">
              Digital Asset
            </div>
            <span className="text-content-tertiary text-xs font-medium uppercase tracking-widest">Library</span>
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
      <GlowCard className="p-4 bg-surface-raised/50 border-subtle">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 group w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-content-muted group-focus-within:text-content-primary transition-colors" size={18} />
            <input
              type="text"
              placeholder="시험지 제목, 단원, 키워드로 검색..."
              className="w-full bg-surface-base border border-subtle rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-white/20 transition-all placeholder:text-zinc-700"
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
              className="p-2.5 rounded-xl bg-surface-card border border-subtle text-content-tertiary hover:text-content-primary transition-all"
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
          {filteredExams.map((paper, idx) => (
            <motion.div
              key={paper.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <GlowCard
                className="group h-full flex flex-col p-0 overflow-hidden border-subtle hover:border-white/20 transition-all cursor-pointer"
                onClick={() => handleExamClick(paper)}
              >
                {/* Thumbnail Section */}
                <div className="relative h-40 bg-surface-card flex items-center justify-center p-6 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 z-10" />
                  <div className="relative z-20 opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">
                    <MathRenderer content={paper.thumbnail} className="text-content-tertiary text-lg font-serif" />
                  </div>

                  {/* Badges */}
                  <div className="absolute top-4 left-4 z-30 flex gap-2">
                    <div className="px-2 py-0.5 rounded bg-surface-base/60 backdrop-blur-md border border-white/10 text-[9px] font-bold text-content-secondary">
                      {paper.grade}
                    </div>
                    <div className={`px-2 py-0.5 rounded bg-surface-base/60 backdrop-blur-md border border-white/10 text-[9px] font-bold ${
                      paper.difficulty === 'Lv.5' ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {paper.difficulty}
                    </div>
                  </div>

                  {/* Action Overlay */}
                  <div className="absolute inset-0 z-40 bg-surface-base/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExamClick(paper); }}
                      className="p-2 rounded-full bg-white text-black hover:bg-zinc-200 transition-colors"
                      title="시험지 보기"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); }}
                      className="p-2 rounded-full bg-indigo-600 text-content-primary hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/30"
                      title="AI 분석"
                    >
                      <Zap size={18} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); }}
                      className="p-2 rounded-full bg-surface-raised text-content-primary hover:bg-zinc-700 transition-colors"
                      title="다운로드"
                    >
                      <Download size={18} />
                    </button>
                  </div>
                </div>

                {/* Content Section */}
                <div className="p-5 space-y-4 flex-1 flex flex-col">
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold text-content-muted flex items-center gap-1 uppercase tracking-tighter">
                        <Tag size={10} /> {paper.unit}
                      </span>
                      <button
                        className="p-1 text-content-muted hover:text-content-primary hover:bg-surface-raised rounded transition-colors"
                        onClick={(e) => handleMoreClick(e, paper)}
                        title="더보기"
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>
                    <h4 className="font-bold text-sm text-content-primary leading-snug group-hover:text-content-primary transition-colors">
                      {paper.title}
                    </h4>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-subtle">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-content-muted uppercase tracking-tighter">Problems</span>
                        <span className="text-xs font-bold text-content-secondary">{paper.problemCount}</span>
                      </div>
                      <div className="w-[1px] h-6 bg-white/5" />
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-content-muted uppercase tracking-tighter">Updated</span>
                        <span className="text-xs font-bold text-content-secondary">{paper.createdAt}</span>
                      </div>
                    </div>
                    <div className={`
                      flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border
                      ${paper.status === 'published'
                        ? 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5'
                        : 'text-content-tertiary border-subtle bg-surface-card'}
                    `}>
                      <div className={`w-1 h-1 rounded-full ${paper.status === 'published' ? 'bg-indigo-400' : 'bg-zinc-600'}`} />
                      {paper.status === 'completed' ? '완료' : paper.status === 'draft' ? '임시' : paper.status.toUpperCase()}
                    </div>
                  </div>
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 4. Empty State */}
      {!isLoading && filteredExams.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-surface-raised/30 rounded-3xl border border-dashed border-subtle">
          <div className="p-6 rounded-full bg-surface-card border border-subtle mb-6 opacity-20">
            <BookOpen size={48} className="text-content-primary" />
          </div>
          <h3 className="text-xl font-bold text-content-secondary mb-2">
            {searchQuery ? '검색 결과가 없습니다' : '저장된 자산이 없습니다'}
          </h3>
          <p className="text-sm text-content-muted max-w-xs text-center">
            {searchQuery
              ? '다른 키워드로 검색해 보세요.'
              : '새로운 시험지를 제작하거나 외부 파일을 임포트하여 나만의 학습 저장소를 꾸려보세요.'}
          </p>
        </div>
      )}

      {/* 시험지 뷰어 팝업 */}
      {showViewer && selectedExam && (
        <ExamViewerModal
          examId={selectedExam.id}
          examTitle={selectedExam.title}
          onClose={handleCloseViewer}
        />
      )}

      {/* 컨텍스트 메뉴 */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            exam={contextMenu.exam}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
            onView={() => handleExamClick(contextMenu.exam)}
            onCopy={() => setCopyExam(contextMenu.exam)}
            onDelete={() => setDeleteTarget(contextMenu.exam)}
            onExport={() => {
              // TODO: 시험지 출력 기능
              console.log('[Export] Not yet implemented');
            }}
          />
        )}
      </AnimatePresence>

      {/* 유사시험지 만들기 팝업 */}
      <AnimatePresence>
        {copyExam && (
          <CopyExamModal
            exam={copyExam}
            onClose={() => setCopyExam(null)}
            onCopy={handleCopyExam}
          />
        )}
      </AnimatePresence>

      {/* 삭제 확인 팝업 */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal
            examTitle={deleteTarget.title}
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDeleteExam}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
