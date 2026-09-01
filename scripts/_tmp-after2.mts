import fs from 'fs'; import path from 'path';
import { parseHml } from '@/lib/workflow/hml-parser';
const ROOT='G:/내 드라이브/수학 자료';
function walk(d: string, o: string[] = [], dep = 0): string[] {
  if (dep > 7) return o;
  let es: fs.Dirent[] = [];
  try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return o; }
  for (const e of es) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o, dep + 1);
    else if (e.name.toLowerCase().endsWith('.hml')) o.push(p);
  }
  return o;
}
const files = walk(ROOT);
let tot = 0, mc = 0, short = 0, answerLost = 0, pointsLeak = 0, five = 0;
for (const f of files) {
  let r;
  try { r = parseHml(fs.readFileSync(f)); } catch { continue; }
  for (const p of r.problems) {
    tot++;
    if (!p.choices.length) continue;
    mc++;
    if (p.choices.length === 5) five++;
    if (p.choices.length < 5) short++;
    const idx = '①②③④⑤'.indexOf(p.answer);
    if (idx >= 0 && idx >= p.choices.length) answerLost++;
    if (p.choices.some((c) => /[\[(]\s*\d+(\.\d+)?\s*점\s*[\])]/.test(c))) pointsLeak++;
  }
}
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(2)}%` : '-');
console.log(`파일 ${files.length} / 문항 ${tot}`);
console.log(`객관식 ${mc}`);
console.log(`  보기 5개      ${five} (${pct(five, mc)})`);
console.log(`  보기 5개 미만  ${short} (${pct(short, mc)})`);
console.log(`  정답 유실     ${answerLost}`);
console.log(`  배점 잔재     ${pointsLeak}`);
