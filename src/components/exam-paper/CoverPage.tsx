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
import { coverLayoutFor, COVER_FONT_FAMILY, COVER_FONT_HREF, COVER_FONT_OPTIONS, type CoverEl, type CoverFont } from './cover-layouts';

/** 굵기 단계 — 「기본」 다음부터 가늘게 → 아주 굵게 */
const WEIGHT_OPTIONS: Array<{ w: number; label: string }> = [
  { w: 300, label: '가늘게' }, { w: 400, label: '보통' }, { w: 500, label: '약간 굵게' },
  { w: 700, label: '굵게' }, { w: 900, label: '아주 굵게' },
];

export type CoverDesign = 'minimal' | 'classic' | 'band' | 'grid' | 'core' | 'image-band' | 'image-full';

export type CoverSettings = {
  on: boolean;
  design: CoverDesign;
  /** 올린 표지 이미지(공개 URL). 이미지 디자인에서만 쓴다 */
  imageUrl: string | null;
  /** 전면 이미지 위에 제목 띠를 얹을지 (Gemini 표지에 제목이 이미 그려져 있으면 끈다) */
  overlay: boolean;
  /** 표지 하단 한 줄 안내 (예: "채점 후 오답 유형을 표시하세요") */
  note: string;
  /** 표지 제목을 시험지 제목과 다르게 쓰고 싶을 때 (빈값 = 시험지 제목). 2026-09-21 대표 요청 */
  title?: string;
  /** 부제목 덮어쓰기 (빈값 = 학년·학기·과목·유형 자동) */
  subtitle?: string;
  /** 표지 위 학원/학교명 덮어쓰기 (빈값 = 헤더의 학원/학교). 대표: "지금은 학교 등이 나온다" */
  academy?: string;
  /** 정보 줄 덮어쓰기 (빈값 = 문항수·출제·시험일·시간 자동). 대표: "문항수도 지금 고정되어 있다" — 예: "25문항 · 50분" */
  infoText?: string;
  /** 제목 글자 크기 배율 (1 = 기본). 대표 「텍스트 크기도 조절 가능했으면」(2026-11-03) */
  titleScale?: number;
  /** 제목 외 글자(부제목·학원명·정보 줄·안내문) 크기 배율 */
  textScale?: number;
  /** 제목 글자색 (빈값 = 디자인 기본색). 대표 「텍스트 색을 바꿀 수 있게」(2026-11-03) */
  titleColor?: string;
  /** 제목 외 글자(부제목·학원명·정보 줄·안내문) 색 (빈값 = 디자인 기본색) */
  textColor?: string;
  /** 글자별 크기 배율 (전체 배율에 곱함). 대표 「글자마다 옆에 +- 붙이면 된다」(2026-11-03) */
  fieldScale?: Partial<Record<CoverTextField, number>>;
  /** 글자별 색 (전체 색보다 우선). 대표 「색도 여러 가지로」 */
  fieldColor?: Partial<Record<CoverTextField, string>>;
  /** 글자별 글씨체 (없으면 디자인 기본). 대표 「표지 만들때 텍스트 글씨체 변경 굵기 조절」(2026-11-22) */
  fieldFont?: Partial<Record<CoverTextField, CoverFont>>;
  /** 글자별 굵기 100~900 (없으면 디자인 기본) */
  fieldWeight?: Partial<Record<CoverTextField, number>>;
  /** ★ 뒷표지도 같이 (2026-11-28 대표 「표지를 출력할 때 앞뒤 표지 세트로」). undefined = 켜짐 */
  back?: boolean;
  /** 뒷표지 문구 (빈값이면 문구 없이 학원명·제목만) */
  backNote?: string;
};

export type CoverTextField = 'title' | 'subtitle' | 'academy' | 'info' | 'note';

export const DEFAULT_COVER: CoverSettings = { on: false, design: 'minimal', imageUrl: null, overlay: true, note: '', title: '', subtitle: '', academy: '', infoText: '' };

export const COVER_DESIGNS: Array<{ id: CoverDesign; label: string; hint: string; image: boolean }> = [
  { id: 'minimal', label: '미니멀', hint: '흰 바탕 · 제목 · 가는 선 · 이름칸', image: false },
  { id: 'classic', label: '클래식', hint: '이중 테두리 · 가운데 제목 · 정보표', image: false },
  { id: 'band', label: '밴드', hint: '상단 색 띠 안에 제목', image: false },
  { id: 'grid', label: '격자', hint: '점 격자 바탕 · 왼쪽 정렬', image: false },
  { id: 'core', label: '코어', hint: '강조색 전면 · 큰 제목 · 과녁 무늬 (책 표지, 이름칸 없음)', image: false },
  { id: 'image-band', label: '이미지+글', hint: '위 60% 이미지 · 아래 제목·이름칸', image: true },
  { id: 'image-full', label: '이미지 전면', hint: '이미지가 한 장 전체 · 제목 띠 선택', image: true },
];

/** 글자색 빠른 선택 (흰색 포함 — 어두운 그림 위) */
const TEXT_COLORS = [
  '#0f172a', '#475569', '#94a3b8', '#ffffff',
  '#1e3a8a', '#2563eb', '#0891b2', '#0f766e', '#16a34a',
  '#7c3aed', '#c026d3', '#db2777', '#be123c', '#dc2626',
  '#ea580c', '#b45309', '#ca8a04', '#78350f',
];

/** 글자 하나의 크기 +- · 색 — 입력칸 제목줄 오른쪽에 붙는다 */
function FieldTools({ field, value, onChange }: { field: CoverTextField; value: CoverSettings; onChange: (next: CoverSettings) => void }) {
  const [open, setOpen] = React.useState(false);
  const s = value.fieldScale?.[field] ?? 1;
  const c = (value.fieldColor?.[field] || '').trim();
  const setScale = (n: number) => onChange({ ...value, fieldScale: { ...value.fieldScale, [field]: Math.round(Math.min(3, Math.max(0.4, n)) * 10) / 10 } });
  const setColor = (v: string) => onChange({ ...value, fieldColor: { ...value.fieldColor, [field]: v } });
  const f = value.fieldFont?.[field];
  const w = value.fieldWeight?.[field];
  const setFont = (v: string) => {
    const next = { ...value.fieldFont };
    if (v) next[field] = v as CoverFont; else delete next[field];
    onChange({ ...value, fieldFont: next });
  };
  const setWeight = (v: string) => {
    const next = { ...value.fieldWeight };
    if (v) next[field] = Number(v); else delete next[field];
    onChange({ ...value, fieldWeight: next });
  };
  const sel = 'h-5 rounded border border-white/15 bg-zinc-900 px-1 text-[10px] text-content-secondary hover:text-content-primary focus:outline-none';
  const btn = 'flex h-5 w-5 items-center justify-center rounded border border-white/15 text-[11px] leading-none text-content-secondary hover:bg-white/10 hover:text-content-primary';
  return (
    <span className="ml-auto flex flex-col items-end gap-1">
      <span className="flex items-center gap-1">
        <select value={f || ''} onChange={(e) => setFont(e.target.value)} title="글씨체" className={sel}
          style={f ? { fontFamily: COVER_FONT_FAMILY[f] } : undefined}>
          <option value="">글씨체 기본</option>
          {COVER_FONT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select value={w ? String(w) : ''} onChange={(e) => setWeight(e.target.value)} title="굵기" className={sel}>
          <option value="">굵기 기본</option>
          {WEIGHT_OPTIONS.map((o) => <option key={o.w} value={o.w}>{o.label}</option>)}
        </select>
        <button type="button" className={btn} title="작게" onClick={(e) => { e.preventDefault(); setScale(s - 0.1); }}>−</button>
        <button type="button" title="기본 크기로" onClick={(e) => { e.preventDefault(); setScale(1); }}
          className="w-9 text-center text-[10px] tabular-nums text-content-tertiary hover:text-content-primary">{Math.round(s * 100)}%</button>
        <button type="button" className={btn} title="크게" onClick={(e) => { e.preventDefault(); setScale(s + 0.1); }}>+</button>
        <button type="button" title="글자색" onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
          className="ml-1 h-5 w-5 rounded border border-white/25"
          style={c ? { background: c } : { background: 'conic-gradient(#ef4444,#eab308,#22c55e,#3b82f6,#a855f7,#ef4444)' }} />
      </span>
      {open && (
        <span className="flex max-w-[230px] flex-wrap items-center justify-end gap-1">
          <button type="button" onClick={(e) => { e.preventDefault(); setColor(''); }}
            className={`rounded border px-1 py-0.5 text-[10px] ${!c ? 'border-white/40 text-content-primary' : 'border-white/15 text-content-tertiary'}`}>기본</button>
          {TEXT_COLORS.map((k) => (
            <button key={k} type="button" title={k} onClick={(e) => { e.preventDefault(); setColor(k); }}
              className={`h-4 w-4 rounded-full border ${c.toLowerCase() === k ? 'border-white ring-2 ring-white/40' : 'border-white/25'}`} style={{ background: k }} />
          ))}
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(c) ? c : '#000000'} onChange={(e) => setColor(e.target.value)}
            title="직접 고르기" className="h-5 w-6 cursor-pointer rounded border border-white/15 bg-transparent p-0" />
        </span>
      )}
    </span>
  );
}

/** 표지별 기본값에 담는 것 = 글자 모양만 (제목·학원명 같은 내용은 시험지마다 다르니 안 담는다) */
const COVER_STYLE_KEYS = ['titleScale', 'textScale', 'titleColor', 'textColor', 'fieldScale', 'fieldColor', 'fieldFont', 'fieldWeight', 'overlay'] as const;
type CoverStyle = Partial<Pick<CoverSettings, typeof COVER_STYLE_KEYS[number]>>;
function pickStyle(v: CoverSettings): CoverStyle {
  const o: Record<string, unknown> = {};
  for (const k of COVER_STYLE_KEYS) if (v[k] !== undefined) o[k] = v[k];
  return o as CoverStyle;
}
/** 글자 모양을 디자인 원래대로 (기본값 적용 전에 먼저 비운다) */
const STYLE_RESET: CoverStyle = { titleScale: undefined, textScale: undefined, titleColor: '', textColor: '', fieldScale: {}, fieldColor: {}, fieldFont: {}, fieldWeight: {} };
/** 표지 하나의 이름표 — 이미지 디자인은 「디자인 + 그림 파일」, 글자 디자인은 디자인만 */
export function coverDefaultKey(design: CoverDesign, imageUrl: string | null): string {
  const img = COVER_DESIGNS.find((d) => d.id === design)?.image ?? false;
  if (!img) return `design-${design}`;
  if (!imageUrl) return '';
  const base = (imageUrl.split('?')[0].split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_');
  return base ? `${design}--${base}`.slice(0, 120) : '';
}
type CoverDefaults = Record<string, { settings: CoverStyle; shared: boolean }>;

export type CoverAsset ={ name: string; path: string; url: string; size: number; createdAt: string | null; shared?: boolean };
export type CoverTemplate = { name: string; path: string; settings: Partial<CoverSettings>; createdAt: string | null };

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
  // ★ 제목·부제목은 표지에서 따로 쓸 수 있다 (빈값이면 시험지 제목 / 자동 부제목)
  examTitle = (settings.title || '').trim() || examTitle;
  const subtitle = (settings.subtitle || '').trim() || [meta.grade, meta.semester, meta.subject, meta.examType].filter(Boolean).join(' · ');
  const academy = (settings.academy || '').trim() || meta.schoolName || '';
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
  const infoOverride = (settings.infoText || '').trim();
  const TS = settings.titleScale ?? 1;
  const XS = settings.textScale ?? 1;
  /** 글자별 배율 = 전체(제목/나머지) × 그 글자 +- */
  const scaleOf = (f: CoverTextField) => (f === 'title' ? TS : XS) * (settings.fieldScale?.[f] ?? 1);
  const sz = (f: CoverTextField, n: number) => Math.round(n * scaleOf(f));
  // 글자색 — 글자별 색 > 전체(제목/나머지) 색 > 각 디자인의 기본색 (undefined = 부모색 상속)
  const TC = (settings.titleColor || '').trim() || undefined;
  const XC = (settings.textColor || '').trim() || undefined;
  const col = (f: CoverTextField, d?: string) => (settings.fieldColor?.[f] || '').trim() || (f === 'title' ? TC : XC) || d;
  // 글씨체·굵기 — 글자별 값 > 각 디자인의 기본 (undefined = 부모 상속)
  const fam = (f: CoverTextField, d?: CoverFont) => { const k = settings.fieldFont?.[f] || d; return k ? COVER_FONT_FAMILY[k] : undefined; };
  const tx = (f: CoverTextField, dWeight?: number): React.CSSProperties => ({ fontFamily: fam(f), fontWeight: settings.fieldWeight?.[f] ?? dWeight });
  const InfoRows = ({ dark }: { dark?: boolean }) => infoOverride ? (
    <div style={{ fontSize: sz('info', 12), ...tx('info'), color: col('info', dark ? 'rgba(255,255,255,.9)' : '#475569'), whiteSpace: 'pre-wrap' }}>{infoOverride}</div>
  ) : null; /* ★ 2026-11-03 대표: 비우면 아무것도 안 넣는다 (문항수·출제·시험일 자동 채움 폐지) */
  const Note = ({ dark }: { dark?: boolean }) => settings.note.trim() ? (
    <p style={{ margin: 0, fontSize: sz('note', 11), ...tx('note'), lineHeight: 1.6, color: col('note', dark ? 'rgba(255,255,255,.85)' : '#64748b'), whiteSpace: 'pre-wrap' }}>{settings.note.trim()}</p>
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
  /** 공용 표지 이미지면 그 그림의 빈 자리 (없으면 null → 아래 띠) */
  const slot = settings.design === 'image-full' ? coverLayoutFor(settings.imageUrl) : null;

  let body: React.ReactNode;
  switch (settings.design) {
    case 'core': {
      // ★ 코어 표지 (2026-11-26 대표 「코어 시리즈 교재 표지 멋진 거」→「사이트에도 넣어라」)
      //   강조색 전면 바탕 + 모눈 + 큰 제목 + 오른쪽 아래 과녁(겹친 원·눈금·가운데 점). 이름칸 없음(책 표지).
      //   바탕이 밝으면 글자 검정, 어두우면 흰색 — 강조색 하나로 옐로우·블루·블랙이 다 나온다.
      const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : '#0e0f12';
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const light = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150;
      const ink = light ? '#1b1b1b' : '#ffffff';
      const sub = light ? 'rgba(27,27,27,.72)' : 'rgba(255,255,255,.72)';
      const ring = light ? 'rgba(27,27,27,.16)' : 'rgba(255,255,255,.16)';
      const grid = light ? 'rgba(27,27,27,.06)' : 'rgba(255,255,255,.05)';
      const dot = light ? '#1b1b1b' : '#ffffff';
      const ticks = Array.from({ length: 72 }, (_, k) => {
        const a = (k * 5 * Math.PI) / 180; const r2 = k % 6 ? 104 : 99;
        return <line key={k} x1={115 + 108 * Math.cos(a)} y1={115 + 108 * Math.sin(a)} x2={115 + r2 * Math.cos(a)} y2={115 + r2 * Math.sin(a)} stroke={ring} strokeWidth={0.6} />;
      });
      const info = infoOverride ? infoOverride.split(/\s*[·,|]\s*|\n/).filter(Boolean).slice(0, 4) : [];
      body = (
        <div style={{ position: 'absolute', inset: 0, background: hex, color: ink }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${grid} 1px,transparent 1px),linear-gradient(90deg,${grid} 1px,transparent 1px)`, backgroundSize: '38px 38px' }} />
          <svg viewBox="0 0 230 230" style={{ position: 'absolute', right: -265, bottom: -150, width: 870, height: 870 }} aria-hidden>
            {[108, 92, 76, 60, 44, 28].map((r, i) => <circle key={r} cx={115} cy={115} r={r} fill="none" stroke={ring} strokeWidth={i % 2 ? 1.4 : 0.7} />)}
            {ticks}
            <circle cx={115} cy={115} r={14} fill={dot} />
          </svg>
          <div style={{ position: 'absolute', left: 68, right: 68, top: 60, display: 'flex', justifyContent: 'space-between', fontSize: sz('academy', 12), ...tx('academy', 700), letterSpacing: '.28em', color: col('academy', sub) }}>
            <span>{academy}</span>
          </div>
          <div style={{ position: 'absolute', left: 68, top: 106, width: 84, height: 8, background: ink }} />
          <div style={{ position: 'absolute', left: 60, right: 68, top: 150 }}>
            <div style={{ fontSize: sz('title', 96), ...tx('title', 900), letterSpacing: '-.03em', lineHeight: 1.02, color: col('title'), wordBreak: 'keep-all' }}>{examTitle}</div>
            {subtitle && <div style={{ marginTop: 22, marginLeft: 6, fontSize: sz('subtitle', 30), ...tx('subtitle', 800), letterSpacing: '-.01em', color: col('subtitle'), wordBreak: 'keep-all' }}>{subtitle}</div>}
          </div>
          {settings.note.trim() && (
            <p style={{ position: 'absolute', left: 68, top: 470, width: 400, margin: 0, fontSize: sz('note', 15), ...tx('note'), lineHeight: 1.65, color: col('note', sub), wordBreak: 'keep-all', whiteSpace: 'pre-wrap' }}>{settings.note.trim()}</p>
          )}
          {info.length > 0 && (
            <div style={{ position: 'absolute', left: 68, top: 580, display: 'flex', gap: 10, flexWrap: 'wrap', maxWidth: 460 }}>
              {info.map((t) => <span key={t} style={{ border: `1.5px solid ${col('info', ink)}`, color: col('info', ink), borderRadius: 999, padding: '6px 16px', fontSize: sz('info', 13), ...tx('info', 700) }}>{t}</span>)}
            </div>
          )}
        </div>
      );
      break;
    }
    case 'classic':
      body = (
        <div style={{ position: 'absolute', inset: 36, border: `3px double ${color}`, padding: '48px 48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'center' }}>
          <div style={{ fontSize: sz('academy', 13), ...tx('academy'), letterSpacing: '.3em', color: col('academy', '#64748b') }}>{academy}</div>
          <div>
            <div style={{ fontSize: sz('title', 34), ...tx('title', 800), lineHeight: 1.3, color: col('title'), wordBreak: 'keep-all' }}>{examTitle}</div>
            {subtitle && <div style={{ marginTop: 14, fontSize: sz('subtitle', 15), ...tx('subtitle'), color: col('subtitle', '#475569') }}>{subtitle}</div>}
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
            <div style={{ fontSize: sz('academy', 13), ...tx('academy'), letterSpacing: '.2em', opacity: col('academy') ? 1 : .85, color: col('academy'), marginBottom: 18 }}>{academy}</div>
            <div style={{ fontSize: sz('title', 36), ...tx('title', 800), lineHeight: 1.25, color: col('title'), wordBreak: 'keep-all' }}>{examTitle}</div>
            {subtitle && <div style={{ marginTop: 12, fontSize: sz('subtitle', 15), ...tx('subtitle'), opacity: col('subtitle') ? 1 : .9, color: col('subtitle') }}>{subtitle}</div>}
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
          <div style={{ fontSize: sz('academy', 13), ...tx('academy'), letterSpacing: '.2em', color: col('academy', '#64748b') }}>{academy}</div>
          <div style={{ borderLeft: `6px solid ${color}`, paddingLeft: 22, background: 'rgba(255,255,255,.9)', paddingTop: 8, paddingBottom: 8 }}>
            <div style={{ fontSize: sz('title', 38), ...tx('title', 800), lineHeight: 1.25, color: col('title'), wordBreak: 'keep-all' }}>{examTitle}</div>
            {subtitle && <div style={{ marginTop: 12, fontSize: sz('subtitle', 15), ...tx('subtitle'), color: col('subtitle', '#475569') }}>{subtitle}</div>}
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
              ? <img src={settings.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block', maxHeight: 'none' }} />
              : <Placeholder />}
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '60%', bottom: 0, padding: `34px ${PADX}px 56px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: sz('academy', 12), ...tx('academy'), letterSpacing: '.2em', color: col('academy', '#64748b'), marginBottom: 10 }}>{academy}</div>
              <div style={{ fontSize: sz('title', 30), ...tx('title', 800), lineHeight: 1.25, color: col('title'), wordBreak: 'keep-all' }}>{examTitle}</div>
              {subtitle && <div style={{ marginTop: 8, fontSize: sz('subtitle', 14), ...tx('subtitle'), color: col('subtitle', '#475569') }}>{subtitle}</div>}
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
              ? <img src={settings.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: slot && settings.overlay ? 'fill' : 'cover', objectPosition: 'center top', display: 'block', maxHeight: 'none' }} data-fill={slot && settings.overlay ? '1' : undefined} />
              : <Placeholder />}
          </div>
          {settings.overlay && slot && (() => {
            // ★ 원본 표지의 글자 자리·색·크기·글꼴 그대로 (cover-layouts.ts) — 띠로 그림을 덮지 않는다
            const infoText = infoOverride;
            const textOf = (el: CoverEl): string => {
              switch (el.field) {
                case 'title': return examTitle;
                case 'subtitle': return subtitle;
                case 'info': return infoText;
                case 'academy': return academy;
                case 'note': return settings.note.trim();
                default: return el.text || '';
              }
            };
            return (
              <>
                {slot.card && (
                  <div style={{ position: 'absolute', left: `${slot.card.x}%`, top: `${slot.card.y}%`, width: `${slot.card.w}%`, height: `${slot.card.h}%`,
                    background: 'rgba(255,255,255,.94)', border: `3px solid ${slot.card.border}`, borderRadius: 999, boxShadow: '0 4px 18px rgba(0,0,0,.08)' }} />
                )}
                {slot.els.map((el, i) => {
                  const t = textOf(el);
                  if (!t) return null;
                  const pos: React.CSSProperties = el.anchor === 'right'
                    ? { right: `${100 - el.x}%`, textAlign: 'right' }
                    : el.anchor === 'center'
                      ? { left: `${el.x}%`, transform: 'translateX(-50%)', textAlign: 'center' }
                      : { left: `${el.x}%`, textAlign: 'left' };
                  return (
                    <div key={i} style={{
                      position: 'absolute', top: `${el.y}%`, ...pos,
                      ...(el.w ? { width: `${el.w}%` } : { whiteSpace: 'nowrap' }),
                      fontSize: el.field === 'static' ? el.size : sz(el.field, el.size), fontWeight: el.field === 'static' ? el.weight : (settings.fieldWeight?.[el.field] ?? el.weight), color: el.field === 'static' ? el.color : col(el.field, el.color), letterSpacing: el.ls, lineHeight: el.lh ?? 1.25,
                      fontFamily: el.field === 'static' ? (el.font ? COVER_FONT_FAMILY[el.font] : undefined) : fam(el.field, el.font), wordBreak: 'keep-all', whiteSpace: el.w ? 'pre-wrap' : 'nowrap',
                      ...(el.vertical ? { writingMode: 'vertical-rl', textOrientation: 'upright', width: 'auto' } : {}),
                      ...(el.stroke ? { WebkitTextStroke: `6px ${el.stroke}`, paintOrder: 'stroke fill' } : {}),
                    }}>
                      {el.bar || el.chip
                        ? <span style={{ display: el.bar ? 'block' : 'inline-block', background: el.bar || el.chip, padding: el.bar ? '3px 10px' : '4px 12px', borderRadius: el.chip ? 4 : 0, textAlign: el.bar ? 'center' : undefined }}>{t}</span>
                        : t}
                    </div>
                  );
                })}
              </>
            );
          })()}
          {settings.overlay && !slot && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,.72)', color: '#fff', padding: `28px ${PADX}px 40px`, display: 'grid', gap: 14 }}>
              <div>
                {academy && <div style={{ fontSize: sz('academy', 12), ...tx('academy'), letterSpacing: '.2em', opacity: col('academy') ? 1 : .85, color: col('academy'), marginBottom: 8 }}>{academy}</div>}
                <div style={{ fontSize: sz('title', 28), ...tx('title', 800), lineHeight: 1.25, color: col('title'), wordBreak: 'keep-all' }}>{examTitle}</div>
                {subtitle && <div style={{ marginTop: 6, fontSize: sz('subtitle', 14), ...tx('subtitle'), opacity: col('subtitle') ? 1 : .9, color: col('subtitle') }}>{subtitle}</div>}
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
          <div style={{ fontSize: sz('academy', 13), ...tx('academy'), letterSpacing: '.2em', color: col('academy', '#64748b') }}>{academy}</div>
          <div style={{ marginTop: -80 }}>
            <div style={{ width: 40, height: 3, background: color, marginBottom: 26 }} />
            <div style={{ fontSize: sz('title', 40), ...tx('title', 800), lineHeight: 1.22, color: col('title'), wordBreak: 'keep-all', letterSpacing: '-0.01em' }}>{examTitle}</div>
            {subtitle && <div style={{ marginTop: 14, fontSize: sz('subtitle', 16), ...tx('subtitle'), color: col('subtitle', '#475569') }}>{subtitle}</div>}
            <div style={{ marginTop: 24 }}><InfoRows /></div>
          </div>
          <div style={{ display: 'grid', gap: 14 }}><Note /><Blanks /></div>
        </div>
      );
  }

  return (
    <div className="exam-page exam-cover bg-white" data-cover="1" style={pageStyle}>
      <link rel="stylesheet" href={COVER_FONT_HREF} />
      {body}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 뒷표지 한 장 — 앞표지와 같은 디자인 언어(색·바탕·무늬)로, 문구·학원명·제목만.
//   2026-11-28 대표 「표지를 출력할 때도 앞뒤 표지 세트로」.
//   인쇄에선 ExamPaperView.buildPrintRoot 가 맨 끝으로 옮긴다(빠른답·해설을 같이 뽑아도 마지막 장).
// ─────────────────────────────────────────────────────────────────────────────
export function CoverBackPage({
  settings, examTitle, meta, accent, width, height,
}: {
  settings: CoverSettings;
  examTitle: string;
  meta: ExamMeta;
  accent: string | null;
  width: number;
  height: number;
}) {
  const color = accent || '#334155';
  const title = (settings.title || '').trim() || examTitle;
  const subtitle = (settings.subtitle || '').trim() || [meta.grade, meta.semester, meta.subject, meta.examType].filter(Boolean).join(' · ');
  const academy = (settings.academy || '').trim() || meta.schoolName || '';
  const note = (settings.backNote || '').trim();
  const font = "'Pretendard', 'Noto Sans KR', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  const pageStyle: React.CSSProperties = {
    width, minHeight: height, height, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', padding: 0,
    background: '#fff', fontFamily: font, boxShadow: '0 4px 24px rgba(0,0,0,0.35)', borderRadius: 4, marginTop: 24, marginBottom: 24,
    color: '#0f172a',
  };

  let body: React.ReactNode;
  if (settings.design === 'core') {
    // 앞표지 core 와 같은 색 판정 · 모눈 · 과녁 (앞은 오른쪽 아래, 뒤는 오른쪽 위에 흐리게)
    const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : '#0e0f12';
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const light = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150;
    const ink = light ? '#1b1b1b' : '#ffffff';
    const sub = light ? 'rgba(27,27,27,.72)' : 'rgba(255,255,255,.72)';
    const ring = light ? 'rgba(27,27,27,.12)' : 'rgba(255,255,255,.12)';
    const grid = light ? 'rgba(27,27,27,.06)' : 'rgba(255,255,255,.05)';
    body = (
      <div style={{ position: 'absolute', inset: 0, background: hex, color: ink }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${grid} 1px,transparent 1px),linear-gradient(90deg,${grid} 1px,transparent 1px)`, backgroundSize: '38px 38px' }} />
        <svg viewBox="0 0 230 230" style={{ position: 'absolute', right: -300, top: -300, width: 720, height: 720 }} aria-hidden>
          {[108, 92, 76, 60, 44, 28].map((r, i) => <circle key={r} cx={115} cy={115} r={r} fill="none" stroke={ring} strokeWidth={i % 2 ? 1.4 : 0.7} />)}
          <circle cx={115} cy={115} r={14} fill={ink} opacity={0.5} />
        </svg>
        <div style={{ position: 'absolute', left: 68, top: 60, fontSize: 12, fontWeight: 700, letterSpacing: '.28em', color: sub }}>{academy}</div>
        <div style={{ position: 'absolute', left: 68, top: 106, width: 84, height: 8, background: ink }} />
        <div style={{ position: 'absolute', left: 68, right: 68, top: 150, fontSize: 34, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.15, wordBreak: 'keep-all' }}>{title}</div>
        {subtitle && <div style={{ position: 'absolute', left: 70, right: 68, top: 200, fontSize: 16, fontWeight: 700, color: sub, wordBreak: 'keep-all' }}>{subtitle}</div>}
        {note && <p style={{ position: 'absolute', left: 68, right: 68, top: 270, margin: 0, fontSize: 15, lineHeight: 1.75, color: ink, whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>{note}</p>}
        <div style={{ position: 'absolute', right: 68, bottom: 60, fontSize: 11, fontWeight: 700, letterSpacing: '.3em', color: sub }}>{academy}</div>
      </div>
    );
  } else {
    // 그 밖의 디자인 — 흰 바탕 + 강조색(띠형은 아래 띠) · 문구 · 학원명. 이미지 표지도 뒤는 글자만
    const band = settings.design === 'band' || settings.design === 'image-band' || settings.design === 'image-full';
    body = (
      <>
        {settings.design === 'classic' && <div style={{ position: 'absolute', inset: 36, border: `3px double ${color}` }} />}
        {settings.design === 'grid' && <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '18px 18px' }} />}
        <div style={{ position: 'absolute', left: 72, right: 72, top: 96 }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.3, wordBreak: 'keep-all' }}>{title}</div>
          {subtitle && <div style={{ marginTop: 8, fontSize: 14, color: '#475569' }}>{subtitle}</div>}
          <div style={{ width: 48, height: 3, background: color, marginTop: 20 }} />
          {note && <p style={{ marginTop: 28, fontSize: 14, lineHeight: 1.8, color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>{note}</p>}
        </div>
        {band
          ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, background: color, color: '#fff', display: 'flex', alignItems: 'center', padding: '0 72px', fontSize: 14, fontWeight: 700, letterSpacing: '.2em' }}>{academy}</div>
          : <div style={{ position: 'absolute', left: 72, right: 72, bottom: 72, borderTop: `1px solid ${color}`, paddingTop: 14, fontSize: 13, fontWeight: 700, letterSpacing: '.2em', color: '#475569' }}>{academy}</div>}
      </>
    );
  }

  return (
    <div className="exam-page exam-cover exam-back-cover bg-white" data-cover="back" style={pageStyle}>
      {body}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 옵션 패널 — 디자인 고르기 · 이미지 라이브러리(올리기/삭제) · 제목 띠 · 안내문
// ─────────────────────────────────────────────────────────────────────────────
export function CoverPanel({ value, onChange }: { value: CoverSettings; onChange: (next: CoverSettings) => void }) {
  const [items, setItems] = useState<CoverAsset[] | null>(null);
  // ★ 저장한 표지 — 시험지와 무관한 표지 묶음(디자인·이미지·제목·부제목·학원명·안내문). 센터 라이브러리에 JSON 으로.
  const [templates, setTemplates] = useState<CoverTemplate[] | null>(null);
  const [tplName, setTplName] = useState('');
  /** 운영자(super_admin) — 올린 이미지가 공용으로 가고, 공용 표지도 지울 수 있다 */
  const [canManageShared, setCanManageShared] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  /** 표지별 기본값 (공용 위에 센터 것) */
  const [defaults, setDefaults] = useState<CoverDefaults>({});
  const [defMsg, setDefMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isImage = COVER_DESIGNS.find((d) => d.id === value.design)?.image ?? false;
  /** 표지(디자인·그림)를 고를 때 — 그 표지 기본값이 있으면 글자 모양을 그걸로 시작 */
  const pick = (patch: Partial<CoverSettings>) => {
    const next = { ...value, ...patch };
    const d = defaults[coverDefaultKey(next.design, next.imageUrl)];
    onChange(d ? { ...next, ...STYLE_RESET, ...d.settings } : next);
  };
  // 처음 열 때 — 글자 모양을 아직 하나도 안 건드린 표지면 지금 표지의 기본값으로 시작
  const initApplied = useRef(false);
  useEffect(() => {
    if (initApplied.current || items === null) return;
    initApplied.current = true;
    const d = defaults[coverDefaultKey(value.design, value.imageUrl)];
    const untouched = Object.values(pickStyle({ ...value, overlay: undefined as unknown as boolean }))
      .every((v) => v === undefined || v === '' || v === 1 || (typeof v === 'object' && v !== null && Object.keys(v).length === 0));
    if (d && untouched) onChange({ ...value, ...STYLE_RESET, ...d.settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, defaults]);
  const curKey = coverDefaultKey(value.design, value.imageUrl);
  const curDef = curKey ? defaults[curKey] : undefined;
  const curShared = !!items?.find((x) => x.url === value.imageUrl)?.shared;
  /** 공용 그림의 기본값은 운영자만 정한다 */
  const canSaveDef = !!curKey && (canManageShared || !(isImage && curShared));
  const saveDefault = async () => {
    if (!canSaveDef) return;
    setErr(null); setBusy('기본값 저장 중…');
    try {
      const settings = pickStyle(value);
      const r = await fetch('/api/print/covers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coverDefault: { key: curKey, settings } }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || j.message || r.statusText);
      setDefaults((prev) => ({ ...prev, [curKey]: { settings, shared: j.shared === true } }));
      setDefMsg(j.shared ? '저장 — 모든 센터에서 이 표지를 고르면 이 모양으로 시작합니다' : '저장 — 이 센터에서 이 표지를 고르면 이 모양으로 시작합니다');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const clearDefault = async () => {
    if (!curDef || !canSaveDef) return;
    if (busy !== 'del:default') { setBusy('del:default'); setTimeout(() => setBusy((b) => (b === 'del:default' ? null : b)), 2500); return; }
    setBusy(null); setErr(null);
    try {
      const r = await fetch('/api/print/covers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coverDefaultKey: curKey }) });
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      await load(); // 센터 것을 지우면 공용 기본값이 다시 보일 수 있다
      onChange({ ...value, ...STYLE_RESET });
      setDefMsg('기본값을 지웠습니다 — 디자인 원래 모양');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const load = async () => {
    try {
      const r = await fetch('/api/print/covers', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      setItems(j.items as CoverAsset[]);
      setTemplates((j.templates as CoverTemplate[]) ?? []);
      setCanManageShared(j.canManageShared === true);
      setDefaults((j.defaults as CoverDefaults) ?? {});
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setItems([]); setTemplates([]); }
  };
  useEffect(() => { if (items === null) void load(); }, [items]);

  const saveTemplate = async () => {
    const name = tplName.trim(); if (!name) return;
    setErr(null); setBusy('표지 저장 중…');
    try {
      const { on: _on, ...settings } = value;
      const r = await fetch('/api/print/covers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: { name, settings } }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || j.message || r.statusText);
      setTemplates((prev) => [j.template as CoverTemplate, ...(prev ?? [])]);
      setTplName('');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const applyTemplate = (t: CoverTemplate) => onChange({ ...DEFAULT_COVER, ...t.settings, on: true });
  const removeTemplate = async (t: CoverTemplate) => {
    if (busy !== `del:${t.path}`) { setBusy(`del:${t.path}`); setTimeout(() => setBusy((b) => (b === `del:${t.path}` ? null : b)), 2500); return; }
    setBusy(null);
    try {
      const r = await fetch('/api/print/covers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: t.path }) });
      if (!r.ok) throw new Error((await r.json()).error || r.statusText);
      setTemplates((prev) => (prev ?? []).filter((x) => x.path !== t.path));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

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
      pick({ imageUrl: item.url });
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
    <div className="flex w-full flex-col gap-3 text-xs">
      {/* ★ 저장한 표지 — 어느 시험지에서든 만들어 두고 다른 시험지에 그대로 붙인다 */}
      <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-content-primary">저장한 표지</span>
          <span className="text-[10px] text-content-tertiary">이 센터 공용 · 시험지와 무관</span>
        </div>
        {templates === null && <span className="text-content-tertiary">불러오는 중…</span>}
        {templates && templates.length === 0 && <span className="text-content-tertiary">아직 없습니다. 아래에서 표지를 꾸민 뒤 이름을 붙여 저장하세요.</span>}
        {templates && templates.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => {
              const arming = busy === `del:${t.path}`;
              return (
                <span key={t.path} className="inline-flex items-center overflow-hidden rounded-md border border-white/[.14]">
                  <button type="button" onClick={() => applyTemplate(t)} title={`${t.settings.design ?? ''} · ${t.settings.title || '시험지 제목'}`}
                    className="px-2 py-1 text-content-secondary hover:bg-white/10 hover:text-content-primary">{t.name}</button>
                  <button type="button" onClick={() => void removeTemplate(t)} title={arming ? '한 번 더 누르면 삭제' : '삭제'}
                    className={`px-1.5 py-1 text-[10px] ${arming ? 'bg-red-500 text-white' : 'text-content-tertiary hover:text-content-primary'}`}>{arming ? '삭제?' : '×'}</button>
                </span>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <input type="text" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="지금 표지를 이름 붙여 저장 (예: 2학기 중간 대비)"
            onKeyDown={(e) => { if (e.key === 'Enter') void saveTemplate(); }}
            className="flex-1 rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-content-primary placeholder:text-content-tertiary focus:border-white/30 focus:outline-none" />
          <button type="button" onClick={() => void saveTemplate()} disabled={!tplName.trim() || !!busy}
            className="rounded-md bg-white px-2 py-1 font-semibold text-black hover:bg-white/90 disabled:opacity-40">저장</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COVER_DESIGNS.map((d) => (
          <button key={d.id} type="button" title={d.hint} onClick={() => pick({ design: d.id })} className={chip(value.design === d.id)}>{d.label}</button>
        ))}
      </div>
      {isImage && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-2">
          <div className="flex items-center justify-between">
            <span className="text-content-secondary">{canManageShared ? '표지 이미지 — 올리면 모든 센터 공용' : '표지 이미지 — 이 센터 라이브러리'}</span>
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
                  <button type="button" onClick={() => pick({ imageUrl: sel ? null : it.url })} title={it.name}
                    className={`block w-full overflow-hidden rounded-md border ${sel ? 'border-white ring-2 ring-white/40' : 'border-white/10 hover:border-white/30'}`}
                    style={{ aspectRatio: '210 / 297', background: '#1f1f23' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.url} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                  {/* 공용 표지는 센터에서 못 지운다 (서버도 이 센터 폴더만 허용) — 운영자만 지움 */}
                  {(!it.shared || canManageShared) && (
                    <button type="button" onClick={() => void remove(it)} title={arming ? '한 번 더 누르면 삭제' : '삭제'}
                      className={`absolute right-1 top-1 rounded px-1 text-[10px] leading-4 ${arming ? 'bg-red-500 text-white' : 'bg-black/70 text-white opacity-0 group-hover:opacity-100'}`}>
                      {arming ? '삭제?' : '×'}
                    </button>
                  )}
                  <div className="mt-0.5 truncate text-[10px] text-content-tertiary">{it.shared ? `공용 · ${it.name}` : it.name}</div>
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
      {([['titleScale', '제목 글자 크기'], ['textScale', '나머지 글자 크기']] as const).map(([k, label]) => {
        const v = value[k] ?? 1;
        return (
          <label key={k} className="flex items-center gap-2 text-content-secondary">
            <span className="w-24 shrink-0">{label}</span>
            <input type="range" min={0.6} max={1.8} step={0.05} value={v} onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })} className="flex-1" />
            <button type="button" onClick={() => onChange({ ...value, [k]: 1 })} title="기본 크기로" className="w-10 shrink-0 text-right tabular-nums text-content-tertiary hover:text-content-primary">{Math.round(v * 100)}%</button>
          </label>
        );
      })}
      {([['titleColor', '제목 글자색'], ['textColor', '나머지 글자색']] as const).map(([k, label]) => {
        const v = (value[k] || '').trim();
        return (
          <div key={k} className="flex items-center gap-2 text-content-secondary">
            <span className="w-24 shrink-0">{label}</span>
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => onChange({ ...value, [k]: '' })} title="디자인 기본색"
                className={`rounded border px-1.5 py-0.5 text-[10px] ${!v ? 'border-white/40 text-content-primary' : 'border-white/15 text-content-tertiary hover:text-content-primary'}`}>기본</button>
              {TEXT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => onChange({ ...value, [k]: c })} title={c}
                  className={`h-4 w-4 rounded-full border ${v.toLowerCase() === c ? 'border-white ring-2 ring-white/40' : 'border-white/25'}`}
                  style={{ background: c }} />
              ))}
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'} onChange={(e) => onChange({ ...value, [k]: e.target.value })}
                title="직접 고르기" className="h-5 w-6 cursor-pointer rounded border border-white/15 bg-transparent p-0" />
            </div>
          </div>
        );
      })}
      {curKey && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-white/10 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-content-secondary">
              이 표지 기본값 {curDef ? <span className="text-content-primary">· 있음{curDef.shared ? ' (공용)' : ' (이 센터)'}</span> : <span className="text-content-tertiary">· 없음 (디자인 원래 모양)</span>}
            </span>
            <span className="flex items-center gap-1.5">
              {curDef && canSaveDef && curDef.shared === canManageShared && (
                <button type="button" onClick={() => void clearDefault()}
                  className={`rounded-md border px-2 py-1 text-[11px] ${busy === 'del:default' ? 'border-red-500 bg-red-500 text-white' : 'border-white/15 text-content-tertiary hover:text-content-primary'}`}>
                  {busy === 'del:default' ? '한 번 더 누르면 지움' : '기본값 지우기'}</button>
              )}
              <button type="button" onClick={() => void saveDefault()} disabled={!canSaveDef || (!!busy && busy !== 'del:default')}
                title={canSaveDef ? '지금 글자 모양(크기·색·글씨체·굵기)을 이 표지의 기본으로' : '공용 표지의 기본값은 운영자만 정합니다'}
                className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-black hover:bg-white/90 disabled:opacity-40">이 표지 기본값으로 저장</button>
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-content-tertiary">
            {defMsg || '글씨체·굵기·크기·색을 맞춘 뒤 저장하면, 다음부터 이 표지를 고를 때 그 모양으로 시작합니다. 제목·학원명 같은 글 내용은 저장하지 않습니다.'}
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1 text-content-secondary">
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><span className="shrink-0 pt-0.5">표지 학원/학교명 (비우면 헤더의 학원/학교)</span><FieldTools field="academy" value={value} onChange={onChange} /></span>
        <input type="text" value={value.academy || ''} onChange={(e) => onChange({ ...value, academy: e.target.value })} placeholder="예: 과사람 동래 자사관"
          className="rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-content-primary placeholder:text-content-tertiary focus:border-white/30 focus:outline-none" />
      </div>
      <div className="flex flex-col gap-1 text-content-secondary">
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><span className="shrink-0 pt-0.5">표지 제목 (비우면 시험지 제목)</span><FieldTools field="title" value={value} onChange={onChange} /></span>
        <input type="text" value={value.title || ''} onChange={(e) => onChange({ ...value, title: e.target.value })} placeholder="예: 2학기 중간고사 대비 실전 모의고사"
          className="rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-content-primary placeholder:text-content-tertiary focus:border-white/30 focus:outline-none" />
      </div>
      <div className="flex flex-col gap-1 text-content-secondary">
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><span className="shrink-0 pt-0.5">표지 부제목 (비우면 학년·과목 자동)</span><FieldTools field="subtitle" value={value} onChange={onChange} /></span>
        <input type="text" value={value.subtitle || ''} onChange={(e) => onChange({ ...value, subtitle: e.target.value })} placeholder="예: 고2 수학Ⅱ · 충렬고 대비반"
          className="rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-content-primary placeholder:text-content-tertiary focus:border-white/30 focus:outline-none" />
      </div>
      <div className="flex flex-col gap-1 text-content-secondary">
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><span className="shrink-0 pt-0.5">표지 정보 줄 (비우면 안 넣음)</span><FieldTools field="info" value={value} onChange={onChange} /></span>
        <input type="text" value={value.infoText || ''} onChange={(e) => onChange({ ...value, infoText: e.target.value })} placeholder="예: 25문항 · 50분 · 2026.10.05"
          className="rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-content-primary placeholder:text-content-tertiary focus:border-white/30 focus:outline-none" />
      </div>
      <div className="flex flex-col gap-1 text-content-secondary">
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><span className="shrink-0 pt-0.5">표지 안내문 (선택)</span><FieldTools field="note" value={value} onChange={onChange} /></span>
        <textarea value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} rows={2} placeholder="예: 풀이는 문제 옆 여백에, 채점 후 오답 유형을 표시하세요."
          className="rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-content-primary placeholder:text-content-tertiary focus:border-white/30 focus:outline-none" />
      </div>
      <label className="flex items-center gap-2 text-content-secondary">
        <input type="checkbox" checked={value.back !== false} onChange={(e) => onChange({ ...value, back: e.target.checked })} />
        뒷표지도 같이 (인쇄물 맨 끝 · 양면이면 마지막 장 바깥면)
      </label>
      {value.back !== false && (
        <div className="flex flex-col gap-1 text-content-secondary">
          <span className="shrink-0 pt-0.5">뒷표지 문구 (선택)</span>
          <textarea value={value.backNote || ''} onChange={(e) => onChange({ ...value, backNote: e.target.value })} rows={3} placeholder="예: 단원 구성 · 공부하는 방법 · 학원 연락처"
            className="rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs text-content-primary placeholder:text-content-tertiary focus:border-white/30 focus:outline-none" />
        </div>
      )}
      <p className="text-[10px] text-content-tertiary">비운 칸은 헤더 정보에서 가져옵니다. 표지는 페이지 번호에 세지 않고, 양면이면 짝 계산에 넣습니다. 한글(.hwpx) 내보내기엔 아직 없습니다.</p>
    </div>
  );
}
