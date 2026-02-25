/**
 * DB 진단: exams 테이블에서 book_group_id 상태 확인
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL 또는 SERVICE_ROLE_KEY가 .env에 없습니다');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDB() {
  console.log('=== DB 진단 시작 ===\n');

  // 1. book_groups 테이블 확인
  console.log('--- 1. book_groups 테이블 ---');
  const { data: groups, error: groupsErr } = await supabase
    .from('book_groups')
    .select('id, name, parent_id, subject')
    .limit(20);

  if (groupsErr) {
    console.error('❌ book_groups 조회 실패:', groupsErr.message);
  } else {
    console.log(`✅ book_groups: ${groups.length}개`);
    groups.forEach((g: any) => console.log(`   ${g.id} | ${g.name} | subject=${g.subject}`));
  }

  // 2. exams 테이블 - book_group_id 포함 조회
  console.log('\n--- 2. exams 테이블 (book_group_id 포함) ---');
  const { data: exams, error: examsErr } = await supabase
    .from('exams')
    .select('id, title, book_group_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (examsErr) {
    console.error('❌ exams 조회 실패:', examsErr.message);
    console.error('   → book_group_id 컬럼이 존재하지 않을 수 있음!');

    // book_group_id 없이 재시도
    console.log('\n--- 2b. exams 테이블 (book_group_id 제외) ---');
    const { data: exams2, error: examsErr2 } = await supabase
      .from('exams')
      .select('id, title, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (examsErr2) {
      console.error('❌ exams 조회 완전 실패:', examsErr2.message);
    } else {
      console.log(`✅ exams (book_group_id 제외): ${exams2.length}개`);
      exams2.forEach((e: any) => console.log(`   ${e.id} | ${e.title} | ${e.status}`));
    }
  } else {
    console.log(`✅ exams: ${exams.length}개`);
    exams.forEach((e: any) => {
      const bgLabel = e.book_group_id ? `✅ ${e.book_group_id}` : '❌ NULL';
      console.log(`   ${e.id} | ${e.title} | book_group_id=${bgLabel}`);
    });

    const withBG = exams.filter((e: any) => e.book_group_id).length;
    const withoutBG = exams.filter((e: any) => !e.book_group_id).length;
    console.log(`\n   📊 book_group_id 있음: ${withBG}개, NULL: ${withoutBG}개`);
  }

  // 3. exams 테이블 컬럼 확인
  console.log('\n--- 3. exams 테이블 컬럼 확인 ---');
  const { data: cols, error: colsErr } = await supabase
    .rpc('get_table_columns', { table_name: 'exams' })
    .limit(50);

  if (colsErr) {
    // RPC가 없을 수 있으므로 information_schema 직접 조회
    const { data: cols2, error: colsErr2 } = await supabase
      .from('information_schema.columns' as any)
      .select('column_name')
      .eq('table_name', 'exams')
      .limit(50);

    if (colsErr2) {
      console.log('⚠️ 컬럼 목록 조회 불가 (정상 - information_schema 접근 제한)');
    } else {
      console.log('컬럼 목록:', cols2?.map((c: any) => c.column_name).join(', '));
    }
  } else {
    console.log('컬럼 목록:', cols?.map((c: any) => c.column_name).join(', '));
  }

  console.log('\n=== DB 진단 완료 ===');
}

checkDB().catch(console.error);
