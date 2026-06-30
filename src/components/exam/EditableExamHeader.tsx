'use client';

// ============================================================================
// 편집 가능 시험지 헤더 (통합 버전)
// - 템플릿 선택 버튼 + 인라인 편집 모드
// - 클라우드 페이지 / 시험지 관리 페이지 공통 사용
// ============================================================================

import React, { useState, useCallback, memo } from 'react';
import { ChevronDown, Edit3, Check, LayoutTemplate } from 'lucide-react';
import { ExamPaperHeader } from '@/components/exam/ExamPaperHeader';
import { TemplateSelector } from '@/components/exam/TemplateSelector';
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
  { id: 'line', label: '라인' },
  { id: 'double', label: '더블' },
  { id: 'wave', label: '웨이브' },
  { id: 'corner', label: '코너' },
  { id: 'dots', label: '도트' },
];

function ExamHeaderDecoration({ theme, color }: { theme: string; color: string }) {
  const pca = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties;
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
  if (theme === 'wave') {
    return (
      <div aria-hidden style={{ lineHeight: 0, marginBottom: 2, ...pca }}>
        <svg viewBox="0 0 1200 36" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 16 }}>
          <path d="M0,22 C200,4 380,4 600,16 C820,28 1000,28 1200,8 L1200,36 L0,36 Z" fill={color} />
        </svg>
      </div>
    );
  }
  if (theme === 'corner') {
    return (
      <div aria-hidden style={{ position: 'relative', height: 24, marginBottom: 2, ...pca }}>
        <svg style={{ position: 'absolute', top: 0, left: 0, width: 70, height: 24 }} viewBox="0 0 70 24" fill="none">
          <path d="M3 22 Q3 3 22 3 L68 3" stroke={color} strokeWidth="4" strokeLinecap="round" />
        </svg>
        <svg style={{ position: 'absolute', top: 0, right: 0, width: 70, height: 24 }} viewBox="0 0 70 24" fill="none">
          <path d="M67 22 Q67 3 48 3 L2 3" stroke={color} strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (theme === 'dots') {
    return (
      <div aria-hidden style={{ display: 'flex', gap: 6, alignItems: 'center', height: 12, marginBottom: 4, ...pca }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: color, opacity: 1 - i * 0.12, display: 'inline-block' }} />
        ))}
        <span style={{ flex: 1, height: 2, background: color, opacity: 0.3, borderRadius: 2 }} />
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
  const [showTemplateModal, setShowTemplateModal] = useState(false);
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
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            title="템플릿 변경"
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            템플릿
          </button>
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
      ) : templateId === 'simple' || !templateId ? (
        // 기본 템플릿: 편집 모드와 동일 레이아웃 (정적 표시)
        <StaticFormView meta={m} examTitle={title} />
      ) : (
        // 사용자가 지정한 템플릿
        <ExamPaperHeader templateId={templateId} meta={m} examTitle={title} />
      )}

      {/* 템플릿 선택 모달 — 열렸을 때만 렌더 (성능) */}
      {editable && showTemplateModal && (
        <TemplateSelector
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          templateId={templateId}
          meta={m}
          onApply={(id, newMeta) => {
            if (onTemplateChange) onTemplateChange(id, newMeta);
          }}
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
}: {
  meta: ExamMeta;
  examTitle: string;
}) {
  // ★ 셀 클래스 (라벨/값 공통) — 라벨은 nowrap(1줄 유지), 값은 break-words(자연 줄바꿈)
  const L = "border border-gray-400 px-1 py-1.5 text-[10px] font-bold text-gray-500 bg-gray-50 text-center whitespace-nowrap";
  const V = "border border-gray-400 px-2 py-1.5 text-sm font-bold text-gray-900 break-words";
  return (
    <div className="border-b-2 border-gray-800 p-0 bg-white">
      {/* ★ table-layout: fixed + colgroup 으로 컬럼 폭 고정 (라벨 10% / 값 15%).
          기존엔 auto-layout 에서 '유형' 값의 nowrap 이 폭을 독차지 → 과목·시험명 값이
          0폭으로 짓눌려 글자마다 줄바꿈·헤더 비대(행 77px) 됐음. 8칸 정렬 + 폭 고정으로 해소. */}
      <table className="w-full border-collapse text-black" style={{ tableLayout: 'fixed' }}>
        {/* 라벨 8% 고정. 값 칸은 비대칭: 유형(C6)은 값이 길어(진단평가B(...)) 30% 로 넓혀
            2줄에 담고, 비거나 짧은 학기·일시(C4) 10% / 과목·학년(C2,C8) 14% 로 줄여
            중간 행(유형 3줄→2줄) 높이를 낮춤. */}
        <colgroup>
          <col style={{ width: '8%' }} /><col style={{ width: '14%' }} />
          <col style={{ width: '8%' }} /><col style={{ width: '10%' }} />
          <col style={{ width: '8%' }} /><col style={{ width: '30%' }} />
          <col style={{ width: '8%' }} /><col style={{ width: '14%' }} />
        </colgroup>
        <tbody>
          {/* 1행: 학원/학교 + 시험명(넓게 colSpan3) + 담당 */}
          <tr>
            <td className={L}>학원/학교</td>
            <td className={V}>{meta.schoolName || ''}</td>
            <td className={L}>시험명</td>
            <td className={V} colSpan={3}>{examTitle}</td>
            <td className={L}>담당</td>
            <td className={V}>{meta.teacher || ''}</td>
          </tr>
          {/* 2행: 과목 + 학기 + 유형 + 학년 */}
          <tr>
            <td className={L}>과목</td>
            <td className={V}>{meta.subject || ''}</td>
            <td className={L}>학기</td>
            <td className={V}>{meta.semester || ''}</td>
            <td className={L}>유형</td>
            <td className={V}>{meta.examType || ''}</td>
            <td className={L}>학년</td>
            <td className={V}>{meta.grade || ''}</td>
          </tr>
          {/* 3행: 시간 + 일시 + 총점(넓게 colSpan3) — 인쇄 시 항상 표시, 화면에선 값 있을 때만 */}
          {(() => {
            const hasAnyValue = Boolean(meta.timeLimit || meta.date || (meta.totalScore && meta.totalScore !== '100'));
            const trClass = hasAnyValue ? '' : 'hidden print:table-row';
            return (
              <tr className={trClass}>
                <td className={L}>시간</td>
                <td className={V.replace('font-bold ', '')}>{meta.timeLimit || ''}</td>
                <td className={L}>일시</td>
                <td className={V.replace('font-bold ', '')}>{meta.date || ''}</td>
                <td className={L}>총점</td>
                <td className={V.replace('font-bold ', '')} colSpan={3}>{meta.totalScore || ''}</td>
              </tr>
            );
          })()}
        </tbody>
      </table>
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
    <div className="border-b-2 border-gray-800 p-0 bg-white">
      <table className="w-full border-collapse text-black">
        <tbody>
          {/* 1행: 학원/학교명 + 시험명 + 담당 */}
          <tr>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">학원/학교</td>
            <td className="border border-gray-400 px-1 py-1">
              <input
                type="text"
                value={localSchool}
                onChange={(e) => setLocalSchool(e.target.value)}
                onBlur={() => { if (localSchool !== meta.schoolName) onMetaChange('schoolName', localSchool); }}
                placeholder="학원/학교명"
                className="w-full px-1.5 py-0.5 text-sm font-bold text-gray-900 bg-transparent border-none outline-none placeholder-gray-300 focus:bg-yellow-50/50"
              />
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">시험명</td>
            <td className="border border-gray-400 px-1 py-1" colSpan={2}>
              <input
                type="text"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={() => { if (onTitleChange && localTitle !== examTitle) onTitleChange(localTitle); }}
                placeholder="시험지명"
                className="w-full px-1.5 py-0.5 text-sm font-bold text-gray-900 bg-transparent border-none outline-none placeholder-gray-300 focus:bg-yellow-50/50"
              />
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">담당</td>
            <td className="border border-gray-400 px-1 py-1 w-20">
              <input
                type="text"
                value={localTeacher}
                onChange={(e) => setLocalTeacher(e.target.value)}
                onBlur={() => { if (localTeacher !== meta.teacher) onMetaChange('teacher', localTeacher); }}
                placeholder="선생님"
                className="w-full px-1.5 py-0.5 text-sm font-bold text-gray-900 bg-transparent border-none outline-none placeholder-gray-300 focus:bg-yellow-50/50"
              />
            </td>
          </tr>
          {/* 2행: 과목 + 학기 + 시험유형 + 학년 */}
          <tr>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">과목</td>
            <td className="border border-gray-400 px-1 py-1">
              <DropdownSelect
                value={meta.subject}
                onChange={(v) => onMetaChange('subject', v)}
                options={subjects}
                placeholder="과목"
              />
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">학기</td>
            <td className="border border-gray-400 px-1 py-1">
              <DropdownSelect
                value={meta.semester}
                onChange={(v) => onMetaChange('semester', v)}
                options={SEMESTER_OPTIONS}
                placeholder="-"
              />
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">유형</td>
            <td className="border border-gray-400 px-1 py-1 whitespace-nowrap" style={{ minWidth: '120px' }}>
              <DropdownSelect
                value={meta.examType}
                onChange={(v) => onMetaChange('examType', v)}
                options={EXAM_TYPE_OPTIONS as unknown as string[]}
                placeholder="시험유형"
                allowCustom
                customTrigger="기타"
              />
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">학년</td>
            <td className="border border-gray-400 px-1 py-1 w-20">
              <DropdownSelect
                value={meta.grade}
                onChange={(v) => onMetaChange('grade', v)}
                options={GRADE_OPTIONS}
                placeholder="학년"
              />
            </td>
          </tr>
          {/* 3행: 시험시간 + 일시 + 총점 */}
          <tr>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">시간</td>
            <td className="border border-gray-400 px-1 py-1">
              <input
                type="text"
                value={localTime}
                onChange={(e) => setLocalTime(e.target.value)}
                onBlur={() => { if (localTime !== meta.timeLimit) onMetaChange('timeLimit', localTime); }}
                placeholder="50분"
                className="w-full px-1.5 py-0.5 text-sm text-gray-900 bg-transparent border-none outline-none placeholder-gray-300 focus:bg-yellow-50/50"
              />
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">일시</td>
            <td className="border border-gray-400 px-1 py-1">
              <input
                type="text"
                value={localDate}
                onChange={(e) => setLocalDate(e.target.value)}
                onBlur={() => { if (localDate !== meta.date) onMetaChange('date', localDate); }}
                placeholder=""
                className="w-full px-1.5 py-0.5 text-sm text-gray-900 bg-transparent border-none outline-none placeholder-gray-300 focus:bg-yellow-50/50"
              />
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">총점</td>
            <td className="border border-gray-400 px-1 py-1" colSpan={3}>
              <input
                type="text"
                value={localScore}
                onChange={(e) => setLocalScore(e.target.value)}
                onBlur={() => { if (localScore !== meta.totalScore) onMetaChange('totalScore', localScore); }}
                placeholder="100"
                className="w-full px-1.5 py-0.5 text-sm text-gray-900 bg-transparent border-none outline-none placeholder-gray-300 focus:bg-yellow-50/50"
              />
            </td>
          </tr>
        </tbody>
      </table>
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
