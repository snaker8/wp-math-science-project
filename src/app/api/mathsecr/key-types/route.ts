// ============================================================================
// GET /api/mathsecr/key-types?subject=MS05&school=&threshold=30 — 중요 유형 (학교기출 출제 빈도)
// ----------------------------------------------------------------------------
// docs/PLAN_KEY_TYPES.md K1. 매쓰홀릭 「중요 유형」 배지를 우리 학교기출 자산의 출제 빈도로.
//   내신 빈출  = 과정 학교기출 시험지의 threshold% 이상에 등장 (기본 30%)
//   이 학교 빈출 = 그 학교 시험지 2장 이상 등장 (school 지정 시)
// 집계는 DB 함수 key_type_frequency. 10분 메모리 캐시(인스턴스별).
// 집계 숫자만 나간다 — 시험지 내용은 아니다. 문제풀처럼 학원 공통 지식으로 본다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export interface KeyTypeItem {
  code: string;
  exams: number;
  pct: number;
  schools: string[];
  key: boolean;
}
export interface KeyTypesPayload {
  subject: string;
  school: string | null;
  totalExams: number;
  threshold: number;
  /** 학교 지정 시 최소 등장 시험지 수 */
  minExams: number;
  items: KeyTypeItem[];
  /** 과정에 학교기출이 있는 학교들 (선택 후보) */
  schoolsAll: string[];
}

const cache = new Map<string, { at: number; payload: KeyTypesPayload }>();
const TTL = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sp = new URL(req.url).searchParams;
  const subject = (sp.get('subject') ?? '').trim();
  if (!/^MS\d{2}$/.test(subject)) return NextResponse.json({ error: 'subject(MSxx) 가 필요합니다' }, { status: 400 });
  const school = (sp.get('school') ?? '').trim() || null;
  const threshold = Math.min(100, Math.max(5, Number(sp.get('threshold')) || 30));
  const minExams = 2;

  const ck = `${subject}|${school ?? ''}|${threshold}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.payload);

  const { data, error } = await supabaseAdmin.rpc('key_type_frequency', { subject_prefix: subject, school });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<{ type_code: string; exam_count: number; total_exams: number; schools: string[] | null }>;
  const totalExams = rows[0]?.total_exams ?? 0;
  const schoolsAll = new Set<string>();
  const items: KeyTypeItem[] = rows.map((r) => {
    for (const s of r.schools ?? []) schoolsAll.add(s);
    const pct = totalExams > 0 ? Math.round((Number(r.exam_count) * 100) / Number(totalExams)) : 0;
    const key = school ? Number(r.exam_count) >= minExams : pct >= threshold;
    return { code: r.type_code, exams: Number(r.exam_count), pct, schools: r.schools ?? [], key };
  }).sort((a, b) => b.exams - a.exams);

  // 학교 후보는 과정 전체 기준으로 (학교를 골라도 목록이 줄지 않게)
  let allSchools = Array.from(schoolsAll);
  if (school) {
    const { data: all } = await supabaseAdmin.rpc('key_type_frequency', { subject_prefix: subject, school: null });
    const s = new Set<string>();
    for (const r of (all ?? []) as Array<{ schools: string[] | null }>) for (const x of r.schools ?? []) s.add(x);
    allSchools = Array.from(s);
  }
  allSchools.sort((a, b) => a.localeCompare(b, 'ko'));

  const payload: KeyTypesPayload = { subject, school, totalExams: Number(totalExams), threshold, minExams, items, schoolsAll: allSchools };
  cache.set(ck, { at: Date.now(), payload });
  return NextResponse.json(payload);
}
