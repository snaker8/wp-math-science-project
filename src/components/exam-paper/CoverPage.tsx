'use client';

// 시험지 표지 — 인쇄 첫 장.
//
// 왜 이렇게 생겼나 (2026-09-19, 대표): "표지는 구글에서 제미나이로 얼마든지 감각있는 거 만들어 넣을 수 있으니".
//   → 디자인을 코드로 수십 종 베끼지 않는다. 밖에서 만든 A4 이미지를 **슬롯**에 넣고, 제목·학원·문항수·
//     이름칸 같은 **글자만 우리가 얹는다**. 이미지가 없을 때 쓸 글자 표지 4종은 최소로 둔다.
//   매쓰플랫(캡처 chunk_MakeCustomWorkbook)의 표지 데이터 항목 = title · subtitle · academyName · studentName.
//   우리 항목도 그 넷 + 문항수·출제·시험일·점수칸. 그 이상은 만들지 않는다.
//
// 인쇄: `.exam-page.exam-cover` — 패딩 0(전면 이미지). ExamPaperView 의 @media print 에서 예외 처리.
import React, { useEffect, useRef, useState } from 'react';
import type { ExamMeta } from '@/config/exam-templates';

export type CoverDesign = 'minimal' | 'classic' | 'band' | 'grid' | 'image-band' | 'image-full';

export type CoverSettings = {
  on: boolean;
  design: CoverDesign;
  /** 올린 표지 이미지(공개 URL). 이미지 디자인에서만 쓴다 */
  imageUrl: string | null;
  /** 전면 이미지 위에 제목 띠를 얹을지 (Gemini 표지에 제목이 이미 그려져 있으면 끈다) */
  overlay: boolean;
  /** 표지 하단 한 줄 안내 (예: "채점 후 오답 유형을 표시하세요") */
  note: string;
};

export const DEFAULT_COVER: CoverSettings = { on: false, design: 'minimal', imageUrl: null, overlay: true, note: '' };

export const COVER_DESIGNS: Array<{ id: CoverDesign; label: string; hint: string; image: boolean }> = [
  { id: 'minimal', label: '미니멀', hint: '흰 바탕 · 제목 · 가는 선 · 이름칸', image: false },
  { id: 'classic', label: '클래식', hint: '이중 테두리 · 가운데 제목 · 정보표', image: false },
  { id: 'band', label: '밴드', hint: '상단 색 띠 안에 제목', image: false },
  { id: 'grid', label: '격자', hint: '점 격자 바탕 · 왼쪽 정렬', image: false },
  { id: 'image-band', label: '이미지+글', hint: '위 60% 이미지 · 아래 제목·이름칸', image: true },
  { id: 'image-full', label: '이미지 전면', hint: '이미지가 한 장 전체 · 제목 띠 선택', image: true },
];

export type CoverAsset = { name: string; path: string; url: string; size: number; createdAt: string | null };

// ─────────────────────────────────────────────────────────────────────────────
// 표지 한 장
// ─────────────────────────────────────────────────────────────────────────────
export function CoverPage({
  settings, examTitle, meta, problemCount, accent, width, height,
}: {
  settings: CoverSettings;
  examTitle: string;
  meta: ExamMeta;
  problemCount: number;
  /** 헤더 강조색(없으면 슬레이트) */
  accent: string | null;
  width: number;
  height: number;
}) {
  const color = accent || '#334155';
  const subtitle = [meta.grade, meta.semester, meta.subject, meta.examType].filter(Boolean).join(' · ');
  const academy = meta.schoolName || '';
  const info: Array<[string, string]> = [
    ['문항수', problemCount > 0 ? `${problemCount}문항` : ''],
    ['출제', meta.teacher || ''],
    ['시험일', meta.date || ''],
    ['시간', meta.timeLimit || ''],
  ].filter(([, v]) => !!v) as Array<[string, string]>;
  const font = "'Pretendard', 'Noto Sans KR', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

  const Blanks = ({ dark }: { dark?: boolean }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
      {[['반', meta.className || ''], ['이름', ''], ['점수', '']].map(([k, v]) => (
        <div key={k} style={{ flex: k === '이름' ? 2 : 1, border: `1px solid ${dark ? 'rgba(255,255,255,.7)' : '#94a3b8'}`, borderRadius: 4, padding: '8px 10px', minHeight: 44, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, letterSpacing: '.08em', color: dark ? 'rgba(255,255,255,.85)' : '#64748b' }}>{k}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: dark ? '#fff' : '#0f172a', minHeight: 16 }}>{v}</span>
        </div>
      ))}
    </div>
  );
  const InfoRows = ({ dark }: { dark?: boolean }) => info.length === 0 ? null : (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12, color: dark ? 'rgba(255,255,255,.9)' : '#475569' }}>
      {info.map(([k, v]) => (
        <span key={k}><span style={{ opacity: .7, marginRight: 6 }}>{k}</span><b style={{ fontWeight: 600 }}>{v}</b></span>
      ))}
    </div>
  );
  const Note = ({ dark }: { dark?: boolean }) => settings.note.trim() ? (
    <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: dark ? 'rgba(255,255,255,.85)' : '#64748b', whiteSpace: 'pre-wrap' }}>{settings.note.trim()}</p>
  ) : null;
  const Placeholder = () => (
    <div className="print:hidden" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, background: 'repeating-linear-gradient(45deg,#f8fafc,#f8fafc 10px,#f1f5f9 10px,#f1f5f9 20px)' }}>
      표지 이미지를 고르거나 올리세요 (A4 세로, 예: 1240×1754px)
    </div>
  );

  const pageStyle: React.CSSProperties = {
    width, minHeight: height, height, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', padding: 0,
    background: '#fff', fontFamily: font, boxShadow: '0 4px 24px rgba(0,0,0,0.35)', borderRadius: 4, marginBottom: 24,
    color: '#0f172a',
  };
  const PADX = 64; const PADY = 72;

  let body: React.ReactNode;
  switch (settings.design) {
    case 'classic':
      body = (
        <div style={{ position: 'absolute', inset: 36, border: `3px double ${color}`, padding: '48px 48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'center' }}>
          <div style={{ fontSize: 13, letterSpacing: '.3em', color: '#64748b' }}>{academy}</div>
          <div>
            <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.3, wordBreak: 'keep-all' }}>{examTitle}</div>
            {subtitle && <div style={{ marginTop: 14, fontSize: 15, color: '#475569' }}>{subtitle}</div>}
            <div style={{ width: 56, height: 3, background: color, margin: '28px auto 0' }} />
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}><InfoRows /></div>
          </div>
          <div style={{ textAlign: 'left', display: 'grid', gap: 14 }}><Note /><Blanks /></div>
        </div>
      );
      break;
    case 'band':
      body = (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '38%', boxSizing: 'border-box', background: color, color: '#fff', padding: `${PADY}px ${PADX}px 40px`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 13, letterSpacing: '.2em', opacity: .85, marginBottom: 18 }}>{academy}</div>
            <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.25, wordBreak: 'keep-all' }}>{examTitle}</div>
            {subtitle && <div style={{ marginTop: 12, fontSize: 15, opacity: .9 }}>{subtitle}</div>}
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '38%', bottom: 0, padding: `40px ${PADX}px ${PADY}px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <InfoRows />
            <div style={{ display: 'grid', gap: 14 }}><Note /><Blanks /></div>
          </div>
        </>
      );
      break;
    case 'grid':
      body = (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '18px 18px', padding: `${PADY}px ${PADX}px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, letterSpacing: '.2em', color: '#64748b' }}>{academy}</div>
          <div style={{ borderLeft: `6px solid ${color}`, paddingLeft: 22, background: 'rgba(255,255,255,.9)', paddingTop: 8, paddingBottom: 8 }}>
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.25, wordBreak: 'keep-all' }}>{examTitle}</div>
            {subtitle && <div style={{ marginTop: 12, fontSize: 15, color: '#475569' }}>{subtitle}</div>}
            <div style={{ marginTop: 18 }}><InfoRows /></div>
          </div>
          <div style={{ display: 'grid', gap: 14, background: 'rgba(255,255,255,.9)', padding: '10px 0' }}><Note /><Blanks /></div>
        </div>
      );
      break;
    case 'image-band':
      body = (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '60%', background: '#f1f5f9' }}>
            {settings.imageUrl
              ? <img src={settings.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', maxHeight: 'none' }} />
              : <Placeholder />}
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '60%', bottom: 0, padding: `34px ${PADX}px 56px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '.2em', color: '#64748b', marginBottom: 10 }}>{academy}</div>
              <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.25, wordBreak: 'keep-all' }}>{examTitle}</div>
              {subtitle && <div style={{ marginTop: 8, fontSize: 14, color: '#475569' }}>{subtitle}</div>}
              <div style={{ marginTop: 12 }}><InfoRows /></div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}><Note /><Blanks /></div>
          </div>
        </>
      );
      break;
    case 'image-full':
      body = (
        <>
          <div style={{ position: 'absolute', inset: 0, background: '#f1f5f9' }}>
            {settings.imageUrl
              ? <img src={settings.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', maxHeight: 'none' }} />
              : <Placeholder />}
          </div>
          {settings.overlay && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,.72)', color: '#fff', padding: `28px ${PADX}px 40px`, display: 'grid', gap: 14 }}>
              <div>
                {academy && <div style={{ fontSize: 12, letterSpacing: '.2em', opacity: .85, marginBottom: 8 }}>{academy}</div>}
                <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.25, wordBreak: 'keep-all' }}>{examTitle}</div>
                {subtitle && <div style={{ marginTop: 6, fontSize: 14, opacity: .9 }}>{subtitle}</div>}
                <div style={{ marginTop: 10 }}><InfoRows dark /></div>
              </div>
              <Note dark />
              <Blanks dark />
            </div>
          )}
        </>
      );
      break;
    default: // minimal
      body = (
        <div style={{ position: 'absolute', inset: 0, padding: `${PADY}px ${PADX}px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, letterSpacing: '.2em', color: '#64748b' }}>{academy}</div>
          <div style={{ marginTop: -80 }}>
            <div style={{ width: 40, height: 3, background: color, marginBottom: 26 }} />
            <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.22, wordBreak: 'keep-all', letterSpacing: '-0.01em' }}>{examTitle}</div>
            {subtitle && <div style={{ marginTop: 14, fontSize: 16, color: '#475569' }}>{subtitle}</div>}
            <div style={{ marginTop: 24 }}><InfoRows /></div>
          </div>
          <div style={{ display: 'grid', gap: 14 }}><Note /><Blanks /></div>
        </div>
      );
  }

  return (
    <div className="exam-page exam-cover bg-white" data-cover="1" style={pageStyle}>
      {body}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 옵션 패널 — 디자인 고르기 · 이미지 라이브러리(올리기/삭제) · 제목 띠 · 안내문
// ─────────────────────────────────────────────────────────────────────────────
export function CoverPanel({ value, onChange }: { value: CoverSettings; onChange: (next: CoverSettings) => void }) {
  const [items, setItems] = useState<CoverAsset[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isImage = COVER_DESIGNS.find((d) => d.id === value.design)?.image ?? false;

  const load = async () => {
    try {
      const r = await fetch('/api/print/covers', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      setItems(j.items as CoverAsset[]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setItems([]); }
  };
  useEffect(() => { if (isImage && items === null) void load(); }, [isImage, items]);

  const upload = async (file: File) => {
    setErr(null); setBusy('올리는 중…');
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file);
      });
      const r = await fetch('/api/print/covers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64, name: file.name }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || j.message || r.statusText);
      const item = j.item as CoverAsset;
      setItems((prev) => [item, ...(prev ?? [])]);
      onChange({ ...value, imageUrl: item.url });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };
  const remove = async (it: CoverAsset) => {
    // ★ confirm() 금지(자동화 탭 멈춤) — 두 번 눌러 지우는 방식
    if (busy !== `del:${it.path}`) { setBusy(`del:${it.path}`); setTimeout(() => setBusy((b) => (b === `del:${it.path}` ? null : b)), 2500); return; }
    setBusy(null);
    try {
      const r = await fetch('/api/print/covers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: it.path }) });
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      setItems((prev) => (prev ?? []).filter((x) => x.path !== it.path));
      if (value.imageUrl === it.url) onChange({ ...value, imageUrl: null });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const chip = (on: boolean) => `rounded-md border px-2 py-1 text-xs transition-colors ${on ? 'border-white/25 bg-white/10 text-content-primary' : 'border-zinc-700 text-content-tertiary hover:text-content-primary'}`;

  return (
    <div className="flex w-[420px] flex-col gap-3 text-xs">
      <div className="flex flex-wrap gap-1.5">
        {COVER_DESIGNS.map((d) => (
          <button key={d.id} type="button" title={d.hint} onClick={() => onChange({ ...value, design: d.id })} className={chip(value.design === d.id)}>{d.label}</button>
        ))}
      </div>
      {isImage && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-2">
          <div className="flex items-center justify-between">
            <span className="text-content-secondary">표지 이미지 — 이 센터 라이브러리</span>
            <label className="cursor-pointer rounded-md bg-white px-2 py-1 font-semibold text-black hover:bg-white/90">
              {busy && !busy.startsWith('del:') ? busy : '이미지 올리기'}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" disabled={!!busy && !busy.startsWith('del:')}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            </label>
          </div>
          <p className="text-[10px] leading-relaxed text-content-tertiary">
            Gemini·캔바 등에서 만든 <b>A4 세로</b> 이미지(예: 1240×1754px)를 올리면 2480px WebP 로 정리해 보관합니다. 제목·이름칸은 여기서 얹으니 그림엔 글자를 넣지 않아도 됩니다. 보관 이름은 영문·숫자만 남습니다.
          </p>
          {err && <p className="text-[11px] text-red-400">{err}</p>}
          <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1">
            {items === null && <span className="col-span-4 text-content-tertiary">불러오는 중…</span>}
            {items && items.length === 0 && <span className="col-span-4 text-content-tertiary">아직 올린 표지가 없습니다.</span>}
            {items?.map((it) => {
              const sel = value.imageUrl === it.url;
              const arming = busy === `del:${it.path}`;
              return (
                <div key={it.path} className="group relative">
                  <button type="button" onClick={() => onChange({ ...value, imageUrl: sel ? null : it.url })} title={it.name}
                    className={`block w-full overflow-hidden rounded-md border ${sel ? 'border-white ring-2 ring-white/40' : 'border-white/10 hover:border-white/30'}`}
                    style={{ aspectRatio: '210 / 297', background: '#1f1f23' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.url} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                  <button type="button" onClick={() => void remove(it)} title={arming ? '한 번 더 누르면 삭제' : '삭제'}
                    className={`absolute right-1 top-1 rounded px-1 text-[10px] leading-4 ${arming ? 'bg-red-500 text-white' : 'bg-black/70 text-white opacity-0 group-hover:opacity-100'}`}>
                    {arming ? '삭제?' : '×'}
                  </button>
                  <div className="mt-0.5 truncate text-[10px] text-content-tertiary">{it.name}</div>
                </div>
              );
            })}
          </div>
          {value.design === 'image-full' && (
            <label className="flex items-center gap-2 text-content-secondary">
              <input type="checkbox" checked={value.overlay} onChange={(e) => onChange({ ...value, overlay: e.target.checked })} />
              이미지 위에 제목·이름칸 띠 얹기 (그림에 제목이 이미 있으면 끄세요)
            </label>
          )}
        </div>
      )}
      <label className="flex flex-col gap-1 text-content-secondary">
        <span>표지 안내문 (선택)</span>
        <textarea value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} rows={2} placeholder="예: 풀이는 문제 옆 여백에, 채점 후 오답 유형을 표시하세요."
          className="rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-content-primary placeholder:text-content-tertiary focus:border-white/30 focus:outline-none" />
      </label>
      <p className="text-[10px] text-content-tertiary">제목·학원·출제·시험일·문항수는 헤더 정보에서 가져옵니다. 표지는 페이지 번호에 세지 않고, 양면이면 짝 계산에 넣습니다. 한글(.hwpx) 내보내기엔 아직 없습니다.</p>
    </div>
  );
}
