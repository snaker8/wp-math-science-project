// ============================================================================
// 학부모 공유 페이지 — Open Graph 메타데이터 동적 생성 (server component)
//
// 카톡·문자·소셜에 공유 시 썸네일/제목/설명이 학생 리포트 정보로 표시되도록.
// page.tsx 는 'use client' 라 metadata 직접 export 못함 → layout 에서 처리.
// ============================================================================

import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase/server';

interface MetaInput {
  studentName: string;
  examTitle: string;
  scorePct: number;
  totalEarned: number;
  totalPossible: number;
  schoolBadge: string;
}

function buildOgFields(d: MetaInput): { title: string; description: string } {
  const period = (() => {
    const raw = d.examTitle || '';
    const gm = raw.match(/(?:중|고)?(\d-\d)/);
    const em = raw.match(/(중간고사|기말고사|중간|기말|모의|성취도(?:평가)?)/);
    const parts = [gm ? gm[1] : '', em ? em[1] : ''].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : raw.slice(0, 24);
  })();

  const title = d.schoolBadge
    ? `${d.studentName} ${d.schoolBadge} ${period} 수학 성취도`
    : `${d.studentName} ${period} 수학 성취도 리포트`;

  const description =
    `점수 ${d.totalEarned}점 / ${d.totalPossible}점 · 정답률 ${d.scorePct}%` +
    ` — 학생별 단원·난이도·유형별 분석 리포트.`;

  return { title, description };
}

export async function generateMetadata(
  { params }: { params: { token: string } }
): Promise<Metadata> {
  const fallback: Metadata = {
    title: '학생 성취도 리포트',
    description: '학생 수학 성취도 분석 리포트',
  };

  const token = params?.token;
  if (!token || !supabaseAdmin) return fallback;

  try {
    // token → session (학생 + 시험 + 점수)
    const { data: sessions } = await supabaseAdmin
      .schema('diagnostics')
      .from('sessions')
      .select('id, student_id, exam_id')
      .eq('share_token', token)
      .eq('session_type', 'EX')
      .limit(1);
    const session = sessions?.[0] as
      | { id: string; student_id: string; exam_id: string }
      | undefined;
    if (!session) return fallback;

    // 시험 제목
    const { data: exam } = await supabaseAdmin
      .from('exams')
      .select('title')
      .eq('id', session.exam_id)
      .maybeSingle();
    const examTitle = (exam as { title?: string } | null)?.title ?? '';

    // 학생 이름 (roster 우선, 없으면 users)
    let studentName = '학생';
    const { data: roster } = await supabaseAdmin
      .from('roster_students')
      .select('full_name')
      .eq('id', session.student_id)
      .maybeSingle();
    if (roster) {
      studentName = (roster as { full_name: string }).full_name;
    } else {
      const { data: u } = await supabaseAdmin
        .from('users')
        .select('full_name')
        .eq('id', session.student_id)
        .maybeSingle();
      if (u) studentName = (u as { full_name: string }).full_name;
    }

    // items 로 정답률 + 만점/획득점 계산 (간단)
    const { data: items } = await supabaseAdmin
      .schema('diagnostics')
      .from('items')
      .select('is_correct, note')
      .eq('session_id', session.id);

    let totalEarned = 0;
    let totalPossible = 0;
    let correctCount = 0;
    let totalCount = 0;
    for (const it of items ?? []) {
      const tt = it as { is_correct: boolean; note: string | null };
      totalCount += 1;
      if (tt.is_correct) correctCount += 1;
      if (tt.note && tt.note.startsWith('partial:')) {
        const m = tt.note.match(/^partial:([0-9.]+)\/([0-9.]+)$/);
        if (m) {
          totalEarned += parseFloat(m[1]);
          totalPossible += parseFloat(m[2]);
        }
      }
    }
    const scorePct =
      totalPossible > 0
        ? Math.round((totalEarned * 100) / totalPossible)
        : totalCount > 0
          ? Math.round((correctCount * 100) / totalCount)
          : 0;

    // 학교명 추출
    const sm = examTitle.match(/(?<![가-힣])([가-힣]{2,4}(?:중|고))(?![가-힣])/);
    const schoolBadge = sm ? sm[1] : '';

    const og = buildOgFields({
      studentName,
      examTitle,
      scorePct,
      totalEarned: Math.round(totalEarned * 10) / 10,
      totalPossible: Math.round(totalPossible * 10) / 10,
      schoolBadge,
    });

    return {
      title: og.title,
      description: og.description,
      openGraph: {
        title: og.title,
        description: og.description,
        type: 'website',
        locale: 'ko_KR',
      },
      twitter: {
        card: 'summary',
        title: og.title,
        description: og.description,
      },
      robots: { index: false, follow: false }, // 공유 링크 검색엔진 노출 X
    };
  } catch {
    return fallback;
  }
}

export default function ShareStudentReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
