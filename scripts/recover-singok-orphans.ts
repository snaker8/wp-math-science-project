/**
 * 26 신곡중 3-1 (orphan 22문항) 복구 스크립트
 *
 * 1. source_name = "26-3-1-M-신곡중 수학.pdf" 인 problems 22건 조회
 * 2. content_latex / classifications / images 상태 점검
 * 3. 새 exam row 생성 (이미 있으면 사용)
 * 4. exam_problems 에 sequence_number 부여하며 연결
 *
 * 옵션:
 *   --dry-run  : DB 변경 없이 검증만
 *   --execute  : 실제 복구
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('env 누락'); process.exit(1); }
const sb = createClient(url, key);

const args = process.argv.slice(2);
const DRY = !args.includes('--execute');

const SOURCE_NAME = '26-3-1-M-신곡중 수학.pdf';
const NEW_EXAM_TITLE = '26 신곡중 3-1 중간';
const NEW_EXAM_SUBJECT = '중3-1 수학';
const NEW_EXAM_GRADE = '중3';

async function main() {
  console.log(`모드: ${DRY ? 'DRY-RUN' : '실제 실행'}\n`);

  // 1) 22 orphan 문제 조회
  const { data: problems, error } = await sb
    .from('problems')
    .select('id, source_number, source_name, content_latex, ai_analysis, images, status, created_at')
    .eq('source_name', SOURCE_NAME)
    .order('source_number');
  if (error) { console.error(error.message); return; }
  console.log(`source_name="${SOURCE_NAME}" 매칭 problems: ${(problems || []).length}건`);

  if (!problems || problems.length === 0) {
    console.log('대상 문제 없음 — 종료');
    return;
  }

  // 2) exam_problems 미연결 (orphan) 만 필터
  const probIds = problems.map((p: any) => p.id);
  const { data: linked } = await sb.from('exam_problems').select('problem_id').in('problem_id', probIds);
  const linkedSet = new Set((linked || []).map((r: any) => r.problem_id));
  const orphans = (problems as any[]).filter(p => !linkedSet.has(p.id));
  console.log(`그중 orphan (exam 미연결): ${orphans.length}건\n`);

  if (orphans.length === 0) {
    console.log('이미 모두 연결돼있음 — 종료');
    return;
  }

  // 3) 상태 점검
  console.log('seq | content len | classification              | images | status');
  console.log('────┼─────────────┼─────────────────────────────┼────────┼────────────');
  let hasContent = 0, hasCls = 0;
  for (const p of orphans) {
    const cl = ((p.ai_analysis || {}).classification || {}) as Record<string, any>;
    const tc = (cl.typeCode as string) || '';
    const cnt = (p.content_latex || '').length;
    const imgCnt = Array.isArray(p.images) ? p.images.length : 0;
    if (cnt > 0) hasContent++;
    if (tc) hasCls++;
    console.log(
      `${String(p.source_number).padStart(3)} | ${String(cnt).padStart(11)} | ${tc.padEnd(27)} | ${String(imgCnt).padStart(6)} | ${p.status}`,
    );
  }
  console.log(`\n요약: content 있음 ${hasContent}/${orphans.length}, classification 있음 ${hasCls}/${orphans.length}`);

  // 4) 이미 같은 제목 exam 있는지 확인
  const { data: existing } = await sb
    .from('exams')
    .select('id, title, status')
    .ilike('title', NEW_EXAM_TITLE)
    .maybeSingle();
  if (existing) {
    console.log(`\n⚠️  이미 같은 제목 exam 존재: ${existing.id} (status=${existing.status})`);
    console.log('   복구 시 해당 exam에 추가 연결됩니다 (중복 가능)');
  }

  if (DRY) {
    console.log('\n[DRY-RUN] 종료. 실제 복구하려면 --execute 추가');
    return;
  }

  // 5) 실제 복구
  let examId: string;
  if (existing) {
    examId = existing.id;
  } else {
    // 신규 exam INSERT
    // institute_id 는 다른 26 신곡중 시험지에서 가져옴
    const { data: refExam } = await sb
      .from('exams')
      .select('institute_id, created_by, book_group_id')
      .ilike('title', '%신곡중%')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: newExam, error: ne } = await sb
      .from('exams')
      .insert({
        title: NEW_EXAM_TITLE,
        subject: NEW_EXAM_SUBJECT,
        grade: NEW_EXAM_GRADE,
        status: 'DRAFT',
        exam_type: '학교기출',
        description: `복구: 자산화 도중 끊긴 22문항 연결 (원본 PDF: ${SOURCE_NAME})`,
        institute_id: refExam?.institute_id || null,
        created_by: refExam?.created_by || null,
        book_group_id: refExam?.book_group_id || null,
        total_points: orphans.length * 4, // 임시 (각 4점)
      })
      .select('id')
      .single();
    if (ne || !newExam) {
      console.error('exam INSERT 실패:', ne?.message);
      return;
    }
    examId = newExam.id;
    console.log(`✓ 새 exam 생성: ${examId}`);
  }

  // 6) exam_problems INSERT
  const rows = orphans.map((p: any, idx) => ({
    exam_id: examId,
    problem_id: p.id,
    sequence_number: p.source_number || idx + 1,
    points: 4,
  }));
  const { error: epErr } = await sb.from('exam_problems').insert(rows);
  if (epErr) {
    console.error('exam_problems INSERT 실패:', epErr.message);
    return;
  }
  console.log(`✓ exam_problems ${rows.length}건 연결 완료`);
  console.log(`\n복구 완료. exam_id=${examId}`);
  console.log(`확인: /dashboard/cloud/${examId} 펼쳐보기`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
