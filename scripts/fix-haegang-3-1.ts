/**
 * 26-3-1-M 해강중 시험지 직접 보정 스크립트
 *
 * 1. exams.subject/grade 를 "중3-1 수학", "중3" 으로 정정
 * 2. classifications.type_code 를 mathsecr_types 에 실재하는 코드로
 *    재분류 (Claude Sonnet → classify.ts 사용)
 *
 * 실행: npx tsx scripts/fix-haegang-3-1.ts
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ env 누락'); process.exit(1);
}
const sb = createClient(url, key);

const EXAM_ID = '54d5a1e3-ba42-46e5-999d-2dc0ce9de192';

async function main() {
  // 1) 시험지 메타 정정
  const { error: exErr } = await sb
    .from('exams')
    .update({ subject: '중3-1 수학', grade: '중3' })
    .eq('id', EXAM_ID);
  if (exErr) {
    console.error('exam update error:', exErr.message);
    return;
  }
  console.log('✓ 시험지 subject/grade 정정 완료');

  // 2) auto-fix?force=1 호출 (재분류) — 로컬 dev 서버 사용
  // ★ 단, 스크립트는 dev 서버 없이 도는 환경일 수 있어 직접 호출 대신
  //   사용자가 수동으로 자동수정 버튼을 누르거나 PROD에서 fetch.
  //   여기선 시험지만 정정하고 분류는 사용자가 자동수정 버튼으로 트리거.
  console.log('\n다음 작업 (수동):');
  console.log('  1) Vercel 프로덕션에서 시험지 펼쳐보기 → 자동수정 버튼 누르기 (mode=classify, force=1)');
  console.log('     OR fetch https://<prod>/api/exams/' + EXAM_ID + '/auto-fix?mode=classify&force=1 (POST)');
  console.log('  2) 그 후 다시 npx tsx scripts/check-exam-classification.ts "해강중" "3-1" 실행해 결과 확인');
}

main().catch(e => { console.error(e); process.exit(1); });
