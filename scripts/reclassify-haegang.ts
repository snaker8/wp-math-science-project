/**
 * 해강중 26-3-1 시험지 22문항 직접 재분류
 *
 * - 각 problem 의 content_latex 를 classifyProblem 으로 다시 분류
 * - orphan typeCode 는 classify 단계에서 거부됨 (mathsecr_types 검증 실패 시 null)
 * - 결과를 classifications 테이블에 UPSERT + ai_analysis 갱신
 *
 * 실행: npx tsx scripts/reclassify-haegang.ts
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { classifyProblem } from '../src/lib/workflow/classify';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('env 누락'); process.exit(1); }
const sb = createClient(url, key);

const EXAM_ID = '54d5a1e3-ba42-46e5-999d-2dc0ce9de192';
const EXAM_SUBJECT = '중3-1 수학';
const EXAM_GRADE = '중3';

async function main() {

  // 22문항 조회
  const { data: ep } = await sb
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', EXAM_ID)
    .order('sequence_number');
  if (!ep || ep.length === 0) {
    console.log('문제 없음');
    return;
  }

  const problemIds = ep.map((r: any) => r.problem_id);
  const { data: problems } = await sb
    .from('problems')
    .select('id, content_latex, ai_analysis')
    .in('id', problemIds);
  const pMap = new Map((problems || []).map((p: any) => [p.id, p]));

  let success = 0, rejected = 0, errors = 0;

  for (const row of ep as any[]) {
    const seqNum = row.sequence_number;
    const p = pMap.get(row.problem_id) as any;
    const content = (p?.content_latex as string) || '';
    if (!content.trim()) {
      console.log(`#${seqNum}: content 비어있음 → 건너뜀`);
      continue;
    }

    try {
      const result = await classifyProblem({
        content,
        examSubject: EXAM_SUBJECT,
        examGrade: EXAM_GRADE,
        logLabel: `reclassify #${seqNum}`,
      });

      if (!result) {
        console.log(`#${seqNum}: 분류 거부 (orphan/실패)`);
        rejected++;
        continue;
      }

      // classifications 업데이트
      const { data: existing } = await sb
        .from('classifications')
        .select('id')
        .eq('problem_id', row.problem_id)
        .limit(1)
        .maybeSingle();

      const clsData = {
        problem_id: row.problem_id,
        type_code: result.typeCode,
        difficulty: String(result.difficulty),
        cognitive_domain: result.cognitiveDomain,
        ai_confidence: result.confidence,
        is_verified: false,
      };

      if (existing?.id) {
        await sb.from('classifications').update(clsData).eq('id', existing.id);
        // 같은 problem 의 중복 행 정리
        await sb.from('classifications').delete().eq('problem_id', row.problem_id).neq('id', existing.id);
      } else {
        await sb.from('classifications').insert(clsData);
      }

      // ai_analysis 갱신 (provider/model/verified 메타 포함)
      const newAi = {
        ...(p?.ai_analysis || {}),
        classification: {
          typeCode: result.typeCode,
          typeName: result.typeName,
          subject: result.subject,
          chapter: result.chapter,
          section: result.section,
          difficulty: result.difficulty,
          cognitiveDomain: result.cognitiveDomain,
          confidence: result.confidence,
          provider: result.provider,
          model: result.model,
          verified: result.verified,
          classifiedAt: new Date().toISOString(),
        },
        subject: result.subject,
        unit: result.chapter,
        difficulty: result.difficulty,
        cognitiveDomain: result.cognitiveDomain,
        autoReclassified: true,
        reanalyzedAt: new Date().toISOString(),
      };
      await sb.from('problems').update({ ai_analysis: newAi }).eq('id', row.problem_id);

      console.log(`✓ #${seqNum}: ${result.typeCode} (${result.typeName.slice(0, 50)}…) provider=${result.provider}`);
      success++;
    } catch (e) {
      console.error(`✗ #${seqNum}:`, e instanceof Error ? e.message : e);
      errors++;
    }

    // rate limit 완화
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n결과: ${success}건 성공 / ${rejected}건 거부 / ${errors}건 에러 (총 ${ep.length})`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
