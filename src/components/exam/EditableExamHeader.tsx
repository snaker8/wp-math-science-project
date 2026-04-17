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
  return (
    <div className="border-b-2 border-gray-800 p-0 bg-white">
      <table className="w-full border-collapse text-black">
        <tbody>
          {/* 1행: 학원/학교명 + 시험명 + 담당 */}
          <tr>
            <td className="border border-gray-400 px-2 py-2 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">학원/학교</td>
            <td className="border border-gray-400 px-2 py-2 text-sm font-bold text-gray-900">{meta.schoolName || ''}</td>
            <td className="border border-gray-400 px-2 py-2 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">시험명</td>
            <td className="border border-gray-400 px-2 py-2 text-sm font-bold text-gray-900" colSpan={2}>{examTitle}</td>
            <td className="border border-gray-400 px-2 py-2 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">담당</td>
            <td className="border border-gray-400 px-2 py-2 text-sm font-bold text-gray-900 w-20">{meta.teacher || ''}</td>
          </tr>
          {/* 2행: 과목 + 학기 + 유형 + 학년 */}
          <tr>
            <td className="border border-gray-400 px-2 py-2 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">과목</td>
            <td className="border border-gray-400 px-2 py-2 text-sm font-bold text-gray-900">{meta.subject || ''}</td>
            <td className="border border-gray-400 px-2 py-2 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">학기</td>
            <td className="border border-gray-400 px-2 py-2 text-sm font-bold text-gray-900">{meta.semester || ''}</td>
            <td className="border border-gray-400 px-2 py-2 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">유형</td>
            <td className="border border-gray-400 px-2 py-2 text-sm font-bold text-gray-900">{meta.examType || ''}</td>
            <td className="border border-gray-400 px-2 py-2 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">학년</td>
            <td className="border border-gray-400 px-2 py-2 text-sm font-bold text-gray-900 w-20">{meta.grade || ''}</td>
          </tr>
          {/* 3행: 시간 + 일시 + 총점 (모두 비어있으면 행 자체 생략) */}
          {(meta.timeLimit || meta.date || (meta.totalScore && meta.totalScore !== '100')) && (
            <tr>
              <td className="border border-gray-400 px-2 py-2 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">시간</td>
              <td className="border border-gray-400 px-2 py-2 text-sm text-gray-900">{meta.timeLimit || ''}</td>
              <td className="border border-gray-400 px-2 py-2 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">일시</td>
              <td className="border border-gray-400 px-2 py-2 text-sm text-gray-900">{meta.date || ''}</td>
              <td className="border border-gray-400 px-2 py-2 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">총점</td>
              <td className="border border-gray-400 px-2 py-2 text-sm text-gray-900" colSpan={3}>{meta.totalScore || ''}</td>
            </tr>
          )}
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
  const [localTitle, setLocalTitle] = useState(examTitle);
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
                value={meta.schoolName}
                onChange={(e) => onMetaChange('schoolName', e.target.value)}
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
                value={meta.teacher}
                onChange={(e) => onMetaChange('teacher', e.target.value)}
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
            <td className="border border-gray-400 px-1 py-1">
              <DropdownSelect
                value={meta.examType}
                onChange={(v) => onMetaChange('examType', v)}
                options={EXAM_TYPE_OPTIONS as unknown as string[]}
                placeholder="시험유형"
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
                value={meta.timeLimit}
                onChange={(e) => onMetaChange('timeLimit', e.target.value)}
                placeholder="50분"
                className="w-full px-1.5 py-0.5 text-sm text-gray-900 bg-transparent border-none outline-none placeholder-gray-300 focus:bg-yellow-50/50"
              />
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">일시</td>
            <td className="border border-gray-400 px-1 py-1">
              <input
                type="text"
                value={meta.date}
                onChange={(e) => onMetaChange('date', e.target.value)}
                placeholder="YYYY-MM-DD"
                className="w-full px-1.5 py-0.5 text-sm text-gray-900 bg-transparent border-none outline-none placeholder-gray-300 focus:bg-yellow-50/50"
              />
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-[10px] font-bold text-gray-500 w-14 bg-gray-50 text-center">총점</td>
            <td className="border border-gray-400 px-1 py-1" colSpan={3}>
              <input
                type="text"
                value={meta.totalScore}
                onChange={(e) => onMetaChange('totalScore', e.target.value)}
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  // ★ 현재 값이 옵션에 없으면 추가 (DB값이 리스트와 다를 때 대비)
  const hasCurrentValue = options.some((o) => o === value);
  const extendedOptions = hasCurrentValue || !value ? options : [value, ...options];
  return (
    <div className="relative">
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none px-1.5 py-0.5 pr-5 text-sm font-bold text-gray-900 bg-transparent border-none outline-none cursor-pointer hover:bg-yellow-50/50"
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
