// ============================================================================
// 개별 문제 재분석 API
// POST /api/problems/[problemId]/reanalyze
// - 크롭 이미지가 있으면: OCR 재실행 + 선택지 재추출 + 분류
// - 크롭 이미지 없으면: 기존 content_latex 기반 분류만 재실행
// - advanced: true 시 gpt-4o 사용
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { detectGradeFromTitle, detectSubjectFromTitle } from '@/lib/workflow/title-detect';

/** 과학 과목인지 판단 */
function isScienceSubject(subject?: string): boolean {
  if (!subject) return false;
  return /과학|물리|화학|생명|생물|지구|IS[12]|PHY|CHE|BIO|ESC|science/i.test(subject);
}

/** 문제가 속한 시험지의 과목·학년·제목 조회 (classify.ts에 학년/과목 컨텍스트 전달용) */
async function getExamMeta(
  problemId: string
): Promise<{ subject: string | null; grade: string | null; title: string | null }> {
  if (!supabaseAdmin) return { subject: null, grade: null, title: null };
  const { data: ep } = await supabaseAdmin
    .from('exam_problems')
    .select('exam_id')
    .eq('problem_id', problemId)
    .limit(1)
    .single();
  if (!ep?.exam_id) return { subject: null, grade: null, title: null };
  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('subject, grade, title')
    .eq('id', ep.exam_id)
    .single();
  return {
    subject: exam?.subject || null,
    grade: exam?.grade || null,
    title: exam?.title || null,
  };
}

/** examMeta + title/subject 재감지로 effectiveSubject/effectiveGrade 산출 (PR #12 hotfix 패턴) */
async function getEffectiveExamMeta(problemId: string): Promise<{
  isScience: boolean;
  effectiveSubject: string;
  effectiveGrade: string;
}> {
  const examMeta = await getExamMeta(problemId);
  const isScience = isScienceSubject(examMeta.subject || '');
  const detectedGrade =
    detectGradeFromTitle(examMeta.title || '') ||
    detectGradeFromTitle(examMeta.subject || '');
  const effectiveGrade = detectedGrade || examMeta.grade || '';
  const detectedSubject =
    detectSubjectFromTitle(examMeta.title || '') ||
    detectSubjectFromTitle(examMeta.subject || '');
  const effectiveSubject = detectedSubject || examMeta.subject || '';
  return { isScience, effectiveSubject, effectiveGrade };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const { problemId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const isAdvanced = body.advanced === true;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // 1. 기존 문제 데이터 조회
    const { data: problem, error: fetchError } = await supabaseAdmin
      .from('problems')
      .select('id, content_latex, solution_latex, answer_json, ai_analysis, images, source_number, tags')
      .eq('id', problemId)
      .single();

    if (fetchError || !problem) {
      return NextResponse.json(
        { error: 'Problem not found' },
        { status: 404 }
      );
    }

    // 2. 기존 분류 데이터 조회
    const { data: existingClassification } = await supabaseAdmin
      .from('classifications')
      .select('*')
      .eq('problem_id', problemId)
      .single();

    // ★ 시험지 메타 — classify.ts에 학년/과목 컨텍스트 전달용
    const { isScience, effectiveSubject, effectiveGrade } = await getEffectiveExamMeta(problemId);
    console.log(
      `[Reanalyze] problemId=${problemId}, subject="${effectiveSubject}", grade="${effectiveGrade}", isScience=${isScience}`
    );

    // 3. 항상 분류만 재실행 (OCR 재실행 안 함 — content/이미지 보존)
    console.log(`[Reanalyze] 분류만 재실행 (content 유지)`);
    return await reanalyzeClassificationOnly(
      problemId,
      problem,
      existingClassification,
      isAdvanced,
      isScience,
      effectiveSubject,
      effectiveGrade
    );
  } catch (error) {
    console.error('[Reanalyze] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * 문제 데이터에서 크롭 이미지 URL 찾기
 */
function findCropImageUrl(problem: any): string | null {
  // 1. images 배열에서 crop 타입 찾기
  if (problem.images && Array.isArray(problem.images)) {
    const cropImage = problem.images.find((img: any) => img.type === 'crop' && img.url);
    if (cropImage) return cropImage.url;
  }

  // 2. ai_analysis.cropImageUrl 확인
  if (problem.ai_analysis?.cropImageUrl) {
    return problem.ai_analysis.cropImageUrl;
  }

  // 3. Storage에 problem-crops/{id}.png 있는지 확인
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (supabaseUrl) {
    // 직접 URL 구성 (존재 여부는 다운로드 시 확인)
    return `${supabaseUrl}/storage/v1/object/public/source-files/problem-crops/${problem.id}.png`;
  }

  return null;
}

/**
 * 크롭 이미지로 OCR 재실행 + 선택지 재추출 + 분류
 */
async function reanalyzeWithOCR(
  problemId: string,
  problem: any,
  existingClassification: any,
  cropImageUrl: string,
  isAdvanced: boolean,
  request: NextRequest
) {
  try {
    // 1. 크롭 이미지 다운로드 → base64 변환
    console.log(`[Reanalyze] 크롭 이미지 다운로드 중: ${cropImageUrl}`);
    const imgResponse = await fetch(cropImageUrl);

    if (!imgResponse.ok) {
      console.warn(`[Reanalyze] 크롭 이미지 다운로드 실패 (${imgResponse.status}) — 분류만 실행`);
      return await reanalyzeClassificationOnly(
        problemId, problem, existingClassification, isAdvanced
      );
    }

    const imgBuffer = await imgResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imgBuffer).toString('base64');

    // 2. reanalyze-crop API 호출 (내부 HTTP 요청)
    const baseUrl = getBaseUrl(request);
    console.log(`[Reanalyze] reanalyze-crop API 호출 중...`);

    const reanalyzeRes = await fetch(`${baseUrl}/api/workflow/reanalyze-crop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        fullAnalysis: true,
        problemNumber: problem.source_number,
        problemId,
        analyzeGraph: true,
      }),
    });

    if (!reanalyzeRes.ok) {
      const errData = await reanalyzeRes.json().catch(() => ({}));
      console.warn(`[Reanalyze] reanalyze-crop 실패:`, errData);
      return await reanalyzeClassificationOnly(
        problemId, problem, existingClassification, isAdvanced
      );
    }

    const ocrData = await reanalyzeRes.json();
    console.log(`[Reanalyze] OCR 완료: ${ocrData.ocrText?.length || 0}자, 선택지 ${ocrData.choices?.length || 0}개`);

    // 3. DB 업데이트 — OCR 텍스트가 있을 때만 갱신 (빈 문자열이면 기존 유지)
    const updateData: Record<string, unknown> = {};
    if (ocrData.ocrText && ocrData.ocrText.trim().length > 0) {
      updateData.content_latex = ocrData.ocrText;
    }

    // 선택지 업데이트
    if (ocrData.choices && ocrData.choices.length > 0) {
      updateData.answer_json = {
        ...(problem.answer_json || {}),
        choices: ocrData.choices,
      };
    }

    // ai_analysis 업데이트
    const aiAnalysis: Record<string, unknown> = {
      ...(problem.ai_analysis || {}),
      ...(ocrData.classification || {}),
      reanalyzedAt: new Date().toISOString(),
      reanalyzedWithOCR: true,
    };

    if (ocrData.cropUrl) {
      aiAnalysis.cropImageUrl = ocrData.cropUrl;
    }
    if (ocrData.graphData && ocrData.graphData.type !== 'none') {
      aiAnalysis.hasFigure = true;
      aiAnalysis.graphAnalysis = ocrData.graphData;
    }

    updateData.ai_analysis = aiAnalysis;

    // 이미지 업데이트
    if (ocrData.cropUrl) {
      const existingImages = (problem.images || []).filter(
        (img: { type: string }) => img.type !== 'crop'
      );
      updateData.images = [
        { url: ocrData.cropUrl, type: 'crop', label: '재분석 크롭' },
        ...existingImages,
      ];
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('problems')
      .update(updateData)
      .eq('id', problemId);

    if (updateError) {
      console.error('[Reanalyze] Problem update error:', updateError);
    }

    // 4. Classification 테이블 업데이트
    if (ocrData.classification?.classification) {
      const cls = ocrData.classification.classification;
      const classData: Record<string, unknown> = {
        problem_id: problemId,
        type_code: cls.typeCode || existingClassification?.type_code || '',
        difficulty: String(cls.difficulty || 3),
        cognitive_domain: cls.cognitiveDomain || 'UNDERSTANDING',
        ai_confidence: cls.confidence || 0.5,
        is_verified: false,
      };

      if (existingClassification) {
        await supabaseAdmin
          .from('classifications')
          .update(classData)
          .eq('id', existingClassification.id);
      } else {
        await supabaseAdmin
          .from('classifications')
          .insert(classData);
      }
    }

    // 5. 업데이트된 데이터 반환
    const { data: updatedProblem } = await supabaseAdmin
      .from('problems')
      .select('*')
      .eq('id', problemId)
      .single();

    const { data: updatedClassification } = await supabaseAdmin
      .from('classifications')
      .select('*')
      .eq('problem_id', problemId)
      .single();

    return NextResponse.json({
      problem: updatedProblem,
      classification: updatedClassification,
      ocrRedone: true,
      ocrText: ocrData.ocrText,
      choices: ocrData.choices,
      message: 'OCR 재실행 + 재분류 완료',
    });
  } catch (err) {
    console.error('[Reanalyze] OCR 재실행 오류:', err);
    // OCR 실패 시 분류만 시도 — examMeta 다시 fetch해서 학년/과목 컨텍스트 보존
    const { isScience, effectiveSubject, effectiveGrade } = await getEffectiveExamMeta(problemId);
    return await reanalyzeClassificationOnly(
      problemId,
      problem,
      existingClassification,
      isAdvanced,
      isScience,
      effectiveSubject,
      effectiveGrade
    );
  }
}

/** mathsecr_types에서 typeCode로 typeName/chapter/section 조회 */
async function lookupMathsecrName(typeCode: string): Promise<{
  typeName: string;
  chapter: string;
  section: string;
} | null> {
  if (!supabaseAdmin || !typeCode || !typeCode.startsWith('MS')) return null;
  const { data } = await supabaseAdmin
    .from('mathsecr_types')
    .select('full_path, level1_name, level2_name')
    .eq('code', typeCode)
    .maybeSingle();
  if (!data) return null;
  return {
    typeName: data.full_path || '',
    chapter: data.level1_name || '',
    section: data.level2_name || '',
  };
}

/**
 * 기존 content_latex 기반 분류만 재실행 (크롭 이미지 없을 때)
 */
async function reanalyzeClassificationOnly(
  problemId: string,
  problem: any,
  existingClassification: any,
  isAdvanced: boolean,
  isScience: boolean = false,
  examSubject: string | null = null,
  examGrade: string | null = null
) {
  const contentText = problem.content_latex || '';

  // ★ 수학(비과학) — classify.ts(Sonnet 4.6 2단계) 직행. 휴리스틱(log 보조값 등) 자동 적용.
  //   기존엔 GPT-4o-mini가 옛 prompt로 호출돼 16번(상용로그) → 등비수열 오분류.
  //   Sonnet 통일로 자산화(cloud-flow) 경로와 일관성 + Phase C-1a 휴리스틱 효과.
  if (!isScience && contentText.trim()) {
    try {
      const { classifyProblem } = await import('@/lib/workflow/classify');
      const claudeResult = await classifyProblem({
        content: contentText,
        examSubject: examSubject || '',
        examGrade: examGrade || '',
        logLabel: `reanalyze:${problemId.slice(0, 8)}`,
      });
      if (claudeResult && claudeResult.typeCode) {
        const nameLookup = await lookupMathsecrName(claudeResult.typeCode);
        const typeName = nameLookup?.typeName || claudeResult.typeName || '';
        const chapter = nameLookup?.chapter || claudeResult.chapter || '';
        const section = nameLookup?.section || claudeResult.section || '';
        const validCognitive = new Set([
          'CALCULATION',
          'UNDERSTANDING',
          'INFERENCE',
          'PROBLEM_SOLVING',
        ]);
        const cogn = validCognitive.has(claudeResult.cognitiveDomain)
          ? claudeResult.cognitiveDomain
          : 'CALCULATION';
        const analysis = {
          classification: {
            typeCode: claudeResult.typeCode,
            typeName,
            subject: claudeResult.subject || examSubject || '',
            chapter,
            section,
            difficulty: Math.max(1, Math.min(10, claudeResult.difficulty)),
            cognitiveDomain: cogn,
            confidence: claudeResult.confidence,
          },
          correctedContent: null,
        };
        return await persistReanalysis(
          problemId,
          problem,
          existingClassification,
          analysis,
          claudeResult.model || 'claude-sonnet-4-6',
          false
        );
      }
      console.warn(`[Reanalyze] classify.ts 결과 없음 → GPT 폴백`);
    } catch (e) {
      console.warn(`[Reanalyze] classify.ts 실패 → GPT 폴백:`, e);
    }
  }

  // 과학 또는 Sonnet 실패 → GPT 폴백 (기존 흐름)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({
      problem,
      classification: existingClassification,
      message: 'OpenAI API key not configured - returning existing data',
    });
  }

  const model = isAdvanced ? 'gpt-4o' : (process.env.OPENAI_MODEL || 'gpt-4o-mini');

  // ★ 과학/수학에 따라 프롬프트 분기
  const systemPrompt = isScience
    ? `당신은 한국 고등학교 과학 교육과정(통합과학, 물리학, 화학, 생명과학, 지구과학) 전문가입니다.
주어진 과학 문제의 **분류(과목/단원/난이도)와 풀이**를 분석하세요.

■ 과목 체계 (2022 개정): IS1=통합과학1, IS2=통합과학2, PHY=물리학, CHM=화학, BIO=생명과학, EAR=지구과학, PHY_ME=역학과에너지, PHY_EQ=전자기와양자, CHM_ME=물질과에너지, CHM_RW=화학반응의세계, BIO_CM=세포와물질대사, BIO_GN=생명의유전, EAR_SS=지구시스템과학, EAR_PS=행성우주과학
■ 난이도 6단계 (사고 과정 복잡도 기준):
  <1>개념: 용어/정의 알면 바로. <2>이해: 원리 1개 적용/단순 계산 1회.
  <3>해석: 자료 해석 핵심(자료 안 읽으면 못 풀림). <4>응용: 복합 조건/합답형ㄱㄴㄷ/다단원 연계.
  <5>최고난도: 비정형 추론/모델링/숨은 조건. <6>특이: 범위밖/오류(중복태그).
■ 핵심 규칙: 합답형(ㄱㄴㄷ)→원칙적 <4>응용. 추론 고난도면 <5>. 자료해석+개념2개연결→<4>.
  계산 길어도 공식대입 반복이면 <2>or<3>. 자료있어도 읽을 필요없이 답 나오면 <1>.
■ 시험지 과목: ${examSubject || '미지정'}

다음 JSON 형식으로 응답하세요:
{
  "classification": {
    "typeCode": "과목코드-단원-번호 (예: IS1-02-001)",
    "typeName": "유형 이름 (한국어)",
    "subject": "과목명 (통합과학1, 물리학, 화학, 생명과학, 지구과학, 역학과 에너지 등)",
    "scienceSubject": "과목코드 (IS1, PHY, CHM, BIO, EAR, PHY_ME, PHY_EQ 등)",
    "chapter": "대단원명",
    "section": "소단원명",
    "difficulty": 3,
    "difficultyLabel": "해석",
    "cognitiveDomain": "UNDERSTANDING|CALCULATION|INFERENCE|PROBLEM_SOLVING",
    "confidence": 0.85
  },
  "solution": {
    "approach": "풀이 전략 요약",
    "steps": [{"stepNumber": 1, "description": "풀이 설명", "explanation": "근거"}],
    "finalAnswer": "최종 정답 ★필수★"
  },
  "correctedContent": null
}`
    : (() => {
      let typeTable = '';
      try {
        const { resolveSubjectCode, buildTypeTable } = require('@/lib/workflow/mathsecr-prompt');
        const subjectCode = resolveSubjectCode(examSubject);
        if (subjectCode) typeTable = buildTypeTable(subjectCode);
      } catch {}

      return `당신은 한국 수학 교육 전문가입니다. 수학비서 분류 체계로 문제를 분류하세요.
풀이나 해설은 생성하지 마세요.

${typeTable ? `아래 유형 테이블에서 가장 적합한 typeCode를 선택하세요:\n${typeTable}\n` : ''}

다음 JSON 형식으로 응답하세요:
{
  "classification": {
    "typeCode": "MS07-01-03-02-05 (수학비서 유형 코드. 가능하면 5-세그먼트 세부유형 레벨)",
    "typeName": "대단원 > 중단원 > 소단원 > 세부유형",
    "subject": "과목명 (공통수학1, 대수, 미적분1 등)",
    "chapter": "대단원명",
    "section": "중단원명",
    "difficulty": 1-10,
    "cognitiveDomain": "CALCULATION|UNDERSTANDING|INFERENCE|PROBLEM_SOLVING",
    "confidence": 0.0-1.0
  },
  "correctedContent": "수정이 필요하면 수정된 LaTeX 내용, 아니면 null"
}`;
    })();

  const subjectLabel = isScience ? '과학' : '수학';
  const userPrompt = `다음 ${subjectLabel} 문제를 분석해주세요:\n\n${contentText}`;

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error('[Reanalyze] OpenAI error:', errText);
    return NextResponse.json({
      problem,
      classification: existingClassification,
      message: 'OpenAI API error - returning existing data',
    });
  }

  const openaiData = await openaiRes.json();
  const rawContent = openaiData.choices?.[0]?.message?.content || '{}';

  let analysis: any;
  try {
    analysis = JSON.parse(rawContent);
  } catch {
    console.error('[Reanalyze] JSON parse error:', rawContent);
    return NextResponse.json({
      problem,
      classification: existingClassification,
      message: 'Analysis parse error - returning existing data',
    });
  }

  return await persistReanalysis(
    problemId,
    problem,
    existingClassification,
    analysis,
    model,
    false
  );
}

/**
 * 분류 결과 DB 저장 + 최신 데이터 반환 — Sonnet/GPT 양쪽 진입점에서 공용.
 */
async function persistReanalysis(
  problemId: string,
  problem: any,
  existingClassification: any,
  analysis: any,
  model: string,
  ocrRedone: boolean
) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  // problems.ai_analysis — 분류만 갱신
  const updateData: any = {
    ai_analysis: {
      ...problem.ai_analysis,
      classification: analysis.classification,
      reanalyzedAt: new Date().toISOString(),
      model,
    },
  };
  if (analysis.correctedContent) {
    updateData.content_latex = analysis.correctedContent;
  }

  const { error: updateError } = await supabaseAdmin
    .from('problems')
    .update(updateData)
    .eq('id', problemId);
  if (updateError) {
    console.error('[Reanalyze] Problem update error:', updateError);
  }

  // classifications 갱신
  if (analysis.classification) {
    const classData: any = {
      problem_id: problemId,
      type_code: analysis.classification.typeCode || existingClassification?.type_code || '',
      difficulty: String(analysis.classification.difficulty || 3),
      cognitive_domain: analysis.classification.cognitiveDomain || 'UNDERSTANDING',
      ai_confidence: analysis.classification.confidence || 0.5,
      is_verified: false,
    };
    if (existingClassification) {
      await supabaseAdmin
        .from('classifications')
        .update(classData)
        .eq('id', existingClassification.id);
    } else {
      await supabaseAdmin
        .from('classifications')
        .insert(classData);
    }
  }

  const { data: updatedProblem } = await supabaseAdmin
    .from('problems')
    .select('*')
    .eq('id', problemId)
    .single();
  const { data: updatedClassification } = await supabaseAdmin
    .from('classifications')
    .select('*')
    .eq('problem_id', problemId)
    .single();

  return NextResponse.json({
    problem: updatedProblem,
    classification: updatedClassification,
    analysis,
    model,
    ocrRedone,
    message: ocrRedone
      ? 'OCR 재실행 + 재분류 완료'
      : '분류 재실행 완료 (크롭 이미지 없어 OCR 미실행)',
  });
}

/**
 * 요청에서 기본 URL 추출
 */
function getBaseUrl(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
