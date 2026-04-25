/**
 * 전체 orphan typeCode 일괄 재분류
 *
 * 처리 정책:
 *   - MS… (잘못된 mathsecr 형식) → 재분류
 *   - MA-HS… / MA-ELW… (레거시 수학 코드) → 재분류
 *   - CH-… / PH-… / BI-… 등 과학 코드 → 스킵 (수학 분류기로 매핑 불가)
 *   - subject 추론: ai_analysis.subject → exam.subject → typeCode prefix 추정 순
 *
 * 실행: npx tsx scripts/reclassify-all-orphans.ts [--dry-run] [--limit N]
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

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  if (i >= 0 && args[i + 1]) return parseInt(args[i + 1], 10);
  return Infinity;
})();

// --------------------------------------------------------------------
// 코드 prefix → subject 추정
// --------------------------------------------------------------------
function inferSubjectFromCode(code: string): { subject: string; grade: string } | null {
  if (!code) return null;
  const c = code.toUpperCase();

  // 과학/외 과목 — 스킵
  if (/^(CH|PH|BI|EA|GE|SC|TE|EN|KO)-/.test(c)) return null;

  // mathsecr MS코드
  const msMatch = c.match(/^MS(\d{2})-/);
  if (msMatch) {
    const sub = msMatch[1];
    const map: Record<string, { subject: string; grade: string }> = {
      '01': { subject: '중1-1 수학', grade: '중1' },
      '02': { subject: '중1-2 수학', grade: '중1' },
      '03': { subject: '중2-1 수학', grade: '중2' },
      '04': { subject: '중2-2 수학', grade: '중2' },
      '05': { subject: '중3-1 수학', grade: '중3' },
      '06': { subject: '중3-2 수학', grade: '중3' },
      '07': { subject: '공통수학1', grade: '고1' },
      '08': { subject: '공통수학2', grade: '고1' },
      '09': { subject: '대수',     grade: '고2' },
      '10': { subject: '미적분1',   grade: '고2' },
      '11': { subject: '확률과통계', grade: '고2' },
      '12': { subject: '미적분',   grade: '고3' },
      '13': { subject: '기하',     grade: '고3' },
    };
    return map[sub] || null;
  }

  // 레거시 MA-HS0/HS1/HS2/ELW
  if (/^MA-HS0-/.test(c)) return { subject: '공통수학1', grade: '고1' };
  if (/^MA-HS1-/.test(c)) return { subject: '수학I', grade: '고2' };
  if (/^MA-HS2-/.test(c)) return { subject: '수학II', grade: '고2' };
  if (/^MA-ELW-/.test(c)) return { subject: '확률과통계', grade: '고3' };
  if (/^MA-MS([1-3])-/.test(c)) {
    const m = c.match(/^MA-MS(\d)-/)!;
    const g = m[1];
    return { subject: `중${g}-1 수학`, grade: `중${g}` };
  }

  return null;
}

async function loadOrphanProblems() {
  // 모든 classifications 페이지네이션 로드
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await sb
      .from('classifications')
      .select('id, problem_id, type_code, expanded_type_code')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  // 고유 코드 → mathsecr_types 매칭 확인
  const codes = new Set<string>();
  for (const c of all) {
    if (c.type_code) codes.add(c.type_code);
    if (c.expanded_type_code) codes.add(c.expanded_type_code);
  }
  const codeArr = Array.from(codes);
  const validCodes = new Set<string>();
  for (let i = 0; i < codeArr.length; i += 500) {
    const slice = codeArr.slice(i, i + 500);
    const { data } = await sb.from('mathsecr_types').select('code').in('code', slice);
    for (const r of (data || []) as any[]) validCodes.add(r.code);
  }

  // orphan classifications 만 필터
  const orphan = all.filter((c: any) => {
    const tc = c.type_code || c.expanded_type_code;
    if (!tc) return false;
    if (validCodes.has(tc)) return false;
    if (/^MS\d{2}$/.test(tc)) return false; // 과목 자체 코드는 정상
    return true;
  });
  return orphan;
}

async function main() {
  console.log(`모드: ${DRY ? 'DRY-RUN (저장 안 함)' : '실행 (DB 갱신)'} · LIMIT=${LIMIT === Infinity ? '∞' : LIMIT}`);

  const orphans = await loadOrphanProblems();
  console.log(`orphan classifications: ${orphans.length}건\n`);
  if (orphans.length === 0) return;

  // 분류별 통계
  const skipScience: any[] = [];
  const targets: any[] = [];
  for (const c of orphans) {
    const tc = c.type_code || c.expanded_type_code;
    const inferred = inferSubjectFromCode(tc);
    if (!inferred) {
      skipScience.push(c);
    } else {
      targets.push({ ...c, _inferred: inferred });
    }
  }
  console.log(`재분류 대상: ${targets.length}건`);
  console.log(`스킵 (과학/외): ${skipScience.length}건\n`);

  if (DRY) {
    console.log('DRY-RUN — prefix 분포만 표시:');
    const prefixCnt = new Map<string, number>();
    for (const t of targets) {
      const tc = t.type_code || t.expanded_type_code;
      const pfx = tc.substring(0, Math.min(7, tc.indexOf('-') + 4 || 7));
      prefixCnt.set(pfx, (prefixCnt.get(pfx) || 0) + 1);
    }
    for (const [k, v] of prefixCnt) console.log(`  ${k}: ${v}`);
    return;
  }

  // 실제 처리
  let success = 0, rejected = 0, errors = 0, processed = 0;
  for (const t of targets) {
    if (processed >= LIMIT) break;
    processed++;

    // problem 조회
    const { data: p } = await sb
      .from('problems')
      .select('id, content_latex, ai_analysis')
      .eq('id', t.problem_id)
      .maybeSingle();
    if (!p || !p.content_latex || !p.content_latex.trim()) {
      console.log(`[${processed}/${targets.length}] ${t.problem_id.slice(0,8)}…: content 비어있음 → 스킵`);
      continue;
    }

    // subject 추론 (ai_analysis 우선, 없으면 코드 prefix)
    const ai = (p.ai_analysis as Record<string, any>) || {};
    const examSubject = (ai.subject as string) || t._inferred.subject;
    const examGrade = (ai.grade as string) || t._inferred.grade;

    try {
      const result = await classifyProblem({
        content: p.content_latex,
        examSubject,
        examGrade,
        logLabel: `bulk #${processed}`,
      });

      if (!result) {
        rejected++;
        console.log(`[${processed}/${targets.length}] ✗ ${t.problem_id.slice(0,8)}… 거부 (orphan/실패)`);
        continue;
      }

      // 업데이트
      await sb.from('classifications').update({
        type_code: result.typeCode,
        difficulty: String(result.difficulty),
        cognitive_domain: result.cognitiveDomain,
        ai_confidence: result.confidence,
        is_verified: false,
      }).eq('id', t.id);

      // 같은 problem 의 중복 행 삭제
      await sb.from('classifications').delete().eq('problem_id', t.problem_id).neq('id', t.id);

      // ai_analysis 갱신
      const newAi = {
        ...ai,
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
        autoReclassified: true,
        reanalyzedAt: new Date().toISOString(),
      };
      await sb.from('problems').update({ ai_analysis: newAi }).eq('id', t.problem_id);

      success++;
      const oldCode = t.type_code || t.expanded_type_code;
      if (processed % 10 === 0 || processed <= 5) {
        console.log(`[${processed}/${targets.length}] ✓ ${oldCode} → ${result.typeCode}`);
      }
    } catch (e) {
      errors++;
      console.error(`[${processed}/${targets.length}] ✗ ${t.problem_id.slice(0,8)}… 에러:`, e instanceof Error ? e.message : e);
    }
    // rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n결과: ${success}건 성공 / ${rejected}건 거부 / ${errors}건 에러 (총 ${processed} 처리)`);
  console.log(`\n과학/외 스킵 ${skipScience.length}건은 별도 처리 필요`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
