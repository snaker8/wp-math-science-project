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

// 동적 OG 이미지 CDN 캐시 — 토큰별 결정적이라 캐시 안전. 보수적 크롤러(시놀로지 챗 등)의
// 즉석 생성 타임아웃 회피 + 전반적 미리보기 속도 개선.
const OG_IMAGE_CACHE = { 'cache-control': 'public, max-age=86400, s-maxage=86400, immutable, no-transform' } as const;

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await fetchOgData(token);

  if (!data) {
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(120% 120% at 0% 0%, #131a2e 0%, #0a0d18 55%, #070a14 100%)',
          fontFamily: 'sans-serif', fontSize: 60, color: '#a5b4fc', fontWeight: 800,
        }}>
          진단평가 종합 리포트
        </div>
      ),
      { ...size, headers: OG_IMAGE_CACHE },
    );
  }

  const pct = data.pct;
  const ring =
    pct == null ? '#64748b' : pct >= 80 ? '#34d399' : pct >= 60 ? '#22d3ee' : pct >= 40 ? '#fbbf24' : '#fb7185';
  const R = 110;
  const C = 2 * Math.PI * R;
  const dash = pct != null ? (Math.max(0, Math.min(100, pct)) / 100) * C : 0;

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden',
        background: '#080b16', fontFamily: 'sans-serif',
      }}>
        {/* 배경 글로우 */}
        <div style={{ position: 'absolute', top: -180, left: -120, width: 560, height: 560, borderRadius: 9999,
          background: 'radial-gradient(circle, rgba(34,211,238,0.20) 0%, rgba(34,211,238,0) 68%)' }} />
        <div style={{ position: 'absolute', bottom: -220, right: 200, width: 680, height: 680, borderRadius: 9999,
          background: 'radial-gradient(circle, rgba(99,102,241,0.22) 0%, rgba(99,102,241,0) 68%)' }} />

        {/* 좌측 콘텐츠 */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 64, justifyContent: 'space-between', zIndex: 1 }}>
          {/* 브랜드 행 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{
              display: 'flex', alignItems: 'center', padding: '9px 22px',
              background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.40)',
              borderRadius: 9999, fontSize: 21, fontWeight: 700, color: '#67e8f9', letterSpacing: '0.14em',
            }}>
              DIAGNOSTIC REPORT
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', width: 16, height: 16, borderRadius: 5, marginRight: 12,
                background: 'linear-gradient(135deg, #22d3ee, #6366f1)' }} />
              <div style={{ fontSize: 24, fontWeight: 800, color: '#e5e7eb', letterSpacing: '-0.01em' }}>과사람 수학</div>
            </div>
          </div>

          {/* 중앙: 학생 + 범위 */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 30, color: '#8aa0bf', fontWeight: 600, marginBottom: 14 }}>
              진단평가 종합 리포트 · A·B·C 합산
            </div>
            <div style={{ display: 'flex', fontSize: 96, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 18 }}>
              {data.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', width: 34, height: 5, borderRadius: 9999, marginRight: 16, background: ring }} />
              <div style={{ display: 'flex', fontSize: 38, color: '#cbd5e1', fontWeight: 500 }}>{data.range}</div>
            </div>
          </div>

          {/* 하단: 칩 */}
          <div style={{ display: 'flex', gap: 22 }}>
            <Chip label="채점 변형" value={`${data.graded} / ${data.variants}`} accent="#818cf8" />
            <Chip label="총 문항" value={`${data.total}문항`} accent="#34d399" />
          </div>
        </div>

        {/* 우측: 게이지 패널 */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          width: 430, zIndex: 1, borderLeft: '1px solid rgba(255,255,255,0.06)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        }}>
          <div style={{ position: 'relative', display: 'flex', width: 280, height: 280, alignItems: 'center', justifyContent: 'center' }}>
            <svg width="280" height="280" viewBox="0 0 280 280">
              <circle cx="140" cy="140" r={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="22" />
              <circle cx="140" cy="140" r={R} fill="none" stroke={ring} strokeWidth="22" strokeLinecap="round"
                strokeDasharray={`${dash} ${C}`} transform="rotate(-90 140 140)" />
            </svg>
            <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', color: '#ffffff' }}>
                <div style={{ display: 'flex', fontSize: 92, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em' }}>
                  {pct != null ? `${pct}` : '-'}
                </div>
                <div style={{ display: 'flex', fontSize: 38, fontWeight: 800, marginTop: 10, marginLeft: 4, color: ring }}>%</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: '#94a3b8', marginTop: 18, letterSpacing: '0.02em' }}>
            합산 정답률
          </div>
        </div>
      </div>
    ),
    { ...size, headers: OG_IMAGE_CACHE },
  );
}

function Chip({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', padding: '20px 34px',
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 20, borderLeft: `6px solid ${accent}`,
    }}>
      <div style={{ display: 'flex', fontSize: 18, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 40, color: '#ffffff', fontWeight: 800 }}>{value}</div>
    </div>
  );
}
