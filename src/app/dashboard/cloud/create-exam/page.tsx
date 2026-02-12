'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  ArrowLeft,
  Loader2,
  CheckCircle,
  FolderOpen,
  Plus,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { useCreateExam } from '@/hooks/useExamProblems';

// ============================================================================
// Types
// ============================================================================

interface SelectedProblem {
  id: string;
  number: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  cognitiveDomain: string;
  content: string;
  choices: string[];
  year: string;
  typeCode: string;
  typeName: string;
  source: string;
}

interface ExamGroup {
  id: string;
  name: string;
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_GROUPS: ExamGroup[] = [
  { id: 'g1', name: '금곡고' },
  { id: 'g2', name: '용인고' },
  { id: 'g3', name: '2025 중간고사' },
];

// ============================================================================
// Main Page Component
// ============================================================================

export default function CreateExamPage() {
  const router = useRouter();
  const [problems, setProblems] = useState<SelectedProblem[]>([]);
  const [sourceTitle, setSourceTitle] = useState('');
  const [examTitle, setExamTitle] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(MOCK_GROUPS[0]?.id || null);
  const [isCreated, setIsCreated] = useState(false);
  const { createExam, isCreating, error: createError } = useCreateExam();

  // Load selected problems from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('selectedProblems');
      const storedTitle = sessionStorage.getItem('sourceExamTitle');
      if (stored) {
        const parsed = JSON.parse(stored) as SelectedProblem[];
        setProblems(parsed);
        if (storedTitle) {
          setSourceTitle(storedTitle);
          setExamTitle(`${storedTitle} 시험지`);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const subjectName = useMemo(() => {
    // 과목명 추출 (mock)
    return '수학1';
  }, []);

  const handleCreate = async () => {
    const problemIds = problems.map((p) => p.id);
    const examId = await createExam({
      title: examTitle,
      subject: subjectName,
      problemIds,
      groupId: selectedGroup || undefined,
    });

    if (examId) {
      setIsCreated(true);
      // 생성된 시험지 정보를 sessionStorage에 저장 후 이동
      setTimeout(() => {
        sessionStorage.setItem(
          'createdExam',
          JSON.stringify({
            id: examId,
            title: examTitle,
            groupId: selectedGroup,
            groupName: MOCK_GROUPS.find((g) => g.id === selectedGroup)?.name || '',
            problems,
            createdAt: new Date().toISOString(),
          })
        );
        router.push('/dashboard/exam-management');
      }, 1500);
    }
  };

  if (problems.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-black text-white">
        <FileText className="h-12 w-12 text-zinc-600 mb-4" />
        <p className="text-zinc-400 text-sm mb-4">선택된 문제가 없습니다</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" />
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* ======== Header (Dark gradient) ======== */}
      <div className="relative flex-shrink-0 bg-gradient-to-r from-indigo-900/80 via-cyan-900/60 to-zinc-900 px-8 py-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 border border-white/20">
            <FileText className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">선택한 문제로 시험지 만들기</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              시험지 그룹을 지정하고 제목을 입력한 뒤 미리 보기를 확인한 후 시험지를 생성하세요.
            </p>
          </div>
        </div>
      </div>

      {/* ======== Title + Info Bar ======== */}
      <div className="flex-shrink-0 border-b border-zinc-800/50 px-8 py-4">
        <div className="flex items-center gap-6">
          {/* 시험지 제목 */}
          <div className="flex-1">
            <label className="block text-xs text-zinc-500 mb-1.5">시험지 제목</label>
            <input
              type="text"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              placeholder="시험지 제목을 입력하세요..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-colors"
            />
          </div>

          {/* 선택된 문제 수 */}
          <div className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/30">
              <CheckCircle className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">
                선택된 문제 <span className="text-cyan-400">{problems.length}</span> / 50
              </div>
              <div className="text-xs text-zinc-500">과목: {subjectName}</div>
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating || isCreated || !examTitle.trim()}
              className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-all ${
                isCreated
                  ? 'bg-emerald-600 text-white'
                  : isCreating
                  ? 'bg-cyan-700 text-cyan-200 cursor-wait'
                  : 'bg-cyan-600 text-white hover:bg-cyan-500 shadow-lg shadow-cyan-500/20'
              } disabled:opacity-60`}
            >
              {isCreated ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  생성 완료!
                </>
              ) : isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                '시험지 생성'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ======== Main Content (Group Selection + Preview) ======== */}
      <div className="flex flex-1 overflow-hidden">
        {/* 좌측: 시험지 그룹 선택 */}
        <div className="w-64 flex-shrink-0 border-r border-zinc-800/50 p-4 overflow-y-auto">
          <h3 className="text-sm font-bold text-zinc-300 mb-3">시험지 그룹 선택</h3>
          <div className="space-y-1">
            {MOCK_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setSelectedGroup(group.id)}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                  selectedGroup === group.id
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-zinc-400 hover:bg-zinc-800 border border-transparent'
                }`}
              >
                <FolderOpen className="h-4 w-4 flex-shrink-0" />
                {group.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 flex items-center gap-1.5 w-full rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            새 그룹 추가
          </button>
        </div>

        {/* 우측: 시험지 미리보기 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 flex justify-center py-6 bg-zinc-950/30">
          <div className="w-full max-w-[850px] bg-white rounded-lg shadow-2xl shadow-black/50 mx-4">
            {/* 시험지 헤더 테이블 */}
            <div className="border-b-2 border-gray-800 p-0">
              <table className="w-full border-collapse text-black">
                <tbody>
                  <tr>
                    <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50 text-center">과목</td>
                    <td className="border border-gray-400 px-3 py-2 text-sm font-bold">{subjectName}</td>
                    <td className="border border-gray-400 px-3 py-2 text-sm font-bold" colSpan={3}>
                      {examTitle || '시험지 제목'}
                    </td>
                    <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50 text-center">담당</td>
                    <td className="border border-gray-400 px-3 py-2 text-sm font-bold w-24"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 문제 영역 */}
            <div className="p-6 columns-2 gap-8" style={{ columnGap: '24px' }}>
              {problems.map((problem) => (
                <div
                  key={problem.id}
                  className="break-inside-avoid"
                  style={{ marginBottom: '24px' }}
                >
                  <div className="flex gap-2">
                    <span className="text-sm font-bold text-gray-900 flex-shrink-0 pt-0.5">
                      {problem.number}.
                    </span>
                    <div className="flex-1">
                      <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                        <MixedContentRenderer content={problem.content} className="text-gray-800" />
                      </div>
                      {problem.choices.length > 0 && (
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                          {problem.choices.map((choice, ci) => (
                            <div key={ci} className="text-[13px] text-gray-700">
                              <MixedContentRenderer content={choice} className="text-gray-700" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
