'use client';

// ============================================================================
// /dashboard/exam/new — 새 시험지 만들기 (출제 진입 하나로)
// ----------------------------------------------------------------------------
// docs/PLAN_EXAM_LINE_DESIGN.md S2 ❶ 소스 선택.
//   「무엇을 근거로 뽑을까」를 먼저 고르게 한다. 지금까지는 출제 화면이 여섯 개로 흩어져 있어
//   어디로 들어가야 할지 매번 헷갈렸다 (설계서 §6).
//
// ★ 기존 화면을 지우지 않는다. 여기서 알맞은 화면·탭으로 보낸다 — 라우트는 그대로 살아 있다.
//   새 화면이 자리 잡은 뒤에 정리한다 (운영 지장 0).
// ★ 카드의 숫자는 실측이다. 「우리 학원 기출」이 첫 칸인 건 그게 우리 강점이라서다 —
//   매쓰홀릭은 전국 DB 의 넓이, 우리는 우리 학원이 가르치는 학교 기출의 정밀함.
// ============================================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  School, Layers, Target, BookOpen, FileSpreadsheet, Stethoscope, Undo2,
  ArrowRight, Loader2, Sparkles,
} from 'lucide-react';
import type { SourceSummary } from '@/app/api/exams/source-summary/route';

interface SourceCard {
  href: string;
  icon: typeof School;
  title: string;
  desc: string;
  /** 카드 하단 실측 숫자 */
  stat?: (s: SourceSummary) => string | null;
  /** 우리 강점 — 첫 칸 강조 */
  strong?: boolean;
}

const CARDS: SourceCard[] = [
  {
    href: '/dashboard/exam-create?source=school',
    icon: School,
    title: '우리 학원 기출',
    desc: '학교 → 시험지 → 문제. 우리가 가르치는 학교의 실제 시험에서 뽑습니다.',
    stat: (s) => (s.schoolExams > 0 ? `시험지 ${s.schoolExams.toLocaleString()}장 · ${s.schools}개교` : null),
    strong: true,
  },
  {
    href: '/dashboard/create',
    icon: Layers,
    title: '유형별 · 단원별',
    desc: '수학비서 단원 트리에서 유형을 골라 난이도별로 배분합니다. 서술형·고난도도 여기서 거릅니다.',
    stat: (s) => (s.problems > 0 ? `유형 붙은 문제 ${s.classified.toLocaleString()} / ${s.problems.toLocaleString()}` : null),
  },
  {
    href: '/dashboard/exam-create?source=weak',
    icon: Target,
    title: '취약 보충 (학생별)',
    desc: '학생과 기간만 정하면 약한 유형을 찾아 문제까지 담아 줍니다.',
    stat: (s) => (s.classes > 0 ? `반 ${s.classes}개` : null),
  },
  {
    href: '/dashboard/exam-create?source=wrong',
    icon: Undo2,
    title: '오답 (학생별)',
    desc: '틀린 문제를 그대로 다시, 또는 같은 유형의 새 문제로. 채점 기록만 봅니다.',
  },
  {
    href: '/dashboard/exam-create?source=textbook',
    icon: BookOpen,
    title: '시중교재',
    desc: '자산화한 교재에서 단원을 골라 뽑습니다.',
    stat: (s) => (s.bookGroups > 0 ? `교재 묶음 ${s.bookGroups}개` : null),
  },
  {
    href: '/dashboard/exam-create?source=mock',
    icon: FileSpreadsheet,
    title: '모의고사',
    desc: '연도 → 시험지 → 문제. 평가원·교육청 기출.',
  },
  {
    href: '/dashboard/exam-create?source=diagnostic',
    icon: Stethoscope,
    title: '진단평가',
    desc: 'BS · DD · PT · SC 진단 회차별 시험지.',
  },
];

export default function ExamNewPage() {
  const [summary, setSummary] = useState<SourceSummary | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/exams/source-summary', { cache: 'no-store' });
        const j = await res.json();
        if (alive && res.ok) setSummary(j as SourceSummary);
      } catch {
        /* 숫자가 없어도 카드는 쓸 수 있다 */
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-content-primary">새 시험지 만들기</h1>
        <p className="mt-1 text-sm text-content-tertiary">무엇을 근거로 뽑을지 먼저 고릅니다.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => {
          const Icon = c.icon;
          const stat = summary && c.stat ? c.stat(summary) : null;
          return (
            <Link
              key={c.href}
              href={c.href}
              className={`group flex flex-col rounded-xl border p-4 transition-colors ${
                c.strong
                  ? 'border-white/20 bg-white/[.05] hover:border-white/35'
                  : 'border-white/10 hover:border-white/20 hover:bg-white/[.02]'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-content-tertiary" />
                <span className="font-medium text-content-primary">{c.title}</span>
                {c.strong && (
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-white/20 px-1.5 py-0.5 text-[10px] text-content-secondary">
                    <Sparkles className="h-2.5 w-2.5" /> 우리 강점
                  </span>
                )}
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-content-muted transition-transform group-hover:translate-x-0.5 group-hover:text-content-secondary" />
              </div>
              <p className="text-xs leading-relaxed text-content-tertiary">{c.desc}</p>
              <div className="mt-2 h-4 text-[11px] tabular-nums text-content-muted">
                {summary === null && c.stat ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  stat ?? ''
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-content-muted">
        고르고 나면 문제를 담고, 편집하고, 저장합니다. 저장한 뒤 인쇄·한글 내보내기는 기존 시험지 화면에서 그대로 합니다.
      </p>
    </div>
  );
}
