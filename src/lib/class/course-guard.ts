// 코스 라우트 공용 — 코스 로드 + 격리 가드, 계단 파서
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import type { LadderRung } from '@/lib/class/course-ladder';

export interface CourseRecord {
  id: string;
  class_id: string;
  institute_id: string | null;
  subject_code: string;
  title: string;
  settings: Record<string, unknown> | null;
}

export async function loadCourse(
  classId: string,
  courseId: string,
  scope: Parameters<typeof assertInstituteAccess>[0],
): Promise<{ ok: true; course: CourseRecord } | { ok: false; res: NextResponse }> {
  const { data } = await supabaseAdmin!
    .from('courses')
    .select('id, class_id, institute_id, subject_code, title, settings')
    .eq('id', courseId).eq('class_id', classId).is('deleted_at', null).maybeSingle();
  if (!data) return { ok: false, res: NextResponse.json({ error: '코스를 찾을 수 없습니다' }, { status: 404 }) };
  const c = data as CourseRecord;
  try {
    assertInstituteAccess(scope, c.institute_id);
  } catch {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, course: c };
}

/** settings.ladder / 요청 ladder 검증 — 모양이 어긋나면 null (기본 계단으로) */
export function parseLadder(v: unknown): LadderRung[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: LadderRung[] = [];
  for (const r of v) {
    if (!r || typeof r !== 'object') return null;
    const o = r as { mix?: unknown; label?: unknown };
    if (!o.mix || typeof o.mix !== 'object') return null;
    const mix: Record<string, number> = {};
    for (const [k, n] of Object.entries(o.mix as Record<string, unknown>)) {
      const x = Number(n);
      if (!/^[A-D][12]?$/.test(k) || !Number.isFinite(x) || x <= 0) return null;
      mix[k] = x;
    }
    if (Object.keys(mix).length === 0) return null;
    out.push({ mix, label: typeof o.label === 'string' ? o.label.slice(0, 10) : '' });
  }
  return out;
}
