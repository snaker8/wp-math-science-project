// ============================================================================
// GET /api/exams/school-filter-options
//
// 매쓰플랫식 4-필터 풀세트 UI 의 드롭다운 데이터.
// 응답: { districts: [{ district, schools: string[] }], grades: string[], examRounds: string[] }
//
// 보안: institute-guard `{ allowCommonPool: true }` — 공통풀 + 자기 학원 자료 모두.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(_request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let query = supabaseAdmin
    .from('exams')
    .select('school_name, district, grade, semester, exam_round')
    .is('deleted_at', null)
    .not('school_name', 'is', null)
    .limit(5000);

  query = applyInstituteFilter(query, scope, { allowCommonPool: true });

  const { data, error } = await query;
  if (error) {
    console.error('[school-filter-options] query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    school_name: string | null;
    district: string | null;
    grade: string | null;
    semester: number | null;
    exam_round: string | null;
  };
  const rows = (data || []) as Row[];

  // ── 지역·학교 트리 ──
  // district → school_name set
  const districtToSchools = new Map<string, Set<string>>();
  const noDistrictSchools = new Set<string>();  // district NULL 인 학교들 — "기타 지역" 으로 묶음

  for (const r of rows) {
    if (!r.school_name) continue;
    const d = (r.district || '').trim();
    if (!d) {
      noDistrictSchools.add(r.school_name);
      continue;
    }
    if (!districtToSchools.has(d)) districtToSchools.set(d, new Set());
    districtToSchools.get(d)!.add(r.school_name);
  }

  // 시도·시군구 트리 — "부산 동래구" → sido="부산", sigungu="동래구"
  const sidoTree = new Map<string, Map<string, Set<string>>>();  // sido → sigungu → schools
  for (const [district, schools] of districtToSchools.entries()) {
    const [sido, ...rest] = district.split(/\s+/);
    const sigungu = rest.join(' ') || '(시군구 미상)';
    if (!sidoTree.has(sido)) sidoTree.set(sido, new Map());
    const subMap = sidoTree.get(sido)!;
    if (!subMap.has(sigungu)) subMap.set(sigungu, new Set());
    const schoolSet = subMap.get(sigungu)!;
    schools.forEach((s) => schoolSet.add(s));
  }

  const regionTree = Array.from(sidoTree.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([sido, sigunguMap]) => ({
      sido,
      sigungus: Array.from(sigunguMap.entries())
        .sort(([a], [b]) => a.localeCompare(b, 'ko'))
        .map(([sigungu, schoolSet]) => ({
          sigungu,
          schools: Array.from(schoolSet).sort((a, b) => a.localeCompare(b, 'ko')),
        })),
    }));

  // ── 학년 / 학기 / 회차 DISTINCT ──
  const grades = Array.from(new Set(rows.map((r) => r.grade).filter((v): v is string => !!v)))
    .sort((a, b) => a.localeCompare(b, 'ko'));
  const semesters = Array.from(new Set(rows.map((r) => r.semester).filter((v): v is number => v != null)))
    .sort();
  const examRounds = Array.from(new Set(rows.map((r) => r.exam_round).filter((v): v is string => !!v)))
    .sort((a, b) => {
      const order: Record<string, number> = { '중간': 0, '기말': 1, '단원집': 2, '수행평가': 3 };
      return (order[a] ?? 99) - (order[b] ?? 99);
    });

  return NextResponse.json({
    regionTree,
    otherSchools: Array.from(noDistrictSchools).sort((a, b) => a.localeCompare(b, 'ko')),
    grades,
    semesters,
    examRounds,
  });
}
