'use client';

// ============================================================================
// 편집 가능 시험지 헤더 (통합 버전)
// - 템플릿 선택 버튼 + 인라인 편집 모드
// - 클라우드 페이지 / 시험지 관리 페이지 공통 사용
// ============================================================================

import React, { useState, useCallback, memo } from 'react';
import { ChevronDown, Edit3, Check, X } from 'lucide-react';
import { DEFAULT_EXAM_META, type ExamMeta, EXAM_TYPE_OPTIONS } from '@/config/exam-templates';

const GRADE_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3'];
const SEMESTER_OPTIONS = ['1학기', '2학기', ''];

interface EditableExamHeaderProps {
  templateId: string;
  meta?: Partial<ExamMeta>;
  examTitle?: string;
  /** 편집 가능 여부 (false면 인쇄용 — 버튼 숨김) */
  editable?: boolean;
  /** 템플릿 변경 콜백 */
  onTemplateChange?: (templateId: string, meta: ExamMeta) => void;
  /** 메타 변경 콜백 (인라인 편집) */
  onMetaChange?: (meta: ExamMeta) => void;
  /** 시험지명 변경 콜백 */
  onExamTitleChange?: (title: string) => void;
  /** 과목 옵션 (과목별 선택) */
  subjectOptions?: string[];
  /** ★ 헤더 상단 강조색 (우리식 색 테마) — null/undefined면 미표시(기존 동일). 인쇄 반영. */
  accentColor?: string | null;
  /** ★ 헤더 꾸밈 테마 id ('none'|'line'|'double'|'wave'|'corner'|'dots'). accentColor 와 함께 동작. */
  headerTheme?: string | null;
}

// ============================================================================
// ★ 헤더 꾸밈 테마 — 우리 고유 디자인 (매쓰홀릭 "테마" 참고, 카피 X). accentColor 로 색 적용.
//   모눈/마스코트 없이, 깔끔한 상단 장식 위주. 인쇄 색 반영(print-color-adjust:exact).
// ============================================================================
export const HEADER_THEMES: Array<{ id: string; label: string }> = [
  { id: 'none', label: '없음' },
  { id: 'wave', label: '웨이브' },
  { id: 'grid', label: '격자' },
  { id: 'ruler', label: '눈금자' },
  { id: 'ribbon', label: '리본' },
  { id: 'dots', label: '도트' },
  { id: 'corner', label: '코너' },
  { id: 'mascot', label: '캐릭터' },
  { id: 'line', label: '라인' },
  { id: 'double', label: '더블' },
];

function ExamHeaderDecoration({ theme, color }: { theme: string; color: string }) {
  const pca = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties;
  if (theme === 'wave') {
    return (
      <div aria-hidden style={{ position: 'relative', lineHeight: 0, height: 18, marginBottom: 2, ...pca }}>
        <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <path d="M0,26 C200,6 380,6 600,18 C820,30 1000,30 1200,10 L1200,40 L0,40 Z" fill={color} opacity="0.28" />
          <path d="M0,30 C220,12 420,12 620,22 C820,32 1010,32 1200,16 L1200,40 L0,40 Z" fill={color} />
        </svg>
      </div>
    );
  }
  if (theme === 'grid') {
    return (
      <div aria-hidden style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 16, marginBottom: 4, ...pca }}>
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} style={{ width: 9, height: 9, border: `1.4px solid ${color}`, borderRadius: 1.5, opacity: Math.max(0.12, 1 - i * 0.075), display: 'inline-block' }} />
        ))}
        <span style={{ flex: 1, height: 2, background: color, opacity: 0.25, borderRadius: 2, marginLeft: 4 }} />
      </div>
    );
  }
  if (theme === 'ruler') {
    return (
      <div aria-hidden style={{ position: 'relative', height: 15, marginBottom: 4, ...pca }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: color, borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'space-between' }}>
          {Array.from({ length: 25 }).map((_, i) => (
            <span key={i} style={{ width: 1.4, height: i % 5 === 0 ? 12 : 6, background: color, opacity: i % 5 === 0 ? 0.9 : 0.5, display: 'inline-block' }} />
          ))}
        </div>
      </div>
    );
  }
  if (theme === 'ribbon') {
    return (
      <div aria-hidden style={{ display: 'flex', alignItems: 'center', height: 16, marginBottom: 4, ...pca }}>
        <span style={{ display: 'inline-block', width: 42, height: 11, background: color, clipPath: 'polygon(0 0, 100% 0, 86% 50%, 100% 100%, 0 100%)', borderRadius: 1 }} />
        <span style={{ flex: 1, height: 2, background: color, opacity: 0.35, borderRadius: 2 }} />
      </div>
    );
  }
  if (theme === 'dots') {
    return (
      <div aria-hidden style={{ display: 'flex', gap: 6, alignItems: 'center', height: 12, marginBottom: 4, ...pca }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: color, opacity: 1 - i * 0.14, display: 'inline-block' }} />
        ))}
        <span style={{ flex: 1, height: 2, background: color, opacity: 0.28, borderRadius: 2 }} />
      </div>
    );
  }
  if (theme === 'corner') {
    return (
      <div aria-hidden style={{ position: 'relative', height: 22, marginBottom: 2, ...pca }}>
        <svg style={{ position: 'absolute', top: 0, left: 0, width: 64, height: 22 }} viewBox="0 0 64 22" fill="none">
          <path d="M3 20 Q3 3 20 3 L62 3" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
        </svg>
        <svg style={{ position: 'absolute', top: 0, right: 0, width: 64, height: 22 }} viewBox="0 0 64 22" fill="none">
          <path d="M61 20 Q61 3 44 3 L2 3" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (theme === 'mascot') {
    return (
      <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 8, height: 22, marginBottom: 3, ...pca }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
          <path d="M4 12 A8 8 0 0 1 20 12" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <circle cx="9" cy="10.5" r="1.1" fill={color} />
          <circle cx="15" cy="10.5" r="1.1" fill={color} />
          <path d="M9 14.6 Q12 16.6 15 14.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </svg>
        <span style={{ flex: 1, height: 2, background: color, opacity: 0.3, borderRadius: 2 }} />
      </div>
    );
  }
  if (theme === 'line') {
    return <div aria-hidden style={{ height: 6, background: color, borderRadius: 3, marginBottom: 3, ...pca }} />;
  }
  if (theme === 'double') {
    return (
      <div aria-hidden style={{ marginBottom: 3, ...pca }}>
        <div style={{ height: 3, background: color, borderRadius: 2 }} />
        <div style={{ height: 2, background: color, opacity: 0.45, marginTop: 2, borderRadius: 2 }} />
      </div>
    );
  }
  return null;
}

function EditableExamHeaderInner({
  templateId,
  meta,
  examTitle,
  editable = true,
  onTemplateChange,
  onMetaChange,
  onExamTitleChange,
  subjectOptions,
  accentColor,
  headerTheme,
}: EditableExamHeaderProps) {
  const [editMode, setEditMode] = useState(false);
  const m: ExamMeta = { ...DEFAULT_EXAM_META, ...meta };
  const title = examTitle || '수학 평가';

  const updateField = useCallback((field: keyof ExamMeta, value: string) => {
    if (onMetaChange) onMetaChange({ ...m, [field]: value });
  }, [onMetaChange, m]);

  return (
    <div className="exam-meta-header">
      {/* ★ 헤더 꾸밈 테마 (우리 고유 디자인) — accentColor + theme. 선택 시에만. 인쇄 색 반영. */}
      {accentColor && headerTheme && headerTheme !== 'none' && (
        <ExamHeaderDecoration theme={headerTheme} color={accentColor} />
      )}
      {/* 편집 모드 토글 바 (편집 가능할 때만 표시, 인쇄 시 숨김) */}
      {editable && (
        <div className="print:hidden flex items-center justify-end gap-1.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setEditMode(v => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
              editMode
                ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
            }`}
            title={editMode ? '편집 완료' : '정보 편집'}
          >
            {editMode ? <Check className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
            {editMode ? '완료' : '편집'}
          </button>
        </div>
      )}

      {/* 헤더 본체 */}
      {editMode && editable ? (
        <EditableFormView
          meta={m}
          examTitle={title}
          onMetaChange={updateField}
          onTitleChange={onExamTitleChange}
          subjectOptions={subjectOptions}
        />
      ) : (
        // 헤더 = 에디토리얼 (레이아웃 variant는 templateId로). 표 6종은 디자인 갤러리로 일원화됨.
        <StaticFormView
          meta={m}
          examTitle={title}
          accent={accentColor}
          variant={templateId === 'centered' ? 'centered' : templateId === 'minimal' ? 'minimal' : 'editorial'}
        />
      )}
    </div>
  );
}

// ★ 메모이제이션 — 부모가 새 callback 넘겨도 내용 같으면 skip
export const EditableExamHeader = memo(EditableExamHeaderInner);

// ============================================================================
// 정적 표시 뷰 — 편집 폼과 동일 레이아웃, 값만 표시 (인쇄/뷰 모드)
// ============================================================================

function StaticFormView({
  meta,
  examTitle,
  accent,
  variant = 'editorial',
}: {
  meta: ExamMeta;
  examTitle: string;
  accent?: string | null;
  variant?: 'editorial' | 'centered' | 'minimal';
}) {
  // ★ 에디토리얼 헤더 (2026-07-01) — accent는 세로바 + eyebrow 과목명에만(절제). 강한 타이포 위계.
  //   variant: editorial(좌측 accent바) / centered(중앙정렬+짧은 언더라인) / minimal(제목+이름만).
  const pca = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties;
  const a = accent || '#0f172a';
  const centered = variant === 'centered';
  const minimal = variant === 'minimal';
  const metaBits = [
    meta.grade, meta.semester,
    meta.timeLimit ? `${meta.timeLimit}` : '',
    meta.date || '',
  ].filter(Boolean) as string[];

  const eyebrow = !minimal && (meta.subject || meta.examType) ? (
    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.13em' }}>
      {meta.subject ? <span style={{ color: a, ...pca }}>{meta.subject}</span> : null}
      {meta.subject && meta.examType ? <span style={{ color: '#cbd5e1' }}> &middot; </span> : null}
      {meta.examType ? <span style={{ color: '#94a3b8' }}>{meta.examType}</span> : null}
    </span>
  ) : null;

  const inner = (
    <div style={{ flex: 1, minWidth: 0, textAlign: centered ? 'center' : 'left' }}>
      {!minimal && (
        <div style={{ display: 'flex', justifyContent: centered ? 'center' : 'space-between', alignItems: 'baseline', gap: 12 }}>
          {eyebrow}
          {!centered && meta.schoolName ? <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{meta.schoolName}</span> : null}
        </div>
      )}
      <div style={{ fontSize: centered ? 22 : 21, fontWeight: 800, color: '#0f172a', marginTop: minimal ? 0 : 5, lineHeight: 1.2, letterSpacing: '-0.02em' }}>{examTitle}</div>
      {centered && meta.schoolName ? <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginTop: 3 }}>{meta.schoolName}</div> : null}
      {!minimal && metaBits.length > 0 && (
        <div style={{ fontSize: 11.5, fontWeight: 500, color: '#64748b', marginTop: 5 }}>{metaBits.join(' · ')}</div>
      )}
      {centered && <div aria-hidden style={{ width: 46, height: 3, background: a, borderRadius: 2, margin: '9px auto 0', ...pca }} />}
    </div>
  );

  return (
    <div className="exam-band-header" style={{ marginBottom: 2, ...pca }}>
      {centered ? (
        <div style={{ paddingBottom: 11 }}>{inner}</div>
      ) : (
        <div style={{ display: 'flex', gap: 13, paddingBottom: 11 }}>
          <div aria-hidden style={{ width: 3, alignSelf: 'stretch', background: a, borderRadius: 2, flexShrink: 0, ...pca }} />
          {inner}
        </div>
      )}
      {/* 이름 / 점수 줄 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, justifyContent: centered ? 'center' : 'flex-start' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>이름</span>
        <span aria-hidden style={{ flex: centered ? '0 0 220px' : '0 1 200px', borderBottom: '1px solid #cbd5e1', height: 16 }} />
        {!centered && meta.teacher ? <span style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8' }}>담당 {meta.teacher}</span> : null}
        <span style={{ marginLeft: centered ? 0 : 'auto', fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
          점수 <span aria-hidden style={{ display: 'inline-block', width: 46, borderBottom: '1px solid #cbd5e1', height: 14 }} />
          <span style={{ color: '#94a3b8' }}>/ {meta.totalScore || '100'}</span>
        </span>
      </div>
      {/* 하단 구분선 */}
      <div aria-hidden style={{ borderBottom: '1.5px solid #0f172a' }} />
    </div>
  );
}

// ============================================================================
// 편집 폼 뷰 — 인라인 편집 가능한 테이블
// ============================================================================

function EditableFormView({
  meta,
  examTitle,
  onMetaChange,
  onTitleChange,
  subjectOptions,
}: {
  meta: ExamMeta;
  examTitle: string;
  onMetaChange: (field: keyof ExamMeta, value: string) => void;
  onTitleChange?: (title: string) => void;
  subjectOptions?: string[];
}) {
  // ★ 텍스트 입력 — 로컬 상태로 버퍼링 (타이핑 중 부모 재렌더 방지)
  const [localTitle, setLocalTitle] = useState(examTitle);
  const [localSchool, setLocalSchool] = useState(meta.schoolName);
  const [localTeacher, setLocalTeacher] = useState(meta.teacher);
  const [localTime, setLocalTime] = useState(meta.timeLimit);
  const [localDate, setLocalDate] = useState(meta.date);
  const [localScore, setLocalScore] = useState(meta.totalScore);

  // meta prop 바뀌면 로컬도 동기화 (시험지 교체 시)
  React.useEffect(() => { setLocalTitle(examTitle); }, [examTitle]);
  React.useEffect(() => { setLocalSchool(meta.schoolName); }, [meta.schoolName]);
  React.useEffect(() => { setLocalTeacher(meta.teacher); }, [meta.teacher]);
  React.useEffect(() => { setLocalTime(meta.timeLimit); }, [meta.timeLimit]);
  React.useEffect(() => { setLocalDate(meta.date); }, [meta.date]);
  React.useEffect(() => { setLocalScore(meta.totalScore); }, [meta.totalScore]);

  const subjects = subjectOptions && subjectOptions.length > 0 ? subjectOptions : ['공통수학1', '공통수학2', '수학(상)', '수학(하)', '미적분', '확률과통계', '기하', '수학I', '수학II', '중1 수학', '중2 수학', '중3 수학'];

  return (
    <div className="border-b border-slate-300 bg-white px-1 pb-3 pt-1">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-slate-400">학원/학교</span>
          <input
            type="text"
            value={localSchool}
            onChange={(e) => setLocalSchool(e.target.value)}
            onBlur={() => { if (localSchool !== meta.schoolName) onMetaChange('schoolName', localSchool); }}
            placeholder="학원/학교명"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-900 outline-none placeholder-slate-300 focus:border-indigo-400"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-slate-400">시험명</span>
          <input
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={() => { if (onTitleChange && localTitle !== examTitle) onTitleChange(localTitle); }}
            placeholder="시험지명"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-900 outline-none placeholder-slate-300 focus:border-indigo-400"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-slate-400">담당</span>
          <input
            type="text"
            value={localTeacher}
            onChange={(e) => setLocalTeacher(e.target.value)}
            onBlur={() => { if (localTeacher !== meta.teacher) onMetaChange('teacher', localTeacher); }}
            placeholder="선생님"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-slate-900 outline-none placeholder-slate-300 focus:border-indigo-400"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-slate-400">과목</span>
          <DropdownSelect value={meta.subject} onChange={(v) => onMetaChange('subject', v)} options={subjects} placeholder="과목" />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-slate-400">학기</span>
          <DropdownSelect value={meta.semester} onChange={(v) => onMetaChange('semester', v)} options={SEMESTER_OPTIONS} placeholder="-" />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-slate-400">유형</span>
          <DropdownSelect value={meta.examType} onChange={(v) => onMetaChange('examType', v)} options={EXAM_TYPE_OPTIONS as unknown as string[]} placeholder="시험유형" allowCustom customTrigger="기타" />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-slate-400">학년</span>
          <DropdownSelect value={meta.grade} onChange={(v) => onMetaChange('grade', v)} options={GRADE_OPTIONS} placeholder="학년" />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-slate-400">시간</span>
          <input
            type="text"
            value={localTime}
            onChange={(e) => setLocalTime(e.target.value)}
            onBlur={() => { if (localTime !== meta.timeLimit) onMetaChange('timeLimit', localTime); }}
            placeholder="50분"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 outline-none placeholder-slate-300 focus:border-indigo-400"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-slate-400">일시</span>
          <input
            type="text"
            value={localDate}
            onChange={(e) => setLocalDate(e.target.value)}
            onBlur={() => { if (localDate !== meta.date) onMetaChange('date', localDate); }}
            placeholder=""
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 outline-none placeholder-slate-300 focus:border-indigo-400"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-0.5 block text-[10px] font-semibold tracking-wide text-slate-400">총점</span>
          <input
            type="text"
            value={localScore}
            onChange={(e) => setLocalScore(e.target.value)}
            onBlur={() => { if (localScore !== meta.totalScore) onMetaChange('totalScore', localScore); }}
            placeholder="100"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 outline-none placeholder-slate-300 focus:border-indigo-400"
          />
        </label>
      </div>
    </div>
  );
}

// ============================================================================
// 드롭다운 셀렉트 (편집 모드 내부)
// ============================================================================

function DropdownSelect({
  value,
  onChange,
  options,
  placeholder,
  allowCustom = false,
  customTrigger = '기타',
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  allowCustom?: boolean;
  customTrigger?: string;
}) {
  const isListed = options.some((o) => o === value);
  // allowCustom 모드 + 저장된 값이 리스트에 없으면 자동으로 직접입력 상태로 시작
  const [customMode, setCustomMode] = useState<boolean>(
    allowCustom ? !!value && !isListed : false
  );

  const handleSelect = (v: string) => {
    if (allowCustom && v === customTrigger) {
      setCustomMode(true);
      onChange('');
    } else {
      setCustomMode(false);
      onChange(v);
    }
  };

  if (customMode) {
    return (
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="직접 입력"
          className="w-full px-1.5 py-0.5 pr-5 text-sm font-bold text-gray-900 bg-transparent border-none outline-none hover:bg-yellow-50/50 placeholder-gray-400"
          autoFocus
        />
        <button
          type="button"
          onClick={() => { setCustomMode(false); onChange(''); }}
          className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-700"
          title="목록에서 선택"
        >
          ↩
        </button>
      </div>
    );
  }

  // 기존 동작: 저장된 값이 리스트에 없으면 옵션 앞에 추가
  const extendedOptions = isListed || !value ? options : [value, ...options];
  return (
    <div className="relative">
      <select
        value={value || ''}
        onChange={(e) => handleSelect(e.target.value)}
        className="w-full appearance-none px-1.5 py-0.5 pr-4 text-sm font-bold text-gray-900 bg-transparent border-none outline-none cursor-pointer hover:bg-yellow-50/50"
      >
        {!value && <option value="">{placeholder || '-'}</option>}
        {extendedOptions.map((opt) => (
          <option key={opt || 'empty'} value={opt}>{opt || '-'}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
    </div>
  );
}

export default EditableExamHeader;

// ============================================================================
// ★ 헤더 디자인 갤러리 (2026-07-01) — 템플릿(레이아웃) + 테마(장식) 통합.
//   각 프리셋 = 장식 테마 + 기본 accent 색. 썸네일 미리보기로 눈으로 고른다.
//   picking 시 headerTheme + headerColor 를 함께 세팅 → 작은 드롭다운 중복 제거.
// ============================================================================
export const HEADER_PRESETS: Array<{ id: string; name: string; theme: string; color: string; layout: string }> = [
  { id: 'clean', name: '클린', theme: 'none', color: '#0f172a', layout: 'editorial' },
  { id: 'wave', name: '웨이브', theme: 'wave', color: '#0891b2', layout: 'editorial' },
  { id: 'grid', name: '격자', theme: 'grid', color: '#2563eb', layout: 'editorial' },
  { id: 'ruler', name: '눈금자', theme: 'ruler', color: '#4f46e5', layout: 'editorial' },
  { id: 'ribbon', name: '리본', theme: 'ribbon', color: '#e11d48', layout: 'editorial' },
  { id: 'dots', name: '도트', theme: 'dots', color: '#7c3aed', layout: 'editorial' },
  { id: 'corner', name: '코너', theme: 'corner', color: '#0d9488', layout: 'editorial' },
  { id: 'mascot', name: '캐릭터', theme: 'mascot', color: '#d97706', layout: 'editorial' },
  { id: 'centered', name: '중앙정렬', theme: 'none', color: '#0f172a', layout: 'centered' },
  { id: 'minimal', name: '미니멀', theme: 'none', color: '#0f172a', layout: 'minimal' },
  { id: 'line', name: '라인', theme: 'line', color: '#0f172a', layout: 'editorial' },
  { id: 'double', name: '더블', theme: 'double', color: '#334155', layout: 'editorial' },
];

// 프리셋 썸네일 — 실제 헤더의 축소 목업 (장식 + 좌측 accent 바 + 제목/메타 라인)
function HeaderPresetThumb({ theme, color }: { theme: string; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 6, border: '1px solid #f1f5f9', padding: 8 }}>
      {theme !== 'none' && <ExamHeaderDecoration theme={theme} color={color} />}
      <div style={{ display: 'flex', gap: 6 }}>
        <div aria-hidden style={{ width: 3, alignSelf: 'stretch', background: color, borderRadius: 2, flexShrink: 0, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ height: 4, width: '38%', background: color, opacity: 0.65, borderRadius: 2 }} />
          <div style={{ height: 8, width: '86%', background: '#334155', borderRadius: 2, marginTop: 4 }} />
          <div style={{ height: 4, width: '52%', background: '#e2e8f0', borderRadius: 2, marginTop: 4 }} />
        </div>
      </div>
      <div aria-hidden style={{ borderBottom: '1.5px solid #0f172a', marginTop: 6 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
        <div style={{ height: 4, width: 18, background: '#475569', borderRadius: 2 }} />
        <div style={{ height: 4, flex: 1, background: '#e2e8f0', borderRadius: 2 }} />
      </div>
    </div>
  );
}

/**
 * 헤더 디자인 갤러리 모달 — 프리셋(장식+색)을 썸네일로 골라 적용.
 *   onSelect(theme, color) 로 headerTheme + headerColor 를 함께 세팅.
 */
export function HeaderDesignGallery({
  activeTheme,
  onSelect,
  onClose,
}: {
  activeTheme?: string | null;
  onSelect: (theme: string, color: string, layout: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">헤더 디자인</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-gray-500">템플릿·테마를 하나로. 원하는 스타일을 고르세요. 색은 아래 &lsquo;색&rsquo;에서 따로 바꿀 수 있습니다.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {HEADER_PRESETS.map((p) => {
            const active = activeTheme === p.theme;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onSelect(p.theme, p.color, p.layout); onClose(); }}
                className={`rounded-xl border p-2.5 text-left transition hover:shadow-md ${active ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <HeaderPresetThumb theme={p.theme} color={p.color} />
                <div className="mt-2 flex items-center gap-1.5">
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                  <span className="text-xs font-semibold text-gray-700">{p.name}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
