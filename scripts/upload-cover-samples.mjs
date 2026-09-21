// 표지 샘플 이미지를 센터별 표지 라이브러리(Storage `source-files/uploads/covers/{instituteId}/`)에 올린다.
// api/print/covers 와 같은 규칙: 2480px 이하 WebP q90, 키는 ASCII `{ts}-{name}.webp`.
// 사용: node scripts/upload-cover-samples.mjs <이미지 폴더> [instituteId,instituteId,...]
//   institute 를 안 주면 institutes 전체에 올린다.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Supabase env 없음'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const dir = process.argv[2];
if (!dir) { console.error('이미지 폴더를 주세요'); process.exit(1); }
let institutes = (process.argv[3] || '').split(',').filter(Boolean);
if (institutes.length === 0) {
  const { data, error } = await sb.from('institutes').select('id, name');
  if (error) throw error;
  institutes = data.map((r) => r.id);
  console.log('institutes:', data.map((r) => r.name).join(', '));
}

const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
let ts = Date.now();
for (const f of files) {
  const input = fs.readFileSync(path.join(dir, f));
  const out = await sharp(input).rotate().resize({ width: 2480, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
  const name = 'sample-' + f.replace(/\.[a-z0-9]+$/i, '').replace(/^\d+-/, '').replace(/[^A-Za-z0-9_-]+/g, '_');
  ts += 1;
  for (const inst of institutes) {
    const p = `uploads/covers/${inst}/${ts}-${name}.webp`;
    const { error } = await sb.storage.from('source-files').upload(p, out, { contentType: 'image/webp', upsert: false });
    if (error) { console.error('FAIL', p, error.message); continue; }
    console.log('ok', p, `${Math.round(out.length / 1024)}KB`);
  }
}
