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
  // 동적 import로 각 확장 데이터 로드
  const { HS0_EXPANSION } = await import('./generate-expanded-types');
  const { HS1_EXPANSION } = await import('./expansion-data-hs1');
  const { HS2_EXPANSION, CAL_EXPANSION, PRB_EXPANSION, GEO_EXPANSION } = await import('./expansion-data-hs2-cal-prb-geo');
  const { MS_EXPANSION } = await import('./expansion-data-ms');
  const { ES12_EXPANSION, ES34_EXPANSION, ES56_EXPANSION } = await import('./expansion-data-es');

  const allExpansions = [
    { name: 'HS0 (고등 공통)', types: HS0_EXPANSION },
    { name: 'HS1 (수학I)', types: HS1_EXPANSION },
    { name: 'HS2 (수학II)', types: HS2_EXPANSION },
    { name: 'CAL (미적분)', types: CAL_EXPANSION },
    { name: 'PRB (확률과통계)', types: PRB_EXPANSION },
    { name: 'GEO (기하)', types: GEO_EXPANSION },
    { name: 'MS (중학교)', types: MS_EXPANSION },
    { name: 'ES12 (초등 1-2)', types: ES12_EXPANSION },
    { name: 'ES34 (초등 3-4)', types: ES34_EXPANSION },
    { name: 'ES56 (초등 5-6)', types: ES56_EXPANSION },
  ];

  const lines: string[] = [];
  lines.push('-- ============================================================================');
  lines.push('-- 확장 세부유형 v2 추가 데이터 (시중교재 분석 기반)');
  lines.push('-- 쎈, 개념원리 RPM, 블랙라벨, 수학의 정석, 마플 시너지 교재 분석');
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
  console.log(`   Combined with existing 1,139 → ~${1139 + totalNew} total`);
}

main().catch(console.error);
