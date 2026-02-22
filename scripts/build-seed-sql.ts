/**
 * 모든 확장 데이터를 통합하여 seed SQL을 생성하는 스크립트
 *
 * Usage: npx tsx scripts/build-seed-sql.ts
 */

import * as fs from 'fs';
import * as path from 'path';

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

function escSQL(s: string): string {
  return s.replace(/'/g, "''");
}

function typeToSQL(t: ExpandedType): string {
  const kw = JSON.stringify(t.keywords).replace(/'/g, "''");
  return `INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('${escSQL(t.type_code)}', '${escSQL(t.type_name)}', '${escSQL(t.description)}', '${escSQL(t.solution_method)}', '${escSQL(t.subject)}', '${escSQL(t.area)}', '${escSQL(t.standard_code)}', '${escSQL(t.standard_content)}', '${t.cognitive}', ${t.difficulty_min}, ${t.difficulty_max}, '${kw}'::jsonb, '${escSQL(t.school_level)}', '${t.level_code}', '${t.domain_code}', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();`;
}

async function main() {
  // V2 확장 데이터 로드
  const { HS0_EXPANSION } = await import('./generate-expanded-types');
  const { HS1_EXPANSION } = await import('./expansion-data-hs1');
  const { HS2_EXPANSION, CAL_EXPANSION, PRB_EXPANSION, GEO_EXPANSION } = await import('./expansion-data-hs2-cal-prb-geo');
  const { MS_EXPANSION } = await import('./expansion-data-ms');
  const { ES12_EXPANSION, ES34_EXPANSION, ES56_EXPANSION } = await import('./expansion-data-es');

  // V3 확장 데이터 로드
  const { HS0_V3, HS1_V3 } = await import('./expansion-v3-hs0-hs1');
  const { HS2_V3, CAL_V3, PRB_V3, GEO_V3 } = await import('./expansion-v3-hs2-cal-prb-geo');
  const { MS_V3 } = await import('./expansion-v3-ms');
  const { ES12_V3, ES34_V3, ES56_V3 } = await import('./expansion-v3-es');
  const { ELA_V3, ELC_V3, ELM_V3, ELP_V3, ELR_V3, ELT_V3, ELW_V3, EM1_V3, ET1_V3 } = await import('./expansion-v3-elective');
  const { HS0_SUP, HS1_SUP, MS_SUP, ES12_SUP, ES34_SUP, ES56_SUP } = await import('./expansion-v3-supplement');

  // V4 확장 데이터 로드
  const { HS0_V4, HS1_V4, HS2_V4, CAL_V4, PRB_V4, GEO_V4 } = await import('./expansion-v4-hs');
  const { MS_V4, ES12_V4, ES34_V4, ES56_V4 } = await import('./expansion-v4-ms-es');
  const { HS0_V4S, HS1_V4S, HS2_V4S, MS_V4S, CAL_V4S, PRB_V4S, GEO_V4S, ES12_V4S, ES34_V4S, ES56_V4S, EL_V4S, FINAL_SUP } = await import('./expansion-v4-supplement');

  const allExpansions = [
    // V2
    { name: 'HS0 v2 (고등 공통)', types: HS0_EXPANSION },
    { name: 'HS1 v2 (수학I)', types: HS1_EXPANSION },
    { name: 'HS2 v2 (수학II)', types: HS2_EXPANSION },
    { name: 'CAL v2 (미적분)', types: CAL_EXPANSION },
    { name: 'PRB v2 (확률과통계)', types: PRB_EXPANSION },
    { name: 'GEO v2 (기하)', types: GEO_EXPANSION },
    { name: 'MS v2 (중학교)', types: MS_EXPANSION },
    { name: 'ES12 v2 (초등 1-2)', types: ES12_EXPANSION },
    { name: 'ES34 v2 (초등 3-4)', types: ES34_EXPANSION },
    { name: 'ES56 v2 (초등 5-6)', types: ES56_EXPANSION },
    // V3
    { name: 'HS0 v3 (고등 공통 심화)', types: HS0_V3 },
    { name: 'HS1 v3 (수학I 심화)', types: HS1_V3 },
    { name: 'HS2 v3 (수학II 심화)', types: HS2_V3 },
    { name: 'CAL v3 (미적분 심화)', types: CAL_V3 },
    { name: 'PRB v3 (확률과통계 심화)', types: PRB_V3 },
    { name: 'GEO v3 (기하 심화)', types: GEO_V3 },
    { name: 'MS v3 (중학교 심화)', types: MS_V3 },
    { name: 'ES12 v3 (초등1-2 심화)', types: ES12_V3 },
    { name: 'ES34 v3 (초등3-4 심화)', types: ES34_V3 },
    { name: 'ES56 v3 (초등5-6 심화)', types: ES56_V3 },
    { name: 'ELA v3 (경제수학)', types: ELA_V3 },
    { name: 'ELC v3 (실용수학)', types: ELC_V3 },
    { name: 'ELM v3 (수학과제탐구)', types: ELM_V3 },
    { name: 'ELP v3 (인공지능수학)', types: ELP_V3 },
    { name: 'ELR v3 (기본수학)', types: ELR_V3 },
    { name: 'ELT v3 (직무수학)', types: ELT_V3 },
    { name: 'ELW v3 (심화수학)', types: ELW_V3 },
    { name: 'EM1 v3 (심화수학I)', types: EM1_V3 },
    { name: 'ET1 v3 (수학과제탐구I)', types: ET1_V3 },
    // Supplement
    { name: 'HS0 보충', types: HS0_SUP },
    { name: 'HS1 보충', types: HS1_SUP },
    { name: 'MS 보충', types: MS_SUP },
    { name: 'ES12 보충', types: ES12_SUP },
    { name: 'ES34 보충', types: ES34_SUP },
    { name: 'ES56 보충', types: ES56_SUP },
    // V4
    { name: 'HS0 v4 (고등 공통 추가)', types: HS0_V4 },
    { name: 'HS1 v4 (수학I 추가)', types: HS1_V4 },
    { name: 'HS2 v4 (수학II 추가)', types: HS2_V4 },
    { name: 'CAL v4 (미적분 추가)', types: CAL_V4 },
    { name: 'PRB v4 (확률과통계 추가)', types: PRB_V4 },
    { name: 'GEO v4 (기하 추가)', types: GEO_V4 },
    { name: 'MS v4 (중학교 추가)', types: MS_V4 },
    { name: 'ES12 v4 (초등1-2 추가)', types: ES12_V4 },
    { name: 'ES34 v4 (초등3-4 추가)', types: ES34_V4 },
    { name: 'ES56 v4 (초등5-6 추가)', types: ES56_V4 },
    // V4 Supplement
    { name: 'HS0 v4s (고등 공통 서술/융합)', types: HS0_V4S },
    { name: 'HS1 v4s (수학I 서술/융합)', types: HS1_V4S },
    { name: 'HS2 v4s (수학II 서술/융합)', types: HS2_V4S },
    { name: 'MS v4s (중학교 서술/융합)', types: MS_V4S },
    { name: 'CAL v4s (미적분 보충)', types: CAL_V4S },
    { name: 'PRB v4s (확률과통계 보충)', types: PRB_V4S },
    { name: 'GEO v4s (기하 보충)', types: GEO_V4S },
    { name: 'ES12 v4s (초등1-2 보충)', types: ES12_V4S },
    { name: 'ES34 v4s (초등3-4 보충)', types: ES34_V4S },
    { name: 'ES56 v4s (초등5-6 보충)', types: ES56_V4S },
    { name: '선택과목 v4s (9과목 보충)', types: EL_V4S },
    { name: '최종 보충 (3,000개 달성)', types: FINAL_SUP },
  ];

  const lines: string[] = [];
  lines.push('-- ============================================================================');
  lines.push('-- 확장 세부유형 v2+v3 추가 데이터 (시중교재 분석 기반)');
  lines.push('-- v2: 쎈, 개념원리 RPM, 블랙라벨, 수학의 정석, 마플 시너지 교재 분석');
  lines.push('-- v3: 수능/내신 심화유형 + 선택과목 9개 레벨 확장');
  lines.push('-- v4: 수능 기출 + 평가원 + 내신 기출 기반 추가 확장');
  lines.push(`-- Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('-- ============================================================================');
  lines.push('');

  let totalNew = 0;
  const typeCodes = new Set<string>();
  const duplicates: string[] = [];

  for (const exp of allExpansions) {
    lines.push('');
    lines.push(`-- === ${exp.name}: ${exp.types.length}개 추가 ===`);

    for (const t of exp.types) {
      if (typeCodes.has(t.type_code)) {
        duplicates.push(t.type_code);
      }
      typeCodes.add(t.type_code);
      lines.push(typeToSQL(t));
    }

    totalNew += exp.types.length;
    console.log(`  ${exp.name}: ${exp.types.length} types`);
  }

  lines.push('');
  lines.push(`-- Total new types: ${totalNew}`);

  if (duplicates.length > 0) {
    console.error(`\n⚠️ Duplicate type codes found: ${duplicates.join(', ')}`);
  }

  // SQL 파일 저장
  const outputPath = path.join(__dirname, '..', 'curriculum_data', 'seed_expanded_types_v2.sql');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  console.log(`\n✅ Generated ${outputPath}`);
  console.log(`   Total new types: ${totalNew}`);
  console.log(`   Combined with existing 1,094 (v1) → ~${1094 + totalNew} total`);
}

main().catch(console.error);
