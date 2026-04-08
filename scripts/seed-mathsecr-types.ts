/**
 * 수학비서(mathsecr) 분류 트리 → Supabase mathsecr_types 테이블 시딩
 *
 * 사용법:
 *   npx tsx scripts/seed-mathsecr-types.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface TreeNode {
  t: string; // text (이름)
  c: string; // code (상대 코드)
  ch?: TreeNode[]; // children
}

interface FlatRow {
  code: string;
  subject_code: string;
  subject_name: string;
  level1_code: string | null;
  level1_name: string | null;
  level2_code: string | null;
  level2_name: string | null;
  level3_code: string | null;
  level3_name: string | null;
  level4_code: string | null;
  level4_name: string | null;
  depth: number;
  is_leaf: boolean;
  parent_code: string | null;
  full_path: string;
}

function flatten(tree: TreeNode[], parentCode: string | null, depth: number, context: {
  subject_code: string;
  subject_name: string;
  l1_code?: string; l1_name?: string;
  l2_code?: string; l2_name?: string;
  l3_code?: string; l3_name?: string;
  pathParts: string[];
}): FlatRow[] {
  const rows: FlatRow[] = [];

  for (const node of tree) {
    const isLeaf = !node.ch || node.ch.length === 0;
    let code: string;
    const newContext = { ...context, pathParts: [...context.pathParts, node.t] };

    if (depth === 1) {
      code = `MS${node.c}`;
      newContext.subject_code = node.c;
      newContext.subject_name = node.t;
    } else {
      // 부모 코드에 자식 코드를 이어붙임 (중복 불가)
      code = `${parentCode}-${node.c}`;
    }

    if (depth === 2) { newContext.l1_code = node.c; newContext.l1_name = node.t; }
    if (depth === 3) { newContext.l2_code = node.c; newContext.l2_name = node.t; }
    if (depth === 4) { newContext.l3_code = node.c; newContext.l3_name = node.t; }

    rows.push({
      code,
      subject_code: newContext.subject_code || context.subject_code,
      subject_name: newContext.subject_name || context.subject_name,
      level1_code: newContext.l1_code || null,
      level1_name: newContext.l1_name || null,
      level2_code: newContext.l2_code || null,
      level2_name: newContext.l2_name || null,
      level3_code: newContext.l3_code || null,
      level3_name: newContext.l3_name || null,
      level4_code: depth >= 5 ? node.c : null,
      level4_name: depth >= 5 ? node.t : null,
      depth,
      is_leaf: isLeaf,
      parent_code: parentCode,
      full_path: newContext.pathParts.join(' > '),
    });

    if (node.ch && node.ch.length > 0) {
      rows.push(...flatten(node.ch, code, depth + 1, newContext));
    }
  }

  return rows;
}

async function main() {
  console.log('Loading mathsecr_complete.json...');
  const jsonPath = path.join(process.cwd(), 'mathsecr_complete.json');
  const tree: TreeNode[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`Found ${tree.length} subjects`);

  // 플랫 변환
  const rows = flatten(tree, null, 1, {
    subject_code: '', subject_name: '', pathParts: [],
  });
  console.log(`Flattened: ${rows.length} rows total`);
  console.log(`  Leaf nodes: ${rows.filter(r => r.is_leaf).length}`);

  // 기존 데이터 삭제
  console.log('Clearing existing mathsecr_types...');
  const { error: delError } = await supabase.from('mathsecr_types').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delError) console.warn('Delete warning:', delError.message);

  // 배치 INSERT (500개씩)
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('mathsecr_types').upsert(batch, { onConflict: 'code' });
    if (error) {
      console.error(`Batch ${i}-${i + BATCH} failed:`, error.message);
      // 개별 삽입 시도
      for (const row of batch) {
        const { error: singleErr } = await supabase.from('mathsecr_types').upsert(row, { onConflict: 'code' });
        if (singleErr) console.error(`  Row ${row.code} failed:`, singleErr.message);
        else inserted++;
      }
    } else {
      inserted += batch.length;
    }
    if ((i + BATCH) % 2000 === 0 || i + BATCH >= rows.length) {
      console.log(`  ${inserted}/${rows.length} inserted...`);
    }
  }

  console.log(`\nDone! ${inserted} rows inserted into mathsecr_types`);

  // 통계
  const { data: stats } = await supabase
    .from('mathsecr_types')
    .select('subject_name, depth')
    .eq('is_leaf', true);

  if (stats) {
    const bySubject: Record<string, number> = {};
    stats.forEach((s: any) => { bySubject[s.subject_name] = (bySubject[s.subject_name] || 0) + 1; });
    console.log('\nLeaf types by subject:');
    Object.entries(bySubject).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
      console.log(`  ${name}: ${count}`);
    });
  }
}

main().catch(console.error);
