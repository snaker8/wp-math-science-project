// ============================================================================
// GET /api/share/student-report/[token]
//
// 학부모 공유 페이지용 공개 데이터 (인증 불필요).
// token 으로 diagnostics.sessions 조회 → 기존 report API 와 동일 형식 응답.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// 우리 report API 응답 형식을 그대로 재현하기 위해 동일 로직 일부 복제
interface UnitInfo {
  major: string;
  minor: string;
  sub: string;
  fine: string;
  fullPath: string;
}

const COG_KOR: Record<string, string> = {
  CALCULATION: '계산',
  UNDERSTANDING: '이해',
  INFERENCE: '추론',
  PROBLEM_SOLVING: '문제해결',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token;
  if (!token) {
    return NextResponse.json({ error: '토큰 필수' }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin 미설정' }, { status: 500 });
  }

  // 토큰으로 세션 찾기
  const { data: sessions } = await supabaseAdmin
    .schema('diagnostics')
    .from('sessions')
    .select(
      'id, exam_id, student_id, conducted_at, ai_comment_json, teacher_comment_json'
    )
    .eq('share_token', token)
    .eq('session_type', 'EX')
    .limit(1);

  const session = sessions?.[0] as
    | {
        id: string;
        exam_id: string;
        student_id: string;
        conducted_at: string | null;
        ai_comment_json: Record<string, unknown> | null;
        teacher_comment_json: Record<string, unknown> | null;
      }
    | undefined;

  if (!session) {
    return NextResponse.json(
      { error: '유효하지 않은 공유 링크입니다.' },
      { status: 404 }
    );
  }

  // 시험 정보
  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('id, title')
    .eq('id', session.exam_id)
    .maybeSingle();
  if (!exam) {
    return NextResponse.json({ error: 'exam not found' }, { status: 404 });
  }

  // 학생 정보 (roster 우선, 없으면 users)
  let studentName = '(미상)';
  let studentGrade: number | null = null;
  let studentClass: string | null = null;
  const { data: roster } = await supabaseAdmin
    .from('roster_students')
    .select('full_name, grade, class_label')
    .eq('id', session.student_id)
    .maybeSingle();
  if (roster) {
    studentName = (roster as { full_name: string }).full_name;
    studentGrade = (roster as { grade: number | null }).grade;
    studentClass = (roster as { class_label: string | null }).class_label;
  } else {
    const { data: u } = await supabaseAdmin
      .from('users')
      .select('full_name, grade')
      .eq('id', session.student_id)
      .maybeSingle();
    if (u) {
      studentName = (u as { full_name: string }).full_name;
      studentGrade = (u as { grade: number | null }).grade;
    }
  }

  // exam_problems
  const { data: epRaw } = await supabaseAdmin
    .from('exam_problems')
    .select(
      `problem_id, sequence_number, points,
       problems ( source_number, answer_json,
         classifications ( type_code, difficulty, cognitive_domain ) )`
    )
    .eq('exam_id', session.exam_id)
    .order('sequence_number', { ascending: true });

  type Row = {
    problem_id: string;
    sequence_number: number;
    points: number | null;
    problems: {
      source_number: number | null;
      answer_json: Record<string, unknown> | null;
      classifications:
        | {
            type_code: string | null;
            difficulty: number | null;
            cognitive_domain: string | null;
          }
        | Array<{
            type_code: string | null;
            difficulty: number | null;
            cognitive_domain: string | null;
          }>
        | null;
    } | null;
  };

  type Spec = {
    fullScore: number;
    typeCode: string | null;
    difficulty: number;
    answerType: string;
    concept: string;
    cognitiveDomain: string;
  };

  const specMap = new Map<number, Spec>();
  const allTypeCodes = new Set<string>();

  for (const row of (epRaw ?? []) as unknown as Row[]) {
    const p = row.problems;
    if (!p) continue;
    const cls = Array.isArray(p.classifications)
      ? p.classifications[0]
      : p.classifications;
    const qNum =
      (typeof p.source_number === 'number' ? p.source_number : null) ??
      row.sequence_number;
    if (!qNum) continue;

    const aj = p.answer_json ?? {};
    const fullScore =
      typeof row.points === 'number'
        ? Number(row.points)
        : typeof aj.points === 'number'
          ? (aj.points as number)
          : 4;

    if (cls?.type_code) allTypeCodes.add(cls.type_code);

    specMap.set(qNum, {
      fullScore,
      typeCode: cls?.type_code ?? null,
      difficulty: cls?.difficulty ?? 3,
      answerType: (aj.type as string) || 'short_answer',
      concept: (aj.concept as string) || '',
      cognitiveDomain: cls?.cognitive_domain ?? 'UNDERSTANDING',
    });
  }

  // 단원 lookup
  const typeCodeToUnits = new Map<string, UnitInfo>();
  if (allTypeCodes.size > 0) {
    const { data: types } = await supabaseAdmin
      .from('mathsecr_types')
      .select(
        'code, level1_name, level2_name, level3_name, level4_name, full_path'
      )
      .in('code', Array.from(allTypeCodes));
    for (const t of types ?? []) {
      const tt = t as {
        code: string;
        level1_name: string | null;
        level2_name: string | null;
        level3_name: string | null;
        level4_name: string | null;
        full_path: string | null;
      };
      typeCodeToUnits.set(tt.code, {
        major: tt.level1_name ?? '미분류',
        minor: tt.level2_name ?? '',
        sub: tt.level3_name ?? '',
        fine: tt.level4_name ?? '',
        fullPath: tt.full_path ?? '',
      });
    }
  }

  // items
  const { data: items } = await supabaseAdmin
    .schema('diagnostics')
    .from('items')
    .select('seq, mathsecr_code, is_correct, note')
    .eq('session_id', session.id);

  const itemBySeq = new Map<
    number,
    { isCorrect: boolean; note: string | null }
  >();
  for (const it of items ?? []) {
    const tt = it as { seq: number; is_correct: boolean; note: string | null };
    itemBySeq.set(tt.seq, { isCorrect: tt.is_correct, note: tt.note });
  }

  const defaultUnit: UnitInfo = {
    major: '미분류',
    minor: '',
    sub: '',
    fine: '',
    fullPath: '',
  };

  interface ResultRow {
    qNum: number;
    majorUnit: string;
    minorUnit: string;
    subUnit: string;
    fineUnit: string;
    cognitiveDomain: string;
    type: string;
    difficulty: number;
    fullScore: number;
    earnedScore: number;
    status: 'O' | '△' | 'X';
    isCorrect: boolean;
    concept: string;
    typeCode: string | null;
  }

  const results: ResultRow[] = [];
  let totalEarned = 0;
  let totalPossible = 0;

  for (const [qNum, spec] of Array.from(specMap.entries()).sort(
    (a, b) => a[0] - b[0]
  )) {
    const item = itemBySeq.get(qNum);
    const units = spec.typeCode
      ? (typeCodeToUnits.get(spec.typeCode) ?? defaultUnit)
      : defaultUnit;

    let status: 'O' | '△' | 'X' = 'X';
    let earned = 0;
    // ★ 만점은 시스템 배점(exam_problems.points) 우선 (2026-05-31) — report/route.ts 와 동일.
    //   note 의 정/오 비율만 취하고 만점은 시스템 배점으로 환산. 매쓰플랫 CSV 배점 1 깨짐 케이스
    //   (partial:1/1) 도 재업로드 없이 정상화. 시스템 배점 없으면 CSV full 사용(무회귀).
    let effectiveFullScore = spec.fullScore;

    if (item) {
      if (item.note && item.note.startsWith('partial:')) {
        const m = item.note.match(/^partial:([0-9.]+)\/([0-9.]+)$/);
        if (m) {
          const noteEarned = parseFloat(m[1]);
          const csvFull = parseFloat(m[2]);
          const ratio = Number.isFinite(csvFull) && csvFull > 0 ? noteEarned / csvFull : 0;
          effectiveFullScore =
            spec.fullScore > 0
              ? spec.fullScore
              : Number.isFinite(csvFull) && csvFull > 0
                ? csvFull
                : spec.fullScore;
          earned = Math.round(ratio * effectiveFullScore * 10) / 10;
          status =
            earned >= effectiveFullScore ? 'O' : earned > 0 ? '△' : 'X';
        }
      } else if (item.isCorrect) {
        earned = effectiveFullScore;
        status = 'O';
      }
    }

    totalEarned += earned;
    totalPossible += effectiveFullScore;

    const t = (spec.answerType ?? '').toLowerCase();
    const typeKor = t.includes('multiple') || t.includes('객관')
      ? '객관식'
      : t.includes('short') || t.includes('essay') || t.includes('multi_step') || t.includes('주관') || t.includes('서술')
        ? '주관식/서술형'
        : '기타';

    results.push({
      qNum,
      majorUnit: units.major,
      minorUnit: units.minor,
      subUnit: units.sub,
      fineUnit: units.fine,
      cognitiveDomain: spec.cognitiveDomain,
      type: typeKor,
      difficulty: spec.difficulty,
      fullScore: effectiveFullScore,
      earnedScore: Math.round(earned * 10) / 10,
      status,
      isCorrect: earned > 0,
      concept: spec.concept,
      typeCode: spec.typeCode,
    });
  }

  // 세부유형 / 인지영역 집계 (학생 리포트 API 와 동일)
  const fineMap = new Map<string, { fullPath: string; total: number; correct: number }>();
  for (const r of results) {
    const key = r.fineUnit || r.subUnit || r.minorUnit || r.majorUnit || '미분류';
    const fullPath =
      (r.typeCode && typeCodeToUnits.get(r.typeCode)?.fullPath) ||
      [r.majorUnit, r.minorUnit, r.subUnit, r.fineUnit].filter(Boolean).join(' > ');
    const a = fineMap.get(key) ?? { fullPath, total: 0, correct: 0 };
    a.total += 1;
    if (r.earnedScore > 0) a.correct += 1;
    fineMap.set(key, a);
  }
  const fineUnitStats = Array.from(fineMap.entries())
    .map(([name, v]) => ({
      name,
      fullPath: v.fullPath,
      total: v.total,
      correct: v.correct,
      pct: v.total > 0 ? Math.round((v.correct * 100) / v.total) : 0,
    }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);

  const cogMap = new Map<string, { total: number; correct: number }>();
  for (const r of results) {
    const k = r.cognitiveDomain || 'UNDERSTANDING';
    const a = cogMap.get(k) ?? { total: 0, correct: 0 };
    a.total += 1;
    if (r.earnedScore > 0) a.correct += 1;
    cogMap.set(k, a);
  }
  const cognitiveDomainStats = Array.from(cogMap.entries()).map(([code, v]) => ({
    code,
    total: v.total,
    correct: v.correct,
    pct: v.total > 0 ? Math.round((v.correct * 100) / v.total) : 0,
  }));

  const scorePct =
    totalPossible > 0 ? Math.round((totalEarned * 100) / totalPossible) : 0;

  return NextResponse.json({
    student: {
      id: session.student_id,
      name: studentName,
      grade: studentGrade,
      classLabel: studentClass,
    },
    exam: {
      id: session.exam_id,
      title: exam.title,
    },
    totalEarned: Math.round(totalEarned * 10) / 10,
    totalPossible: Math.round(totalPossible * 10) / 10,
    scorePct,
    results,
    fineUnitStats,
    cognitiveDomainStats,
    // 학부모용은 반 백분위·시계열 추이 제외 (학원 데이터 보호)
    aiComment: session.ai_comment_json ?? null,
    teacherComment: session.teacher_comment_json ?? null,
  });

  // suppress unused
  void COG_KOR;
}
