'use client';

// ============================================================================
// 시험지 헤더 렌더러
// 템플릿별 4가지 헤더 스타일 렌더링
// ============================================================================

import React from 'react';
import { getExamTemplate, type ExamMeta, DEFAULT_EXAM_META } from '@/config/exam-templates';

interface ExamPaperHeaderProps {
  templateId: string;
  meta?: Partial<ExamMeta>;
  examTitle?: string;
}

export function ExamPaperHeader({
  templateId,
  meta,
  examTitle,
}: ExamPaperHeaderProps) {
  const template = getExamTemplate(templateId);
  const m: ExamMeta = { ...DEFAULT_EXAM_META, ...meta };
  const title = examTitle || '수학 평가';

  switch (template.headerStyle) {
    case 'table-simple':
      return <TableSimpleHeader template={template} meta={m} examTitle={title} />;
    case 'table-formal':
      return <TableFormalHeader template={template} meta={m} examTitle={title} />;
    case 'centered':
      return <CenteredHeader template={template} meta={m} examTitle={title} />;
    case 'bordered-box':
      return <BorderedBoxHeader template={template} meta={m} examTitle={title} />;
    default:
      return <TableSimpleHeader template={template} meta={m} examTitle={title} />;
  }
}

// ============================================================================
// table-simple: 기본형 / 미니멀
// ============================================================================

function TableSimpleHeader({
  template,
  meta,
  examTitle,
}: {
  template: ReturnType<typeof getExamTemplate>;
  meta: ExamMeta;
  examTitle: string;
}) {
  const showStudentFields = template.studentFields.length > 0;

  return (
    <div
      className="p-0"
      style={{
        borderTop: template.topBorder === 'thick' ? '3px solid #111' : template.topBorder === 'double' ? '4px double #111' : undefined,
        borderBottom: '2px solid #333',
      }}
    >
      <table className="w-full border-collapse text-black">
        <tbody>
          <tr>
            <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 w-16 text-center">과목</td>
            <td className="border border-gray-400 px-3 py-2 text-sm font-bold">{meta.subject || '수학'}</td>
            <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 w-20 text-center">시험지명</td>
            <td className="border border-gray-400 px-3 py-2 text-sm font-bold" colSpan={showStudentFields ? 1 : 2}>
              {examTitle}
            </td>
            {template.id !== 'minimal' && (
              <>
                <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 w-16 text-center">담당</td>
                <td className="border border-gray-400 px-3 py-2 text-sm font-bold w-20">{meta.teacher}</td>
              </>
            )}
          </tr>
          {showStudentFields && (
            <tr>
              <td colSpan={6} className="border border-gray-400 px-3 py-2">
                <div className="flex items-center gap-6 text-sm text-gray-700">
                  {template.studentFields.includes('class') && (
                    <span>반: <span className="inline-block w-12 border-b border-gray-400" />&nbsp;</span>
                  )}
                  {template.studentFields.includes('name') && (
                    <span>성명: <span className="inline-block w-20 border-b border-gray-400" />&nbsp;</span>
                  )}
                  {template.studentFields.includes('number') && (
                    <span>번호: <span className="inline-block w-10 border-b border-gray-400" />&nbsp;</span>
                  )}
                  {template.studentFields.includes('score') && (
                    <span>점수: <span className="inline-block w-10 border-b border-gray-400" /> / {meta.totalScore || '100'}</span>
                  )}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// table-formal: 학교시험A — 2~3행 테이블
// ============================================================================

function TableFormalHeader({
  template,
  meta,
  examTitle,
}: {
  template: ReturnType<typeof getExamTemplate>;
  meta: ExamMeta;
  examTitle: string;
}) {
  const examTypeDisplay = meta.examType
    ? `${meta.semester ? meta.semester + ' ' : ''}${meta.examType}`
    : examTitle;

  return (
    <div
      className="p-0"
      style={{
        borderTop: '4px double #111',
        borderBottom: '2px solid #333',
      }}
    >
      <table className="w-full border-collapse text-black">
        <tbody>
          {/* 1행: 학교명 | 학년 | 시험유형 */}
          <tr>
            <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 w-16 text-center">학교</td>
            <td className="border border-gray-400 px-3 py-2.5 text-sm font-bold">{meta.schoolName || '○○학교'}</td>
            <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 w-16 text-center">학년</td>
            <td className="border border-gray-400 px-3 py-2.5 text-sm font-bold w-20">{meta.grade}</td>
            <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 w-16 text-center">시험</td>
            <td className="border border-gray-400 px-3 py-2.5 text-sm font-bold">{examTypeDisplay}</td>
          </tr>
          {/* 2행: 과목 | 출제 | 일시 */}
          <tr>
            <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 text-center">과목</td>
            <td className="border border-gray-400 px-3 py-2 text-sm font-bold">{meta.subject || '수학'}</td>
            <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 text-center">출제</td>
            <td className="border border-gray-400 px-3 py-2 text-sm">{meta.teacher}</td>
            <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 text-center">
              {meta.timeLimit ? '시간' : '일시'}
            </td>
            <td className="border border-gray-400 px-3 py-2 text-sm">{meta.timeLimit || meta.date}</td>
          </tr>
          {/* 3행: 학생 정보란 */}
          {template.studentFields.length > 0 && (
            <tr>
              <td colSpan={6} className="border border-gray-400 px-4 py-2.5">
                <div className="flex items-center justify-between text-sm text-gray-700">
                  <div className="flex items-center gap-6">
                    {meta.grade && (
                      <span className="font-medium">{meta.grade}</span>
                    )}
                    {template.studentFields.includes('class') && (
                      <span>반: <span className="inline-block w-12 border-b border-gray-400" /></span>
                    )}
                    {template.studentFields.includes('number') && (
                      <span>번호: <span className="inline-block w-10 border-b border-gray-400" /></span>
                    )}
                    {template.studentFields.includes('name') && (
                      <span>성명: <span className="inline-block w-24 border-b border-gray-400" /></span>
                    )}
                  </div>
                  {template.studentFields.includes('score') && (
                    <span className="font-medium">점수: <span className="inline-block w-12 border-b border-gray-400" /> / {meta.totalScore || '100'}</span>
                  )}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// centered: 중앙정렬형
// ============================================================================

function CenteredHeader({
  template,
  meta,
  examTitle,
}: {
  template: ReturnType<typeof getExamTemplate>;
  meta: ExamMeta;
  examTitle: string;
}) {
  const examTypeDisplay = meta.examType
    ? `${meta.semester ? meta.semester + ' ' : ''}${meta.examType}`
    : '';

  return (
    <div
      className="text-black"
      style={{
        borderTop: '4px double #111',
        borderBottom: '2px solid #333',
      }}
    >
      {/* 학교명 */}
      <div className="text-center pt-5 pb-1">
        <h1 className="text-xl font-bold tracking-[0.3em]">
          {meta.schoolName || '○ ○ 학 교'}
        </h1>
      </div>

      {/* 시험유형 */}
      {(examTypeDisplay || examTitle) && (
        <div className="text-center pb-1">
          <h2 className="text-base font-semibold text-gray-800">
            {examTypeDisplay || examTitle}
          </h2>
        </div>
      )}

      {/* 과목 + 시간 */}
      <div className="text-center pb-3">
        <div className="flex items-center justify-center gap-8 text-sm text-gray-700">
          {meta.subject && <span className="font-medium">{meta.subject}</span>}
          {meta.timeLimit && <span>시간: {meta.timeLimit}</span>}
          {meta.date && <span>{meta.date}</span>}
        </div>
      </div>

      {/* 구분선 + 학생 정보 */}
      {template.studentFields.length > 0 && (
        <div className="border-t border-gray-300 px-6 py-2.5">
          <div className="flex items-center justify-center gap-8 text-sm text-gray-700">
            {meta.grade && <span className="font-medium">{meta.grade}</span>}
            {template.studentFields.includes('class') && (
              <span>반: <span className="inline-block w-12 border-b border-gray-400" /></span>
            )}
            {template.studentFields.includes('number') && (
              <span>번호: <span className="inline-block w-10 border-b border-gray-400" /></span>
            )}
            {template.studentFields.includes('name') && (
              <span>성명: <span className="inline-block w-24 border-b border-gray-400" /></span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// bordered-box: 학교시험B / 학원형
// ============================================================================

function BorderedBoxHeader({
  template,
  meta,
  examTitle,
}: {
  template: ReturnType<typeof getExamTemplate>;
  meta: ExamMeta;
  examTitle: string;
}) {
  const isAcademy = template.id === 'academy';
  const examTypeDisplay = meta.examType
    ? `${meta.semester ? meta.semester + ' ' : ''}${meta.examType}`
    : '';

  return (
    <div
      className="text-black"
      style={{
        border: '3px solid #111',
        borderBottom: '2px solid #333',
      }}
    >
      {/* 상단: 학교/학원명 + 시험유형 */}
      <div className="text-center px-4 pt-4 pb-2" style={{ borderBottom: '1px solid #ccc' }}>
        <h1 className="text-lg font-bold">
          {meta.schoolName || (isAcademy ? '○○학원' : '○○학교')}
        </h1>
        {(examTypeDisplay || examTitle) && (
          <p className="text-sm text-gray-700 mt-0.5">
            {examTypeDisplay || examTitle}
          </p>
        )}
      </div>

      {/* 중단: 정보 테이블 */}
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td className="border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-50 w-16 text-center">과목</td>
            <td className="border border-gray-300 px-3 py-1.5 text-sm font-bold">{meta.subject || '수학'}</td>
            {meta.teacher && (
              <>
                <td className="border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-50 w-16 text-center">
                  {isAcademy ? '담당' : '출제'}
                </td>
                <td className="border border-gray-300 px-3 py-1.5 text-sm">{meta.teacher}</td>
              </>
            )}
            {meta.date && (
              <>
                <td className="border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-50 w-16 text-center">일시</td>
                <td className="border border-gray-300 px-3 py-1.5 text-sm">{meta.date}</td>
              </>
            )}
          </tr>
        </tbody>
      </table>

      {/* 하단: 학생 정보란 */}
      {template.studentFields.length > 0 && (
        <div className="px-4 py-2.5" style={{ borderTop: '1px solid #ccc' }}>
          <div className="flex items-center justify-between text-sm text-gray-700">
            <div className="flex items-center gap-6">
              {meta.grade && <span className="font-medium">{meta.grade}</span>}
              {template.studentFields.includes('class') && (
                <span>반: <span className="inline-block w-12 border-b border-gray-400" /></span>
              )}
              {template.studentFields.includes('name') && (
                <span>성명: <span className="inline-block w-24 border-b border-gray-400" /></span>
              )}
            </div>
            {template.studentFields.includes('score') && (
              <span className="font-medium">점수: <span className="inline-block w-12 border-b border-gray-400" /> / {meta.totalScore || '100'}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ExamPaperHeader;
