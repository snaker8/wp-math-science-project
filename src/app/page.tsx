'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, ScanText, ClipboardCheck, LineChart, FolderOpen } from 'lucide-react';
import { BrandLogo } from '@/components/brand/Logo';

// ============================================================================
// 랜딩 — Linear 문법 (2026-08-28 재작성)
// ★ 이전 버전의 거짓 요소 제거: "v2.0 Public Beta" 가짜 배지, "99.8% Accuracy"
//   "+24%" 등 지어낸 수치, 가짜 대시보드 목업. 카피는 실제 하는 일만 말한다.
// ★ 크롬 무채색 — 액센트는 흰 필 CTA 하나. (insane-design/linear/design.md §18)
// ============================================================================

const FEATURES = [
  {
    icon: ScanText,
    title: '시험지 자산화',
    description:
      'HWP·PDF 시험지를 올리면 수식까지 인식해 문제 단위로 분해하고, 단원·유형·난이도를 분류해 문제은행에 쌓습니다.',
  },
  {
    icon: FolderOpen,
    title: '유형별 출제',
    description:
      '학교기출·교재·진단평가로 쌓인 문제를 단원과 유형으로 골라 몇 분 만에 시험지로 편성하고 인쇄합니다.',
  },
  {
    icon: ClipboardCheck,
    title: 'QR 채점과 오답 관리',
    description:
      'QR 답안지로 채점하면 결과가 학생별 유형 숙달로 쌓이고, 약점 유형은 유사 문제로 다시 출제됩니다.',
  },
  {
    icon: LineChart,
    title: '학생·학교 리포트',
    description:
      '내신·진단·모의고사 결과를 학생 단위로 모아 강사와 학부모가 같은 그림을 봅니다.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-surface-base text-content-primary selection:bg-white/20">
      {/* 배경 깊이 — 상단 중앙 옅은 광원 (앱과 동일 문법) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px]"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 45%, transparent 100%)',
        }}
      />

      <nav className="fixed inset-x-0 top-0 z-50 h-16 border-b border-white/[.06] bg-surface-base/75 backdrop-blur-xl">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-6">
          <BrandLogo size="md" />
          <div className="flex items-center gap-5 text-sm font-medium">
            <Link href="/auth/login" className="text-content-tertiary transition-colors hover:text-content-primary">
              로그인
            </Link>
            <Link
              href="/auth/signup"
              className="rounded-full bg-white px-4 py-1.5 font-semibold text-black transition-colors hover:bg-zinc-200"
            >
              회원가입
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex min-h-[88vh] flex-col justify-center px-6 pt-24">
        <div className="mx-auto w-full max-w-4xl">
          <div>
            <h1 className="mb-8 text-4xl font-bold leading-[1.15] tracking-tight text-content-primary md:text-6xl">
              학원의 시험지가
              <br />
              자산이 되는 문제은행
            </h1>
            <p className="mb-10 max-w-2xl text-base leading-relaxed text-content-tertiary md:text-lg">
              시험지를 올리면 문제 단위로 분해되어 쌓이고, 골라서 출제하고, QR로 채점하고,
              <br className="hidden md:block" />
              결과는 학생별 약점 관리로 이어집니다. 수학·과학 학원을 위한 운영 루프입니다.
            </p>
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <Link
                href="/auth/signup"
                className="group inline-flex h-12 items-center justify-center rounded-full bg-white px-7 font-semibold text-black transition-colors hover:bg-zinc-200"
              >
                무료로 시작하기
                <ChevronRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/auth/login"
                className="text-sm font-medium text-content-tertiary transition-colors hover:text-content-primary"
              >
                이미 계정이 있으신가요?
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative px-6 py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 max-w-2xl">
            <h2 className="mb-4 text-2xl font-bold tracking-tight text-content-primary md:text-4xl">
              업로드에서 리포트까지, 한 흐름
            </h2>
            <p className="text-content-tertiary">
              흩어진 자료 정리부터 채점 후 처방까지 — 학원 수업의 하루가 한 시스템 안에서 돕니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-white/[.08] bg-surface-card/40 p-7
                  shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_-20px_rgba(0,0,0,0.55)]
                  [background-image:linear-gradient(180deg,rgba(255,255,255,0.03),transparent_140px)]"
              >
                <f.icon size={22} className="mb-5 text-content-tertiary" />
                <h3 className="mb-2 text-lg font-bold text-content-primary">{f.title}</h3>
                <p className="text-sm leading-relaxed text-content-tertiary">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[.06] px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="text-center md:text-left">
            <BrandLogo size="md" />
            <p className="mt-2 text-xs text-content-muted">© 2026 Math×Sci Bank. All rights reserved.</p>
          </div>
          <div className="flex gap-6 text-sm text-content-tertiary">
            <Link href="/support" className="transition-colors hover:text-content-primary">
              고객센터
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
