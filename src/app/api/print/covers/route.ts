// 표지 이미지 라이브러리 — 학원(활성 센터)별 Storage 폴더.
//
// 대표 지시(2026-09-19): "표지는 구글에서 제미나이로 얼마든지 감각있는 거 만들어 넣을 수 있으니"
//   → 표지 디자인을 코드로 수십 종 만들지 않는다. 밖에서 만든 A4 이미지를 올려 두고 고르는 슬롯이다.
//   DB 표 없이 Storage `source-files/uploads/covers/{instituteId}/` 폴더 자체가 라이브러리다
//   (list = 목록, upload = 추가, remove = 삭제). 마이그레이션 0.
//
// 격리: 활성 센터(resolveActiveInstitute) 폴더만 읽고 쓴다 — 다른 센터 경로는 400.
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { resolveActiveInstitute } from '@/lib/security/active-institute';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BUCKET = 'source-files';
const MAX_BYTES = 12 * 1024 * 1024; // 원본 상한 12MB (base64 전송)
const MAX_W = 2480; // A4 @300dpi 가로. 더 크면 줄인다 — 인쇄엔 충분, 미리보기 로딩엔 가볍게

function prefixOf(instituteId: string) {
  return `uploads/covers/${instituteId}/`;
}

async function scope() {
  const authed = await requireAuthScope();
  if (!authed.ok) return { error: authed.response } as const;
  if (!supabaseAdmin) {
    return { error: NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 }) } as const;
  }
  const instituteId = resolveActiveInstitute(authed.data.scope);
  if (!instituteId) {
    return { error: NextResponse.json({ error: '활성 센터가 없습니다' }, { status: 400 }) } as const;
  }
  return { instituteId, admin: supabaseAdmin } as const;
}

export type CoverAsset = { name: string; path: string; url: string; size: number; createdAt: string | null };
/** 저장한 표지(디자인+이미지+제목·부제목·학원명·안내문) — 시험지와 무관하게 만들어 두고 아무 시험지에나 붙인다 (2026-09-21 대표 요청) */
export type CoverTemplate = { name: string; path: string; settings: Record<string, unknown>; createdAt: string | null };
const TPL_DIR = 'templates/';

/** GET — 이 센터의 표지 이미지 목록 (최신순) */
export async function GET() {
  const s = await scope();
  if ('error' in s) return s.error;
  const prefix = prefixOf(s.instituteId);
  const { data, error } = await s.admin.storage
    .from(BUCKET)
    .list(prefix.slice(0, -1), { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const items: CoverAsset[] = (data ?? [])
    .filter((f) => f.name && !f.name.startsWith('.') && f.id) // 폴더 placeholder 제외
    .map((f) => {
      const path = prefix + f.name;
      const { data: u } = s.admin.storage.from(BUCKET).getPublicUrl(path);
      // 파일명 = `{ts}-{원래이름}` — 표시용 이름은 ts 를 뗀다
      const name = f.name.replace(/^\d{13}-/, '').replace(/\.(webp|png|jpe?g)$/i, '');
      return {
        name,
        path,
        url: u?.publicUrl ?? '',
        size: (f.metadata as { size?: number } | null)?.size ?? 0,
        createdAt: f.created_at ?? null,
      };
    });
  // 저장한 표지 목록 — templates/ 폴더의 JSON
  const templates: CoverTemplate[] = [];
  const { data: tplFiles } = await s.admin.storage
    .from(BUCKET)
    .list((prefix + TPL_DIR).slice(0, -1), { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  for (const f of tplFiles ?? []) {
    if (!f.id || !f.name.endsWith('.json')) continue;
    const path = prefix + TPL_DIR + f.name;
    const { data: blob } = await s.admin.storage.from(BUCKET).download(path);
    if (!blob) continue;
    try {
      const json = JSON.parse(await blob.text()) as { name?: string; settings?: Record<string, unknown> };
      templates.push({ name: json.name || f.name.replace(/^\d{13}-/, '').replace(/\.json$/, ''), path, settings: json.settings || {}, createdAt: f.created_at ?? null });
    } catch { /* 깨진 파일은 건너뜀 */ }
  }
  return NextResponse.json({ items, templates });
}

/** POST — 표지 이미지 추가 { base64, name } → 2480px 이하 WebP 로 정규화해 저장 */
export async function POST(req: NextRequest) {
  const s = await scope();
  if ('error' in s) return s.error;
  let body: { base64?: string; name?: string; template?: { name?: string; settings?: Record<string, unknown> } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  // ── 저장한 표지(JSON) — 이미지가 아니라 설정 묶음. 이름은 한글 그대로(JSON 안), 키는 ASCII
  if (body.template) {
    const name = String(body.template.name || '').trim().slice(0, 40);
    if (!name) return NextResponse.json({ error: '표지 이름이 필요합니다' }, { status: 400 });
    const settings = body.template.settings && typeof body.template.settings === 'object' ? body.template.settings : {};
    const safe = name.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'cover';
    const path = `${prefixOf(s.instituteId)}${TPL_DIR}${Date.now()}-${safe}.json`;
    const buf = Buffer.from(JSON.stringify({ name, settings, savedAt: new Date().toISOString() }), 'utf8');
    const { error } = await s.admin.storage.from(BUCKET).upload(path, buf, { contentType: 'application/json', upsert: false });
    if (error) return NextResponse.json({ error: 'Storage upload failed', message: error.message }, { status: 502 });
    const tpl: CoverTemplate = { name, path, settings, createdAt: new Date().toISOString() };
    return NextResponse.json({ template: tpl });
  }
  const raw = (body.base64 || '').replace(/^data:image\/[\w+.-]+;base64,/, '');
  if (!raw) return NextResponse.json({ error: 'base64 가 필요합니다' }, { status: 400 });
  const input = Buffer.from(raw, 'base64');
  if (input.length === 0 || input.length > MAX_BYTES) {
    return NextResponse.json({ error: `이미지는 ${MAX_BYTES / 1024 / 1024}MB 이하` }, { status: 413 });
  }
  let out: Buffer;
  let width = 0; let height = 0;
  try {
    const img = sharp(input, { failOn: 'none' }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new Error('이미지를 읽을 수 없습니다');
    out = await img.resize({ width: MAX_W, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    const scale = Math.min(1, MAX_W / meta.width);
    width = Math.round(meta.width * scale); height = Math.round(meta.height * scale);
  } catch (e) {
    return NextResponse.json({ error: '이미지 처리 실패', message: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  // ★ Storage 키는 ASCII 만 — 한글 파일명("테스트 표지.png")은 Storage 가 400 Invalid key 로 거부한다(실측 09-19).
  const safe = (body.name || 'cover').replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'cover';
  const path = `${prefixOf(s.instituteId)}${Date.now()}-${safe}.webp`;
  const { error } = await s.admin.storage.from(BUCKET).upload(path, out, { contentType: 'image/webp', upsert: false });
  if (error) return NextResponse.json({ error: 'Storage upload failed', message: error.message }, { status: 502 });
  const { data: u } = s.admin.storage.from(BUCKET).getPublicUrl(path);
  const item: CoverAsset = { name: safe, path, url: u?.publicUrl ?? '', size: out.length, createdAt: new Date().toISOString() };
  return NextResponse.json({ item, width, height });
}

/** DELETE — { path } 이 센터 폴더 안의 것만 */
export async function DELETE(req: NextRequest) {
  const s = await scope();
  if ('error' in s) return s.error;
  let body: { path?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const path = body.path || '';
  if (!path.startsWith(prefixOf(s.instituteId)) || path.includes('..')) {
    return NextResponse.json({ error: '이 센터의 표지가 아닙니다' }, { status: 400 });
  }
  const { error } = await s.admin.storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
