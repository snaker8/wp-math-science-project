/**
 * Supabase에 확장 세부유형 데이터를 직접 upsert하는 스크립트
 *
 * Usage: npx tsx scripts/apply-seed-to-supabase.ts
 *
 * 전제조건: 먼저 Supabase 대시보드 SQL Editor에서 마이그레이션 실행
 *   https://supabase.com/dashboard/project/ppexawiiphghdrjnmvkx/sql/new
 *   → database/migrations/005_expanded_math_types.sql 내용 복사 후 실행
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// .env 파일에서 환경 변수 로드
function loadEnv() {
  // worktree: .../과사람 수학프로그램/.claude/worktrees/kind-bhabha/scripts
  // .env is at: .../과사람 수학프로그램/.env  (4 levels up from scripts/)
  const candidates = [
    path.join(__dirname, '..', '..', '..', '..', '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '.env'),
  ];

  let envPath: string | null = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      envPath = p;
      break;
    }
  }

  if (!envPath) {
    console.error('❌ .env 파일을 찾을 수 없습니다');
    process.exit(1);
  }

  console.log(`   .env 로드: ${envPath}`);
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL 또는 SERVICE_ROLE_KEY가 없습니다');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface ExpandedType {
  type_code: string;
  type_name: string;
  description: string;
  solution_method: string;
  subject: string;
  area: string;
  standard_code: string;
  standard_content: string;
  cognitive: string;
  difficulty_min: number;
  difficulty_max: number;
  keywords: string[];
  school_level: string;
  level_code: string;
  domain_code: string;
}

const BATCH_SIZE = 100;

/**
 * V1 seed SQL 파일 파싱 → ExpandedType 배열 반환
 * 형식: INSERT INTO expanded_math_types (...) VALUES ('code', 'name', ..., 1, 2, '["kw"]', ...) ON CONFLICT ...
 */
function parseV1Sql(filePath: string): ExpandedType[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const types: ExpandedType[] = [];

  for (const line of content.split('\n')) {
    if (!line.startsWith('INSERT INTO')) continue;

    // VALUES ( ... ) ON CONFLICT 사이 추출
    const valMatch = line.match(/VALUES\s*\((.+)\)\s*ON CONFLICT/);
    if (!valMatch) continue;

    const vals = parseValues(valMatch[1]);
    if (vals.length < 15) continue;

    const [type_code, type_name, description, solution_method, subject, area,
      standard_code, standard_content, cognitive, difficulty_min_s, difficulty_max_s,
      keywords_s, school_level, level_code, domain_code] = vals;

    const kw = JSON.parse(keywords_s || '[]');
    types.push({
      type_code, type_name, description, solution_method, subject, area,
      standard_code, standard_content, cognitive,
      difficulty_min: Math.min(5, Math.max(1, parseInt(difficulty_min_s, 10) || 1)),
      difficulty_max: Math.min(5, Math.max(1, parseInt(difficulty_max_s, 10) || 3)),
      keywords: Array.isArray(kw) ? kw : [],
      school_level, level_code, domain_code,
    });
  }
  return types;
}

/**
 * SQL VALUES 튜플 파싱 (단순 상태 머신 — 문자열/숫자 혼합 처리)
 */
function parseValues(raw: string): string[] {
  const vals: string[] = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && raw[i] === ' ') i++; // 공백 스킵
    if (raw[i] === "'") {
      // 문자열 파싱 ('' → ' 이스케이프 처리)
      i++;
      let s = '';
      while (i < raw.length) {
        if (raw[i] === "'" && raw[i + 1] === "'") { s += "'"; i += 2; }
        else if (raw[i] === "'") { i++; break; }
        else { s += raw[i++]; }
      }
      vals.push(s);
    } else {
      // 숫자 또는 NULL
      let s = '';
      while (i < raw.length && raw[i] !== ',' && raw[i] !== ')') s += raw[i++];
      vals.push(s.trim());
    }
    while (i < raw.length && raw[i] === ' ') i++;
    if (raw[i] === ',') i++;
  }
  return vals;
}

async function checkTableExists(): Promise<boolean> {
  const { error } = await supabase
    .from('expanded_math_types')
    .select('type_code')
    .limit(1);
  return !error;
}

async function upsertBatch(types: ExpandedType[]): Promise<number> {
  const rows = types.map(t => ({
    type_code: t.type_code,
    type_name: t.type_name,
    description: t.description || '',
    solution_method: t.solution_method || '',
    subject: t.subject,
    area: t.area,
    standard_code: t.standard_code,
    standard_content: t.standard_content || '',
    cognitive: t.cognitive,
    // V3 데이터가 1~10 척도로 생성된 경우가 있어 1~5로 클램핑
    difficulty_min: Math.min(5, Math.max(1, t.difficulty_min)),
    difficulty_max: Math.min(5, Math.max(1, t.difficulty_max)),
    keywords: t.keywords,
    school_level: t.school_level,
    level_code: t.level_code,
    domain_code: t.domain_code,
    is_active: true,
  }));

  const { error } = await supabase
    .from('expanded_math_types')
    .upsert(rows, {
      onConflict: 'type_code',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(`\n❌ 배치 오류:`, error.message);
    return 0;
  }
  return rows.length;
}

async function main() {
  console.log('🚀 Supabase 확장 세부유형 시드 스크립트');
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log('');

  // 1. 테이블 존재 여부 확인
  process.stdout.write('📊 테이블 확인 중...');
  const tableExists = await checkTableExists();

  if (!tableExists) {
    console.log(' ❌ 없음');
    console.log('');
    console.log('⚠️  expanded_math_types 테이블이 아직 없습니다.');
    console.log('');
    console.log('   ① Supabase SQL Editor로 이동:');
    console.log('      https://supabase.com/dashboard/project/ppexawiiphghdrjnmvkx/sql/new');
    console.log('');
    console.log('   ② 아래 파일 내용을 붙여넣고 실행:');
    console.log(`      ${path.join(__dirname, '..', 'database', 'migrations', '005_expanded_math_types.sql')}`);
    console.log('');
    console.log('   ③ 실행 완료 후 다시 실행:');
    console.log('      npx tsx scripts/apply-seed-to-supabase.ts');
    process.exit(1);
  }
  console.log(' ✅ 존재');

  // 2. 기존 데이터 수 확인
  const { count: existingCount } = await supabase
    .from('expanded_math_types')
    .select('*', { count: 'exact', head: true });
  console.log(`   현재 데이터: ${existingCount ?? 0}개`);
  console.log('');

  // 3. V1 SQL 파싱 후 upsert (seed_expanded_types.sql)
  console.log('📦 V1 데이터 파싱 중 (seed_expanded_types.sql)...');
  const v1SqlPath = path.join(__dirname, '..', 'curriculum_data', 'seed_expanded_types.sql');
  const v1Types = parseV1Sql(v1SqlPath);
  console.log(`   V1 파싱: ${v1Types.length}개`);

  const v1Batches = Math.ceil(v1Types.length / BATCH_SIZE);
  let v1Upserted = 0;
  for (let i = 0; i < v1Batches; i++) {
    const batch = v1Types.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const count = await upsertBatch(batch);
    v1Upserted += count;
    process.stdout.write(`\r   V1 진행: ${i + 1}/${v1Batches} | ${v1Upserted}개 완료`);
  }
  console.log('');

  const { count: afterV1 } = await supabase.from('expanded_math_types').select('*', { count: 'exact', head: true });
  console.log(`   V1 완료 후 테이블: ${afterV1}개`);
  console.log('');

  // 4. 모든 확장 데이터 로드
  console.log('📦 V2~V4 확장 데이터 로드 중...');

  const { HS0_EXPANSION } = await import('./generate-expanded-types');
  const { HS1_EXPANSION } = await import('./expansion-data-hs1');
  const { HS2_EXPANSION, CAL_EXPANSION, PRB_EXPANSION, GEO_EXPANSION } = await import('./expansion-data-hs2-cal-prb-geo');
  const { MS_EXPANSION } = await import('./expansion-data-ms');
  const { ES12_EXPANSION, ES34_EXPANSION, ES56_EXPANSION } = await import('./expansion-data-es');

  const { HS0_V3, HS1_V3 } = await import('./expansion-v3-hs0-hs1');
  const { HS2_V3, CAL_V3, PRB_V3, GEO_V3 } = await import('./expansion-v3-hs2-cal-prb-geo');
  const { MS_V3 } = await import('./expansion-v3-ms');
  const { ES12_V3, ES34_V3, ES56_V3 } = await import('./expansion-v3-es');
  const { ELA_V3, ELC_V3, ELM_V3, ELP_V3, ELR_V3, ELT_V3, ELW_V3, EM1_V3, ET1_V3 } = await import('./expansion-v3-elective');
  const { HS0_SUP, HS1_SUP, MS_SUP, ES12_SUP, ES34_SUP, ES56_SUP } = await import('./expansion-v3-supplement');

  const { HS0_V4, HS1_V4, HS2_V4, CAL_V4, PRB_V4, GEO_V4 } = await import('./expansion-v4-hs');
  const { MS_V4, ES12_V4, ES34_V4, ES56_V4 } = await import('./expansion-v4-ms-es');
  const { HS0_V4S, HS1_V4S, HS2_V4S, MS_V4S, CAL_V4S, PRB_V4S, GEO_V4S, ES12_V4S, ES34_V4S, ES56_V4S, EL_V4S, FINAL_SUP } = await import('./expansion-v4-supplement');

  const allTypes: ExpandedType[] = [
    // V2
    ...HS0_EXPANSION, ...HS1_EXPANSION, ...HS2_EXPANSION, ...CAL_EXPANSION, ...PRB_EXPANSION, ...GEO_EXPANSION,
    ...MS_EXPANSION, ...ES12_EXPANSION, ...ES34_EXPANSION, ...ES56_EXPANSION,
    // V3
    ...HS0_V3, ...HS1_V3, ...HS2_V3, ...CAL_V3, ...PRB_V3, ...GEO_V3,
    ...MS_V3, ...ES12_V3, ...ES34_V3, ...ES56_V3,
    ...ELA_V3, ...ELC_V3, ...ELM_V3, ...ELP_V3, ...ELR_V3, ...ELT_V3, ...ELW_V3, ...EM1_V3, ...ET1_V3,
    ...HS0_SUP, ...HS1_SUP, ...MS_SUP, ...ES12_SUP, ...ES34_SUP, ...ES56_SUP,
    // V4
    ...HS0_V4, ...HS1_V4, ...HS2_V4, ...CAL_V4, ...PRB_V4, ...GEO_V4,
    ...MS_V4, ...ES12_V4, ...ES34_V4, ...ES56_V4,
    ...HS0_V4S, ...HS1_V4S, ...HS2_V4S, ...MS_V4S,
    ...CAL_V4S, ...PRB_V4S, ...GEO_V4S,
    ...ES12_V4S, ...ES34_V4S, ...ES56_V4S,
    ...EL_V4S, ...FINAL_SUP,
  ];

  // 중복 제거 (type_code 기준)
  const typeMap = new Map<string, ExpandedType>();
  for (const t of allTypes) typeMap.set(t.type_code, t);
  const uniqueTypes = Array.from(typeMap.values());
  console.log(`   로드: ${allTypes.length}개 → 중복 제거: ${uniqueTypes.length}개`);
  console.log('');

  // 4. 배치 upsert
  const batches = Math.ceil(uniqueTypes.length / BATCH_SIZE);
  console.log(`🔄 배치 upsert 시작 (${batches}개 배치 × ${BATCH_SIZE})`);

  let totalUpserted = 0;
  let errors = 0;

  for (let i = 0; i < batches; i++) {
    const batch = uniqueTypes.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const count = await upsertBatch(batch);
    if (count > 0) {
      totalUpserted += count;
    } else {
      errors++;
    }
    process.stdout.write(`\r   진행: ${i + 1}/${batches} 배치 | ${totalUpserted}개 완료${errors > 0 ? ` | ⚠️ ${errors}개 오류` : ''}`);
  }
  console.log('');
  console.log('');

  // 5. 최종 확인
  const { count: finalCount } = await supabase
    .from('expanded_math_types')
    .select('*', { count: 'exact', head: true });

  console.log(`✅ 완료!`);
  console.log(`   upsert: ${totalUpserted}개 (오류: ${errors}개 배치)`);
  console.log(`   테이블 최종: ${finalCount}개`);

  if (errors > 0) {
    console.log('');
    console.log('⚠️  일부 배치에서 오류가 발생했습니다. 로그를 확인하세요.');
  }
}

main().catch(err => {
  console.error('❌ 치명적 오류:', err.message || err);
  process.exit(1);
});
