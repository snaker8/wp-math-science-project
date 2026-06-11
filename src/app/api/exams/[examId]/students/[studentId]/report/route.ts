// ============================================================================
// GET /api/exams/[examId]/students/[studentId]/report
//
// 한 학생의 A4 리포트용 데이터.
// studentId = roster_students.id (또는 promoted_user_id 와 머지된 users.id)
//
// 응답: {
//   student: { id, name, grade, classLabel },
//   exam: { id, title },
//   totalEarned, totalPossible, scorePct,
//   results: [{ qNum, majorUnit, minorUnit, type, difficulty, fullScore, earnedScore, status, isCorrect, concept }]
// }
// 단원/난이도/유형별 분포는 클라이언트에서 results 로부터 계산 (UI 가 동적).
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const runtime = 'nodejs';

interface ResultRow {
  qNum: number;
  majorUnit: string;       // level1_name (대단원)
  minorUnit: string;       // level2_name (중단원)
  subUnit: string;         // level3_name (소단원)
  fineUnit: string;        // level4_name (세부유형, 가장 깊은 단계)
  cognitiveDomain: string; // CALCULATION | UNDERSTANDING | INFERENCE | PROBLEM_SOLVING
  type: string;            // '객관식' | '주관식/서술형' | '기타'
  difficulty: number;      // 1~10 (problems 기준)
  fullScore: number;
  earnedScore: number;
  status: 'O' | '△' | 'X';
  isCorrect: boolean;
  concept: string;
  typeCode: string | null;
}

interface FineUnitStat {
  name: string;            // 세부유형명 (없으면 소단원/중단원으로 폴백)
  fullPath: string;        // "공통수학1 > 다항식 > 인수분해 > 복이차식"
  total: number;
  correct: number;
  pct: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { examId: string; studentId: string } }
) {
  const { examId, studentId } = params;
  if (!examId || !studentId) {
    return NextResponse.json({ error: 'examId, studentId 필수' }, { status: 400 });
  }

  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin 미설정' }, { status: 500 });
  }

  // 1. 시험 접근 검증
  const { data: exam, error: examErr } = await supabaseAdmin
    .from('exams')
    .select('id, institute_id, title')
    .eq('id', examId)
    .maybeSingle();
  if (examErr) return NextResponse.json({ error: examErr.message }, { status: 500 });
  if (!exam) return NextResponse.json({ error: 'exam not found' }, { status: 404 });
  if (exam.institute_id !== null) {
    try {
      assertInstituteAccess(scope, exam.institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // 2. 학생 정보 (roster_students 우선, 없으면 users 시도)
  let studentName = '(미상)';
  let studentGrade: number | null = null;
  let studentClass: string | null = null;
  // ★ 2026-06-04: user-타입 학생의 institute — report_style 결정에 사용 (roster 없을 때)
  let userInstituteId: string | null = null;

  const { data: roster } = await supabaseAdmin
    .from('roster_students')
    .select('id, full_name, grade, class_label, institute_id')
    .eq('id', studentId)
    .maybeSingle();

  if (roster) {
    if (roster.institute_id !== null) {
      try {
        assertInstituteAccess(scope, roster.institute_id);
      } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    studentName = (roster as { full_name: string }).full_name;
    studentGrade = (roster as { grade: number | null }).grade;
    studentClass = (roster as { class_label: string | null }).class_label;
  } else {
    const { data: u } = await supabaseAdmin
      .from('users')
      .select('full_name, grade, institute_id')
      .eq('id', studentId)
      .maybeSingle();
    if (u) {
      studentName = (u as { full_name: string }).full_name;
      studentGrade = (u as { grade: number | null }).grade;
      userInstituteId = (u as { institute_id: string | null }).institute_id ?? null;
    }
  }

  // 2-b. 센터별 리포트 스타일 — exam institute 우선, 없으면 학생 institute
  //   legacy=기존 인디고(동부산 등), unified=share/exam warm 톤 통일
  const styleInstituteId =
    exam.institute_id ?? ((roster as { institute_id: string | null } | null)?.institute_id ?? userInstituteId);
  let reportStyle: 'legacy' | 'unified' = 'legacy';
  if (styleInstituteId) {
    const { data: inst } = await supabaseAdmin
      .from('institutes')
      .select('report_style')
      .eq('id', styleInstituteId)
      .maybeSingle();
    if ((inst as { report_style?: string } | null)?.report_style === 'unified') {
      reportStyle = 'unified';
    }
  }

  // 3. 세션 조회 (가장 최근 EX 세션)
  const { data: sessions } = await supabaseAdmin
    .schema('diagnostics')
    .from('sessions')
    .select('id, conducted_at, ai_comment_json, teacher_comment_json')
    .eq('exam_id', examId)
    .eq('student_id', studentId)
    .eq('session_type', 'EX')
    .order('conducted_at', { ascending: false })
    .limit(1);

  const session = sessions?.[0] as
    | {
        id: string;
        conducted_at: string | null;
        ai_comment_json: Record<string, unknown> | null;
        teacher_comment_json: Record<string, unknown> | null;
      }
    | undefined;
  // ★ 채점 라인 2개: EX 세션(items) + QR/수동 채점(session_results). 세트 리포트(compute-report 4b)와
  //   동일하게 둘 다 읽는다. EX 세션이 없어도 session_results 가 있으면 리포트를 만든다
  //   → "채점 기록 없음" 판정은 itemBySeq 를 채운 뒤(아래)로 미룬다.
  // print_sessions.student_id = users.id → studentId(roster id 가능)를 신원 병합해 매칭.
  const identityIds = new Set<string>([studentId]);
  {
    const { data: rosterSelf } = await supabaseAdmin
      .from('roster_students').select('promoted_user_id').eq('id', studentId).maybeSingle();
    const pu = (rosterSelf as { promoted_user_id: string | null } | null)?.promoted_user_id;
    if (pu) identityIds.add(pu);
    const { data: rostersForUser } = await supabaseAdmin
      .from('roster_students').select('id').eq('promoted_user_id', studentId);
    for (const r of (rostersForUser ?? []) as Array<{ id: string }>) identityIds.add(r.id);
  }

  // 4. 시험 문제 목록 (qNum → spec)
  const { data: examProblemsRaw } = await supabaseAdmin
    .from('exam_problems')
    .select(
      `
      problem_id,
      sequence_number,
      points,
      problems (
        source_number,
        answer_json,
        classifications (
          type_code,
          difficulty,
          cognitive_domain
        )
      )
    `
    )
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });

  type ExamProblemJoinRow = {
    problem_id: string;
    sequence_number: number;
    points: number | null;
    problems: {
      source_number: number | null;
      answer_json: Record<string, unknown> | null;
      classifications:
        | { type_code: string | null; difficulty: number | null; cognitive_domain: string | null }
        | Array<{ type_code: string | null; difficulty: number | null; cognitive_domain: string | null }>
        | null;
    } | null;
  };

  type ProblemSpec = {
    problemId: string;
    fullScore: number;
    typeCode: string | null;
    difficulty: number;
    answerType: string;
    concept: string;
    cognitiveDomain: string;
  };

  const examProblems = (examProblemsRaw ?? []) as unknown as ExamProblemJoinRow[];
  const specMap = new Map<number, ProblemSpec>();
  const allTypeCodes = new Set<string>();
  // session_results.sequence_number(배포 순번) → qNum(문항번호) 매핑 — 라인 B 채점 병합용
  const qNumBySeqNum = new Map<number, number>();

  for (const row of examProblems) {
    const p = row.problems;
    if (!p) continue;
    const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
    const qNum =
      (typeof p.source_number === 'number' ? p.source_number : null) ?? row.sequence_number;
    if (!qNum) continue;
    qNumBySeqNum.set(row.sequence_number, qNum);

    const fullScore =
      typeof row.points === 'number'
        ? Number(row.points)
        : extractPoints(p.answer_json) ?? 4;

    const aj = p.answer_json ?? {};
    const answerType = (aj.type as string) || 'short_answer';
    const concept = (aj.concept as string) || '';

    if (cls?.type_code) allTypeCodes.add(cls.type_code);

    specMap.set(qNum, {
      problemId: row.problem_id,
      fullScore,
      typeCode: cls?.type_code ?? null,
      difficulty: cls?.difficulty ?? 3,
      answerType,
      concept,
      cognitiveDomain: cls?.cognitive_domain ?? 'UNDERSTANDING',
    });
  }

  // 5. mathsecr_types 단원명 lookup — level1~4 + full_path 까지 모두 가져옴
  interface UnitInfo {
    major: string;
    minor: string;
    sub: string;
    fine: string;
    fullPath: string;
  }
  const typeCodeToUnits = new Map<string, UnitInfo>();
  if (allTypeCodes.size > 0) {
    const { data: types } = await supabaseAdmin
      .from('mathsecr_types')
      .select('code, level1_name, level2_name, level3_name, level4_name, full_path')
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

  // typeCode 전체가 매칭 안 됐을 수 있어 — 상위 4세그먼트로 prefix 매칭도 시도
  for (const code of allTypeCodes) {
    if (typeCodeToUnits.has(code)) continue;
    const parts = code.split('-');
    if (parts.length >= 4) {
      const prefix = parts.slice(0, 4).join('-');
      const { data: byPrefix } = await supabaseAdmin
        .from('mathsecr_types')
        .select('code, level1_name, level2_name, level3_name, level4_name, full_path')
        .eq('code', prefix)
        .maybeSingle();
      if (byPrefix) {
        const bp = byPrefix as {
          level1_name: string | null;
          level2_name: string | null;
          level3_name: string | null;
          level4_name: string | null;
          full_path: string | null;
        };
        typeCodeToUnits.set(code, {
          major: bp.level1_name ?? '미분류',
          minor: bp.level2_name ?? '',
          sub: bp.level3_name ?? '',
          fine: bp.level4_name ?? '',
          fullPath: bp.full_path ?? '',
        });
      }
    }
  }

  // 6. 채점 조립 — 라인 A: EX 세션 items, 라인 B: QR/수동 session_results. (세트 리포트와 동일 소스)
  const itemBySeq = new Map<
    number,
    { isCorrect: boolean; note: string | null }
  >();

  // 라인 A — EX 세션 items (seq = qNum)
  if (session) {
    const { data: items } = await supabaseAdmin
      .schema('diagnostics')
      .from('items')
      .select('seq, mathsecr_code, is_correct, note')
      .eq('session_id', session.id);
    for (const it of items ?? []) {
      const tt = it as { seq: number; is_correct: boolean; note: string | null };
      itemBySeq.set(tt.seq, { isCorrect: tt.is_correct, note: tt.note });
    }
  }

  // 라인 B — QR/인쇄 수동 채점 (print_sessions + session_results).
  //   EX items 에 없는 문항만 채움(중복 방지). sequence_number → qNum 매핑. 자동채점 보류 문항 제외.
  {
    const { data: psRows } = await supabaseAdmin
      .schema('diagnostics')
      .from('print_sessions')
      .select('id, completed_at')
      .eq('exam_id', examId)
      .in('student_id', Array.from(identityIds))
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(1);
    const ps = (psRows ?? [])[0] as { id: string } | undefined;
    if (ps) {
      const { data: srRows } = await supabaseAdmin
        .schema('diagnostics')
        .from('session_results')
        .select('sequence_number, is_correct, teacher_note')
        .eq('session_id', ps.id);
      for (const sr of (srRows ?? []) as Array<{
        sequence_number: number;
        is_correct: boolean;
        teacher_note: string | null;
      }>) {
        if ((sr.teacher_note ?? '').includes('자동채점 보류')) continue;
        const qn = qNumBySeqNum.get(sr.sequence_number);
        if (qn == null || itemBySeq.has(qn)) continue;
        itemBySeq.set(qn, { isCorrect: sr.is_correct, note: null });
      }
    }
  }

  // 두 라인 모두 비면 채점 기록 없음
  if (itemBySeq.size === 0) {
    return NextResponse.json({
      student: { id: studentId, name: studentName, grade: studentGrade, classLabel: studentClass },
      exam: { id: examId, title: exam.title },
      totalEarned: 0,
      totalPossible: 0,
      scorePct: 0,
      results: [],
      reportStyle,
      message: '이 학생의 채점 기록이 없습니다.',
    });
  }

  // 7. results 조립 + 합계
  const results: ResultRow[] = [];
  let totalEarned = 0;
  let totalPossible = 0;

  const defaultUnit: UnitInfo = {
    major: '미분류',
    minor: '',
    sub: '',
    fine: '',
    fullPath: '',
  };

  for (const [qNum, spec] of Array.from(specMap.entries()).sort(
    (a, b) => a[0] - b[0]
  )) {
    const item = itemBySeq.get(qNum);
    const units = spec.typeCode
      ? (typeCodeToUnits.get(spec.typeCode) ?? defaultUnit)
      : defaultUnit;

    let status: 'O' | '△' | 'X' = 'X';
    let earned = 0;
    // ★ 만점은 시스템 배점(exam_problems.points) 우선 (2026-05-31).
    //   note 의 partial:earned/full 에서 "정/오 비율"만 취하고, 만점은 시스템 배점으로 환산.
    //   매쓰플랫 CSV 배점이 1 로 깨져 저장된 기존 데이터(partial:1/1)도 재업로드 없이 정상화됨.
    //   시스템 배점이 없으면(0/누락) note 의 CSV full 사용 → 무회귀(신곡중 2-1: 시스템 NULL).
    let effectiveFullScore = spec.fullScore;

    if (item) {
      if (item.note && item.note.startsWith('partial:')) {
        const m = item.note.match(/^partial:([0-9.]+)\/([0-9.]+)$/);
        if (m) {
          const noteEarned = parseFloat(m[1]);
          const csvFull = parseFloat(m[2]);
          const ratio = Number.isFinite(csvFull) && csvFull > 0 ? noteEarned / csvFull : 0;
          // 시스템 배점 우선, 없으면 note 의 CSV full
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

    results.push({
      qNum,
      majorUnit: units.major,
      minorUnit: units.minor,
      subUnit: units.sub,
      fineUnit: units.fine,
      cognitiveDomain: spec.cognitiveDomain,
      type: mapAnswerTypeToKor(spec.answerType),
      difficulty: spec.difficulty,
      fullScore: effectiveFullScore,
      earnedScore: Math.round(earned * 10) / 10,
      status,
      isCorrect: earned > 0,
      concept: spec.concept,
      typeCode: spec.typeCode,
    });
  }

  // 세부유형(level4 또는 fallback) 정답률 집계
  // 키 우선순위: fine → sub → minor → major
  const fineMap = new Map<
    string,
    { fullPath: string; total: number; correct: number }
  >();
  for (const r of results) {
    const key =
      r.fineUnit || r.subUnit || r.minorUnit || r.majorUnit || '미분류';
    // 같은 typeCode를 가진 문항들의 fullPath 는 동일하다고 가정 → typeCodeToUnits 에서 lookup
    const fullPath =
      (r.typeCode && typeCodeToUnits.get(r.typeCode)?.fullPath) ||
      [r.majorUnit, r.minorUnit, r.subUnit, r.fineUnit]
        .filter(Boolean)
        .join(' > ');
    const agg = fineMap.get(key) ?? { fullPath, total: 0, correct: 0 };
    agg.total += 1;
    if (r.earnedScore > 0) agg.correct += 1;
    fineMap.set(key, agg);
  }
  const fineUnitStats: FineUnitStat[] = Array.from(fineMap.entries())
    .map(([name, v]) => ({
      name,
      fullPath: v.fullPath,
      total: v.total,
      correct: v.correct,
      pct: v.total > 0 ? Math.round((v.correct * 100) / v.total) : 0,
    }))
    // 약점 먼저: 정답률 낮은 순 → 같으면 출제 많은 순
    .sort((a, b) => a.pct - b.pct || b.total - a.total);

  // 인지영역 분포
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

  // ===== 반 백분위 (같은 시험 본 다른 학생들과 비교) =====
  //   percentile: 상위 N% (1~100, 낮을수록 상위)
  //   rank: 1위부터 시작
  //   classSize: 이 시험을 본 전체 학생 수 (본인 포함)
  //   classAvg: 학급 평균 점수율
  let classPercentile: number | null = null;
  let classRank: number | null = null;
  let classSize = 0;
  let classAvg: number | null = null;

  {
    const { data: peerSessions } = await supabaseAdmin
      .schema('diagnostics')
      .from('sessions')
      .select('id, student_id')
      .eq('exam_id', examId)
      .eq('session_type', 'EX');

    const peerSessionIds = (peerSessions ?? []).map((s) => s.id as string);
    classSize = peerSessionIds.length;

    if (classSize >= 2) {
      const { data: peerItems } = await supabaseAdmin
        .schema('diagnostics')
        .from('items')
        .select('session_id, is_correct')
        .in('session_id', peerSessionIds);

      // session_id → score percentage (correct/total)
      const peerScore = new Map<string, { correct: number; total: number }>();
      for (const it of peerItems ?? []) {
        const tt = it as { session_id: string; is_correct: boolean };
        const a = peerScore.get(tt.session_id) ?? { correct: 0, total: 0 };
        a.total += 1;
        if (tt.is_correct) a.correct += 1;
        peerScore.set(tt.session_id, a);
      }

      const scores: { sessionId: string; pct: number }[] = [];
      for (const [sid, v] of peerScore.entries()) {
        scores.push({
          sessionId: sid,
          pct: v.total > 0 ? (v.correct * 100) / v.total : 0,
        });
      }
      scores.sort((a, b) => b.pct - a.pct);

      // 본인 세션의 순위
      const idx = scores.findIndex((s) => s.sessionId === session?.id);
      if (idx >= 0) {
        classRank = idx + 1;
        classPercentile = Math.max(
          1,
          Math.round(((idx + 1) * 100) / scores.length)
        );
      }
      const sum = scores.reduce((s, v) => s + v.pct, 0);
      classAvg = scores.length > 0 ? Math.round(sum / scores.length) : null;
    }
  }

  // ===== 시계열 추이 (같은 학생의 다른 EX 시험과 단원별 비교) =====
  // 정책: 가장 최근 다른 EX 세션 1개와 비교. 단원=mathsecr level1_name.
  type UnitTrendRow = {
    name: string;
    prevCorrect: number;
    prevTotal: number;
    prevPct: number;
    currCorrect: number;
    currTotal: number;
    currPct: number;
    delta: number;
  };
  type UnitTrend = {
    prevExamId: string;
    prevExamTitle: string;
    prevConductedAt: string | null;
    units: UnitTrendRow[];
  } | null;

  let unitTrend: UnitTrend = null;
  {
    // 같은 학생의 다른 EX 세션 (가장 최근 1개). 현재 EX 세션이 있으면 그것만 제외.
    let otherSessionsQ = supabaseAdmin
      .schema('diagnostics')
      .from('sessions')
      .select('id, exam_id, conducted_at')
      .eq('student_id', studentId)
      .eq('session_type', 'EX');
    if (session) otherSessionsQ = otherSessionsQ.neq('id', session.id);
    const { data: otherSessions } = await otherSessionsQ
      .order('conducted_at', { ascending: false })
      .limit(1);

    const prevSess = (otherSessions ?? [])[0] as
      | { id: string; exam_id: string; conducted_at: string | null }
      | undefined;

    if (prevSess) {
      // 이전 시험 정보
      const { data: prevExam } = await supabaseAdmin
        .from('exams')
        .select('id, title')
        .eq('id', prevSess.exam_id)
        .maybeSingle();

      // 이전 세션 items + 그 typeCode들의 level1_name lookup
      const { data: prevItems } = await supabaseAdmin
        .schema('diagnostics')
        .from('items')
        .select('mathsecr_code, is_correct')
        .eq('session_id', prevSess.id);

      const prevTypeCodes = new Set<string>();
      for (const it of prevItems ?? []) {
        const code = (it as { mathsecr_code: string }).mathsecr_code;
        if (code) prevTypeCodes.add(code);
      }

      const prevTypeCodeToUnit = new Map<string, string>();
      if (prevTypeCodes.size > 0) {
        const { data: prevTypes } = await supabaseAdmin
          .from('mathsecr_types')
          .select('code, level1_name')
          .in('code', Array.from(prevTypeCodes));
        for (const t of prevTypes ?? []) {
          const tt = t as { code: string; level1_name: string | null };
          prevTypeCodeToUnit.set(tt.code, tt.level1_name ?? '미분류');
        }
      }

      // 이전 세션 단원별 집계 (level1_name)
      const prevUnitMap = new Map<string, { correct: number; total: number }>();
      for (const it of prevItems ?? []) {
        const tt = it as { mathsecr_code: string; is_correct: boolean };
        const unit = prevTypeCodeToUnit.get(tt.mathsecr_code) ?? '미분류';
        const a = prevUnitMap.get(unit) ?? { correct: 0, total: 0 };
        a.total += 1;
        if (tt.is_correct) a.correct += 1;
        prevUnitMap.set(unit, a);
      }

      // 현재 시험 단원별 집계 (results 에서)
      const currUnitMap = new Map<string, { correct: number; total: number }>();
      for (const r of results) {
        const unit = r.majorUnit || '미분류';
        const a = currUnitMap.get(unit) ?? { correct: 0, total: 0 };
        a.total += 1;
        if (r.earnedScore > 0) a.correct += 1;
        currUnitMap.set(unit, a);
      }

      // 양쪽에 모두 있는 단원만 비교 (교집합)
      const trendRows: UnitTrendRow[] = [];
      for (const [unit, curr] of currUnitMap.entries()) {
        const prev = prevUnitMap.get(unit);
        if (!prev) continue;
        const prevPct =
          prev.total > 0 ? Math.round((prev.correct * 100) / prev.total) : 0;
        const currPct =
          curr.total > 0 ? Math.round((curr.correct * 100) / curr.total) : 0;
        trendRows.push({
          name: unit,
          prevCorrect: prev.correct,
          prevTotal: prev.total,
          prevPct,
          currCorrect: curr.correct,
          currTotal: curr.total,
          currPct,
          delta: currPct - prevPct,
        });
      }

      if (trendRows.length > 0) {
        // 변화 큰 순으로 (절댓값 기준 내림차순)
        trendRows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        unitTrend = {
          prevExamId: prevSess.exam_id,
          prevExamTitle:
            (prevExam as { title: string } | null)?.title ?? '이전 시험',
          prevConductedAt: prevSess.conducted_at,
          units: trendRows,
        };
      }
    }
  }

  return NextResponse.json({
    student: {
      id: studentId,
      name: studentName,
      grade: studentGrade,
      classLabel: studentClass,
    },
    exam: {
      id: examId,
      title: exam.title,
    },
    totalEarned: Math.round(totalEarned * 10) / 10,
    totalPossible: Math.round(totalPossible * 10) / 10,
    scorePct,
    results,
    fineUnitStats,
    cognitiveDomainStats,
    classPercentile,
    classRank,
    classSize,
    classAvg,
    unitTrend,
    reportStyle,
    aiComment: session?.ai_comment_json ?? null,
    teacherComment: session?.teacher_comment_json ?? null,
  });
}

// ============================================================================
// Helpers
// ============================================================================

function extractPoints(answerJson: Record<string, unknown> | null): number | null {
  if (!answerJson) return null;
  const v = answerJson.points;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function mapAnswerTypeToKor(t: string): string {
  if (!t) return '기타';
  const lower = t.toLowerCase();
  if (lower.includes('multiple') || lower.includes('객관')) return '객관식';
  if (
    lower.includes('short') ||
    lower.includes('essay') ||
    lower.includes('multi_step') ||
    lower.includes('주관') ||
    lower.includes('서술')
  )
    return '주관식/서술형';
  return '기타';
}
