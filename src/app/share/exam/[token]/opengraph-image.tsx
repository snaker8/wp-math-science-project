// ============================================================================
// 동적 OG 썸네일 — /share/exam/[token]/opengraph-image
// 카톡/슬랙/페북 등에서 링크 미리보기 카드에 노출되는 1200x630 PNG.
// token 별로 학교명·시험명·문항수 가 박혀 동적 생성.
// ============================================================================

import { ImageResponse } from 'next/og';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const alt = '시험지 분석 리포트';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface OgData {
  title: string;
  problemCount: number;
  totalPoints: number;
  avgDifficulty: number;
}

async function fetchOgData(token: string): Promise<OgData | null> {
  if (!supabaseAdmin) return null;
  if (!token || token.length < 16) return null;

  const { data: examRows } = await supabaseAdmin
    .from('exams')
    .select('id, title, total_points')
    .eq('share_token', token);
  if (!examRows || examRows.length === 0) return null;
  const exam = examRows[0];

  const { data: examProblems } = await supabaseAdmin
    .from('exam_problems')
    .select('problem_id, points')
    .eq('exam_id', exam.id);

  const total = examProblems?.length || 0;
  const totalPoints =
    examProblems?.reduce((sum, p) => sum + (Number(p.points) || 0), 0) || exam.total_points || 0;

  const ids = (examProblems || []).map((p) => p.problem_id).filter(Boolean) as string[];
  const { data: classifications } = await supabaseAdmin
    .from('classifications')
    .select('difficulty')
    .in('problem_id', ids);

  const sumDiff = (classifications || []).reduce(
    (s, c) => s + (parseInt(String(c.difficulty), 10) || 0),
    0
  );
  const avgDifficulty = total > 0 ? Math.round((sumDiff / total) * 10) / 10 : 0;

  return {
    title: exam.title,
    problemCount: total,
    totalPoints,
    avgDifficulty,
  };
}

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await fetchOgData(token);

  // 데이터 없으면 기본 이미지
  if (!data) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%)',
            fontFamily: 'sans-serif',
            fontSize: 64,
            color: '#9a3412',
            fontWeight: 800,
          }}
        >
          시험지 분석 리포트
        </div>
      ),
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)',
          fontFamily: 'sans-serif',
          padding: 60,
          position: 'relative',
        }}
      >
        {/* 상단: 라벨 + 브랜드 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 30,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 20px',
              background: 'rgba(234, 88, 12, 0.12)',
              borderRadius: 999,
              fontSize: 22,
              fontWeight: 700,
              color: '#9a3412',
              letterSpacing: '0.05em',
            }}
          >
            EXAM ANALYSIS REPORT
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: 28,
              fontWeight: 800,
              color: '#1f2937',
            }}
          >
            과사람
          </div>
        </div>

        {/* 메인 타이틀 — 학교명/시험명 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 900,
              color: '#1f2937',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              marginBottom: 24,
              wordBreak: 'keep-all',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {data.title}
          </div>
          <div
            style={{
              fontSize: 32,
              color: '#6b7280',
              fontWeight: 500,
            }}
          >
            학부모 공유 분석 리포트
          </div>
        </div>

        {/* 하단: 통계 칩 3개 */}
        <div
          style={{
            display: 'flex',
            gap: 24,
            marginTop: 40,
          }}
        >
          <StatChip label="총 문항" value={`${data.problemCount}문항`} accent="#ea580c" />
          <StatChip label="총점" value={`${data.totalPoints}점`} accent="#3b82f6" />
          <StatChip
            label="평균 난이도"
            value={`${data.avgDifficulty}/10`}
            accent="#10b981"
          />
        </div>
      </div>
    ),
    { ...size }
  );
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 32px',
        background: 'white',
        borderRadius: 20,
        borderLeft: `6px solid ${accent}`,
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ fontSize: 18, color: '#6b7280', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 36, color: '#1f2937', fontWeight: 800 }}>{value}</div>
    </div>
  );
}
