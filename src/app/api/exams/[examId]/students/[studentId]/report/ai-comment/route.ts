// ============================================================================
// POST /api/exams/[examId]/students/[studentId]/report/ai-comment
//
// 학생 1인 리포트의 Claude Sonnet 맞춤 코멘트 생성 (강한단원/보완단원/학습가이드).
// 결과는 diagnostics.sessions.ai_comment_json 에 캐싱.
//
// body: { force?: boolean }  ← force=true 면 캐시 무시하고 재생성
// 응답: { ai_comment: { strong, weak, method, generatedAt, model } }
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface AiCommentJson {
  strong: string;
  weak: string;
  method: string;
  generatedAt: string;
  model: string;
}

interface UnitData {
  name: string;
  total: number;
  correct: number;
  pct: number;
}
interface FineUnit {
  name: string;
  fullPath: string;
  total: number;
  correct: number;
  pct: number;
}
interface CognitiveStat {
  code: string;
  total: number;
  correct: number;
  pct: number;
}

const COG_KOR: Record<string, string> = {
  CALCULATION: '계산',
  UNDERSTANDING: '이해',
  INFERENCE: '추론',
  PROBLEM_SOLVING: '문제해결',
};

export async function POST(
  req: NextRequest,
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY 환경변수 미설정' },
      { status: 500 }
    );
  }

  const { force } = (await req.json().catch(() => ({}))) as { force?: boolean };

  // 1. 시험 접근 검증
  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('id, institute_id, title')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return NextResponse.json({ error: 'exam not found' }, { status: 404 });
  if (exam.institute_id !== null) {
    try {
      assertInstituteAccess(scope, exam.institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // 2. 학생 세션 찾기
  const { data: sessions } = await supabaseAdmin
    .schema('diagnostics')
    .from('sessions')
    .select('id, ai_comment_json')
    .eq('exam_id', examId)
    .eq('student_id', studentId)
    .eq('session_type', 'EX')
    .order('conducted_at', { ascending: false })
    .limit(1);

  const session = sessions?.[0] as
    | { id: string; ai_comment_json: AiCommentJson | null }
    | undefined;
  if (!session) {
    return NextResponse.json(
      { error: '이 학생의 채점 기록이 없습니다.' },
      { status: 404 }
    );
  }

  // 3. 캐시 hit + force=false 면 그대로 반환
  if (!force && session.ai_comment_json) {
    return NextResponse.json({ ai_comment: session.ai_comment_json, cached: true });
  }

  // 4. 리포트 데이터 가져오기 (단원/난이도/유형/세부유형/인지영역)
  const reportRes = await fetch(
    `${req.nextUrl.origin}/api/exams/${examId}/students/${studentId}/report`,
    { headers: { cookie: req.headers.get('cookie') ?? '' }, cache: 'no-store' }
  );
  if (!reportRes.ok) {
    return NextResponse.json(
      { error: '리포트 데이터 조회 실패' },
      { status: 500 }
    );
  }
  const report = await reportRes.json();

  // 5. 단원별 정답률 계산
  const unitMap: Record<string, { total: number; correct: number }> = {};
  for (const r of report.results || []) {
    const m = r.majorUnit || '미분류';
    if (!unitMap[m]) unitMap[m] = { total: 0, correct: 0 };
    unitMap[m].total++;
    if (r.earnedScore > 0) unitMap[m].correct++;
  }
  const unitData: UnitData[] = Object.entries(unitMap).map(([name, v]) => ({
    name,
    total: v.total,
    correct: v.correct,
    pct: v.total > 0 ? Math.round((v.correct * 100) / v.total) : 0,
  }));

  // 6. Sonnet 프롬프트 조립
  const prompt = buildPrompt({
    studentName: report.student?.name ?? '학생',
    examTitle: report.exam?.title ?? '',
    scorePct: report.scorePct ?? 0,
    totalEarned: report.totalEarned ?? 0,
    totalPossible: report.totalPossible ?? 0,
    classRank: report.classRank ?? null,
    classSize: report.classSize ?? 0,
    classAvg: report.classAvg ?? null,
    unitData,
    fineUnitStats: (report.fineUnitStats ?? []) as FineUnit[],
    cognitiveDomainStats: (report.cognitiveDomainStats ?? []) as CognitiveStat[],
  });

  // 7. Claude Sonnet 호출
  let aiResult: { strong: string; weak: string; method: string };
  try {
    aiResult = await callSonnet(apiKey, prompt);
  } catch (e) {
    return NextResponse.json(
      { error: 'AI 호출 실패', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }

  const aiComment: AiCommentJson = {
    strong: aiResult.strong,
    weak: aiResult.weak,
    method: aiResult.method,
    generatedAt: new Date().toISOString(),
    model: ANTHROPIC_MODEL,
  };

  // 8. 캐시 저장
  await supabaseAdmin
    .schema('diagnostics')
    .from('sessions')
    .update({ ai_comment_json: aiComment })
    .eq('id', session.id);

  return NextResponse.json({ ai_comment: aiComment, cached: false });
}

// ============================================================================
// PUT /api/exams/[examId]/students/[studentId]/report/ai-comment
//   teacher_comment 저장 (재사용 경로)
//   body: { teacherComment: string }  (빈 문자열이면 삭제)
// ============================================================================
export async function PUT(
  req: NextRequest,
  { params }: { params: { examId: string; studentId: string } }
) {
  const { examId, studentId } = params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin 미설정' }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { teacherComment?: string };
  const text = (body.teacherComment ?? '').trim();

  // 시험 접근 검증
  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('id, institute_id')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return NextResponse.json({ error: 'exam not found' }, { status: 404 });
  if (exam.institute_id !== null) {
    try {
      assertInstituteAccess(scope, exam.institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data: sessions } = await supabaseAdmin
    .schema('diagnostics')
    .from('sessions')
    .select('id')
    .eq('exam_id', examId)
    .eq('student_id', studentId)
    .eq('session_type', 'EX')
    .order('conducted_at', { ascending: false })
    .limit(1);

  const session = sessions?.[0] as { id: string } | undefined;
  if (!session) {
    return NextResponse.json(
      { error: '이 학생의 채점 기록이 없습니다.' },
      { status: 404 }
    );
  }

  const teacherComment =
    text === ''
      ? null
      : {
          text,
          updatedBy: user.id,
          updatedAt: new Date().toISOString(),
        };

  const { error } = await supabaseAdmin
    .schema('diagnostics')
    .from('sessions')
    .update({ teacher_comment_json: teacherComment })
    .eq('id', session.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, teacher_comment: teacherComment });
}

// ============================================================================
// Helpers
// ============================================================================

function buildPrompt(ctx: {
  studentName: string;
  examTitle: string;
  scorePct: number;
  totalEarned: number;
  totalPossible: number;
  classRank: number | null;
  classSize: number;
  classAvg: number | null;
  unitData: UnitData[];
  fineUnitStats: FineUnit[];
  cognitiveDomainStats: CognitiveStat[];
}): string {
  const unitLines = ctx.unitData
    .map((u) => `  - ${u.name}: ${u.correct}/${u.total} (${u.pct}%)`)
    .join('\n');

  const weakFine = ctx.fineUnitStats
    .filter((f) => f.pct < 80)
    .slice(0, 6)
    .map((f) => `  - ${f.name} [${f.fullPath}]: ${f.correct}/${f.total} (${f.pct}%)`)
    .join('\n');

  const cogLines = ctx.cognitiveDomainStats
    .map(
      (c) =>
        `  - ${COG_KOR[c.code] ?? c.code}: ${c.correct}/${c.total} (${c.pct}%)`
    )
    .join('\n');

  const classLine =
    ctx.classRank && ctx.classSize >= 2
      ? `반 ${ctx.classRank}등 / ${ctx.classSize}명 · 반 평균 ${ctx.classAvg ?? '-'}%`
      : '반 비교 데이터 없음';

  return `다음은 한 학생의 수학 시험 결과 데이터입니다. 학부모와 학생에게 전달할 맞춤형 학습 코멘트를 작성하세요.

[학생/시험]
- 학생: ${ctx.studentName}
- 시험: ${ctx.examTitle}
- 총점: ${ctx.totalEarned} / ${ctx.totalPossible} (${ctx.scorePct}%)
- ${classLine}

[단원별 정답률]
${unitLines || '  - 데이터 없음'}

[약점 세부유형 (정답률 80% 미만)]
${weakFine || '  - 전반적으로 양호 (80%+)'}

[인지영역별 정답률 (계산/이해/추론/문제해결)]
${cogLines || '  - 데이터 없음'}

[작성 요구사항]
1. 강점 단원/유형을 짚어 학생을 격려
2. 보완할 단원/유형을 구체적으로 명시 (단원명 + 학습 방향)
3. 인지영역별 약점이 있으면 어떤 훈련이 필요한지 (계산 약하면 연산 정확도, 이해 약하면 개념 정리, 추론 약하면 논리 단계, 문제해결 약하면 조건 해석 등)
4. KICE 평가원 기준이 아닌, 이 학생 결과에 정확히 맞춤
5. 학부모가 읽기 쉽게 따뜻하고 전문적인 어조
6. method 항목에 학습 방법 3~5문장으로 구체 작성

다음 JSON 형식 그대로 응답 (다른 텍스트 X, 코드 블록 X):
{
  "strong": "강점 단원/유형 한 줄 요약",
  "weak": "보완 단원/유형 한 줄 요약",
  "method": "학습 가이드 본문 (줄바꿈 가능, 3~5문장)"
}`;
}

async function callSonnet(
  apiKey: string,
  prompt: string
): Promise<{ strong: string; weak: string; method: string }> {
  const resp = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (data.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('');

  // JSON 블록 추출 (Sonnet 이 가끔 코드펜스 박을 수 있음)
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      strong: String(parsed.strong ?? '-'),
      weak: String(parsed.weak ?? '-'),
      method: String(parsed.method ?? ''),
    };
  } catch {
    // JSON 파싱 실패 → method 에 전체 텍스트 박고 strong/weak 비움
    return { strong: '-', weak: '-', method: cleaned };
  }
}
