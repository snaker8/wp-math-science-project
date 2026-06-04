// ============================================================================
// 동적 OG 썸네일 — /share/diagnostic-report/[token]/opengraph-image
// 카톡/메신저 링크 미리보기 카드(1200x630 PNG). 학생·세트·합산 점수 동적 표시.
// ============================================================================

import { ImageResponse } from 'next/og';
import { supabaseAdmin } from '@/lib/supabase/server';
import { computeComprehensiveReport } from '@/lib/diagnostics/compute-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const alt = '진단평가 종합 리포트';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface OgData {
  name: string;
  range: string;
  pct: number | null;
  graded: number;
  variants: number;
  total: number;
}

function rangeOf(setTitle: string): string {
  const m = (setTitle || '').match(/\(([^)]+)\)/);
  if (m) return m[1].trim();
  return (setTitle || '').replace(/진단평가.*$/, '').trim() || setTitle || '';
}

async function fetchOgData(token: string): Promise<OgData | null> {
  if (!supabaseAdmin || !token || token.length < 16) return null;
  const { data: tokenRow } = await supabaseAdmin
    .from('parent_share_tokens')
    .select('student_id, set_key, report_kind, is_active')
    .eq('token', token)
    .maybeSingle();
  const t = tokenRow as { student_id: string; set_key: string | null; report_kind: string; is_active: boolean } | null;
  if (!t || !t.is_active || t.report_kind !== 'diagnostic_set' || !t.set_key) return null;
  const result = await computeComprehensiveReport(supabaseAdmin, t.student_id, t.set_key);
  if (!result.ok) return null;
  const { student, set, overall } = result.payload;
  return {
    name: student.name,
    range: rangeOf(set.setTitle),
    pct: overall.pct,
    graded: set.gradedVariantCount,
    variants: set.variantCount,
    total: overall.total,
  };
}

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await fetchOgData(token);

  if (!data) {
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
          fontFamily: 'sans-serif', fontSize: 60, color: '#a5b4fc', fontWeight: 800,
        }}>
          진단평가 종합 리포트
        </div>
      ),
      { ...size },
    );
  }

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #11182f 55%, #0e2230 100%)',
        fontFamily: 'sans-serif', padding: 64, position: 'relative',
      }}>
        {/* 상단: 라벨 + 브랜드 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 36 }}>
          <div style={{
            display: 'flex', alignItems: 'center', padding: '10px 22px',
            background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.35)',
            borderRadius: 999, fontSize: 22, fontWeight: 700, color: '#67e8f9', letterSpacing: '0.06em',
          }}>
            DIAGNOSTIC REPORT
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#e5e7eb', letterSpacing: -0.5 }}>
            Math×Sci Bank
          </div>
        </div>

        {/* 메인: 학생 + 범위 */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
          <div style={{ fontSize: 34, color: '#94a3b8', fontWeight: 600, marginBottom: 10 }}>진단평가 종합 리포트 (A·B·C)</div>
          <div style={{ fontSize: 88, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: 16 }}>
            {data.name}
          </div>
          <div style={{ fontSize: 36, color: '#cbd5e1', fontWeight: 500 }}>{data.range}</div>
        </div>

        {/* 하단: 통계 칩 */}
        <div style={{ display: 'flex', gap: 24, marginTop: 36 }}>
          <Chip label="합산 정답률" value={data.pct != null ? `${data.pct}%` : '-'} accent="#22d3ee" />
          <Chip label="채점 변형" value={`${data.graded}/${data.variants}`} accent="#818cf8" />
          <Chip label="총 문항" value={`${data.total}문항`} accent="#34d399" />
        </div>
      </div>
    ),
    { ...size },
  );
}

function Chip({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', padding: '20px 34px',
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 20, borderLeft: `6px solid ${accent}`,
    }}>
      <div style={{ fontSize: 18, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 40, color: '#ffffff', fontWeight: 800 }}>{value}</div>
    </div>
  );
}
