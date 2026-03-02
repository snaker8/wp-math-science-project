'use client';

// ============================================================================
// 시험지 템플릿 선택 + 메타데이터 입력 모달
// ============================================================================

import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import {
  EXAM_TEMPLATES,
  EXAM_TYPE_OPTIONS,
  SEMESTER_OPTIONS,
  GRADE_OPTIONS,
  DEFAULT_EXAM_META,
  type ExamMeta,
} from '@/config/exam-templates';
import { ExamPaperHeader } from './ExamPaperHeader';

interface TemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  meta: ExamMeta;
  onApply: (templateId: string, meta: ExamMeta) => void;
}

export function TemplateSelector({
  isOpen,
  onClose,
  templateId,
  meta,
  onApply,
}: TemplateSelectorProps) {
  const [selectedId, setSelectedId] = useState(templateId);
  const [editMeta, setEditMeta] = useState<ExamMeta>({ ...DEFAULT_EXAM_META, ...meta });

  // 외부 props 변경 시 동기화
  useEffect(() => {
    setSelectedId(templateId);
    setEditMeta({ ...DEFAULT_EXAM_META, ...meta });
  }, [templateId, meta]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply(selectedId, editMeta);
    onClose();
  };

  const updateField = <K extends keyof ExamMeta>(key: K, value: ExamMeta[K]) => {
    setEditMeta(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[960px] max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <h2 className="text-lg font-bold text-white">시험지 템플릿 설정</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* 본문: 좌측 설정 + 우측 미리보기 */}
        <div className="flex flex-1 min-h-0">
          {/* 좌측: 템플릿 선택 + 메타데이터 */}
          <div className="w-[520px] flex flex-col border-r border-zinc-700 overflow-y-auto">
            {/* 템플릿 선택 */}
            <div className="px-6 py-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">템플릿 선택</h3>
              <div className="grid grid-cols-3 gap-2">
                {EXAM_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`relative text-left px-3 py-2.5 rounded-lg border transition-all ${
                      selectedId === t.id
                        ? 'border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/30'
                        : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    {selectedId === t.id && (
                      <div className="absolute top-1.5 right-1.5">
                        <Check size={14} className="text-cyan-400" />
                      </div>
                    )}
                    <div className="text-sm font-medium text-white">{t.name}</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 leading-tight">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 메타데이터 입력 폼 */}
            <div className="px-6 py-4 border-t border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">시험 정보</h3>
              <div className="grid grid-cols-2 gap-3">
                {/* 학교명 */}
                <InputField label="학교/학원명" value={editMeta.schoolName} onChange={(v) => updateField('schoolName', v)} placeholder="○○고등학교" />

                {/* 학년 */}
                <SelectField label="학년" value={editMeta.grade} onChange={(v) => updateField('grade', v)} options={GRADE_OPTIONS as unknown as string[]} placeholder="선택" />

                {/* 학기 */}
                <SelectField label="학기" value={editMeta.semester} onChange={(v) => updateField('semester', v)} options={SEMESTER_OPTIONS as unknown as string[]} placeholder="선택" />

                {/* 시험유형 */}
                <SelectField label="시험유형" value={editMeta.examType} onChange={(v) => updateField('examType', v)} options={EXAM_TYPE_OPTIONS as unknown as string[]} placeholder="선택" />

                {/* 과목 */}
                <InputField label="과목" value={editMeta.subject} onChange={(v) => updateField('subject', v)} placeholder="공통수학1" />

                {/* 출제교사 */}
                <InputField label="출제교사" value={editMeta.teacher} onChange={(v) => updateField('teacher', v)} placeholder="홍길동" />

                {/* 시험일 */}
                <InputField label="시험일" value={editMeta.date} onChange={(v) => updateField('date', v)} placeholder="2026.03.15" />

                {/* 시험시간 */}
                <InputField label="시험시간" value={editMeta.timeLimit} onChange={(v) => updateField('timeLimit', v)} placeholder="50분" />

                {/* 총점 */}
                <InputField label="총점" value={editMeta.totalScore} onChange={(v) => updateField('totalScore', v)} placeholder="100" />
              </div>
            </div>
          </div>

          {/* 우측: 미리보기 */}
          <div className="flex-1 flex flex-col bg-zinc-950/50 overflow-y-auto">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-300">미리보기</h3>
            </div>
            <div className="flex-1 p-4 flex justify-center">
              <div className="w-full max-w-[420px] bg-white rounded-lg shadow-lg overflow-hidden">
                <ExamPaperHeader
                  templateId={selectedId}
                  meta={editMeta}
                  examTitle={editMeta.examType
                    ? `${editMeta.semester ? editMeta.semester + ' ' : ''}${editMeta.examType}`
                    : '수학 평가'
                  }
                />
                {/* 샘플 문제 영역 */}
                <div className="px-6 py-4 text-gray-400 text-xs space-y-3">
                  <div className="flex gap-2">
                    <span className="font-bold text-gray-600">1.</span>
                    <div className="flex-1 border-b border-dashed border-gray-200 pb-3">
                      <div className="h-2.5 bg-gray-100 rounded w-4/5 mb-2" />
                      <div className="h-2.5 bg-gray-100 rounded w-3/5" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-gray-600">2.</span>
                    <div className="flex-1 border-b border-dashed border-gray-200 pb-3">
                      <div className="h-2.5 bg-gray-100 rounded w-3/4 mb-2" />
                      <div className="h-2.5 bg-gray-100 rounded w-2/3" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-gray-600">3.</span>
                    <div className="flex-1">
                      <div className="h-2.5 bg-gray-100 rounded w-4/5 mb-2" />
                      <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 재사용 폼 컴포넌트
// ============================================================================

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
      >
        <option value="">{placeholder || '선택'}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

export default TemplateSelector;
