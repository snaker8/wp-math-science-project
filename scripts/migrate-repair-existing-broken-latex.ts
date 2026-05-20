// 기존 DB 의 OCR 깨진 LaTeX 8건 일괄 정정 마이그레이션
//   - repair-ocr-latex 의 패턴 적용해서 변경되는 모든 문제 업데이트
//   - dry-run 기본 — 실제 적용은 --apply 플래그
//
// 사용: npx tsx scripts/migrate-repair-existing-broken-latex.ts [--apply]
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { repairOcrBrokenLatex } from '../src/lib/utils/repair-ocr-latex';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? '═══ APPLY 모드 — 실제 DB 업데이트 ═══' : '═══ DRY-RUN 모드 (--apply 없으면 변경 안 함) ═══\n');

  const all: { id: string; content_latex: string }[] = [];
  for (let page = 0; page < 10; page++) {
    const { data } = await supabase
      .from('problems')
      .select('id, content_latex')
      .not('content_latex', 'is', null)
      .is('deleted_at', null)
      .range(page * 500, page * 500 + 499);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 500) break;
  }
  console.log(`전체 problems: ${all.length}건`);

  const targets: { id: string; before: string; after: string }[] = [];
  for (const p of all) {
    const before = p.content_latex || '';
    const after = repairOcrBrokenLatex(before);
    if (before !== after) targets.push({ id: p.id, before, after });
  }
  console.log(`정정 대상: ${targets.length}건\n`);

  for (const t of targets) {
    console.log(`[${t.id}]`);
    console.log('BEFORE:', t.before.substring(0, 150).replace(/\n/g, '\\n'));
    console.log('AFTER: ', t.after.substring(0, 150).replace(/\n/g, '\\n'));
    if (APPLY) {
      const { error } = await supabase
        .from('problems')
        .update({ content_latex: t.after })
        .eq('id', t.id);
      if (error) console.log(`  ❌ 실패: ${error.message}`);
      else console.log(`  ✅ 적용`);
    }
    console.log();
  }

  if (!APPLY) {
    console.log('=== DRY-RUN 완료 — 실제 적용하려면 --apply 플래그 추가 ===');
  } else {
    console.log(`=== APPLY 완료 — ${targets.length}건 정정 ===`);
  }
}

main();
