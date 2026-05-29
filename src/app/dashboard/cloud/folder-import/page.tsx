'use client';

// ============================================================================
// 학교 기출 단원집 폴더 import — 2026-05-28
//
// 사용 시나리오:
//   사용자가 OneDrive 의 폴더(`매쓰플랫 학교 기출자료 업로드용/중2/동래구/1/`)를
//   통째로 선택 → 폴더 경로 + 파일명에서 grade/district/semester/exam_year/
//   schoolName/chapter/examRound/documentType 자동 추출 → 미리보기에서 확인
//   (잘못 파싱된 행은 수정) → 자산화 시작 → 파일 1개씩 sequential POST →
//   사후 리포트.
//
// 안전 가드:
//   - sourceCategory='school' 명시 → exam_type='학교기출' 박힘
//   - 파일 단위 try/catch — 1개 실패해도 다음 파일 계속
//   - 사전 dry-run — 중복 검사로 사용자 혼선 방지
//   - CLAUDE.md 안전 가드 #5 — 사용자 트리거 일괄 작업은 클라이언트 sequential
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, FolderUp, AlertCircle, CheckCircle2, XCircle, Loader2, MapPin, Upload } from 'lucide-react';
import Link from 'next/link';
import { extractFolderMeta, toSchoolMetaPayload, type FolderMetaResult } from '@/lib/workflow/folder-meta-extract';

const SIDO_OPTIONS = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

type FileStatus = 'pending' | 'duplicate' | 'in_progress' | 'success' | 'failed' | 'skipped';

interface FileRow {
  file: File;
  path: string;          // webkitRelativePath
  meta: FolderMetaResult;
  status: FileStatus;
  examId?: string;
  problemCount?: number;
  error?: string;
  duplicateOf?: { id: string; title: string; created_at: string };
}

type Step = 'select' | 'preview' | 'progress' | 'report';

export default function FolderImportPage() {
  const [step, setStep] = useState<Step>('select');
  const [sido, setSido] = useState<string>('부산');
  const [rows, setRows] = useState<FileRow[]>([]);
  const [duplicateCheckLoading, setDuplicateCheckLoading] = useState(false);
  const [overwriteDuplicates, setOverwriteDuplicates] = useState(false);

  // ── STEP 1: 폴더 선택 ──
  const onFolderSelected = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const pdfFiles: FileRow[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      if (!/\.pdf$/i.test(f.name)) continue;
      // 문제지·정답지·빠른정답 중 문제지만 자산화 (정답지/빠른정답은 보조)
      // 일단 모두 미리보기에 표시. 사용자가 documentType 보고 판단.
      const meta = extractFolderMeta(path, sido);
      pdfFiles.push({
        file: f,
        path,
        meta,
        status: 'pending',
      });
    }
    if (pdfFiles.length === 0) {
      alert('PDF 파일이 폴더에 없습니다.');
      return;
    }
    setRows(pdfFiles);

    // 사전 중복 검사
    setDuplicateCheckLoading(true);
    try {
      const items = pdfFiles.map((r) => ({
        school_name: r.meta.schoolNameNormalized,
        grade: r.meta.grade,
        semester: r.meta.semester,
        chapter: r.meta.chapter,
        exam_round: r.meta.examRound,
      }));
      const res = await fetch('/api/exams/duplicate-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        const data = (await res.json()) as { duplicates: Record<string, { id: string; title: string; created_at: string }> };
        const next = pdfFiles.map((r, i) => {
          const dup = data.duplicates[String(i)];
          if (dup) {
            return { ...r, status: 'duplicate' as FileStatus, duplicateOf: dup };
          }
          return r;
        });
        setRows(next);
      }
    } catch (e) {
      console.warn('[folder-import] 중복 검사 실패 — 계속 진행', e);
    } finally {
      setDuplicateCheckLoading(false);
    }

    setStep('preview');
  }, [sido]);

  // 시도 변경 시 district 재계산
  const onSidoChange = useCallback((newSido: string) => {
    setSido(newSido);
    setRows((prev) => prev.map((r) => {
      const meta = extractFolderMeta(r.path, newSido);
      return { ...r, meta };
    }));
  }, []);

  // 메타 수동 편집
  const updateRowMeta = useCallback((idx: number, patch: Partial<FolderMetaResult>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, meta: { ...r.meta, ...patch } } : r)));
  }, []);

  // ── STEP 2: 자산화 시작 ──
  const startImport = useCallback(async () => {
    setStep('progress');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // 중복 + 덮어쓰기 끔 → 스킵
      if (row.status === 'duplicate' && !overwriteDuplicates) {
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, status: 'skipped' } : r)));
        continue;
      }
      // 정답지·빠른정답은 문제지에 묶이는 보조 자료이지만, 현재는 단일 PDF 자산화만 — 일단 스킵.
      if (row.meta.documentType !== 'PROBLEM') {
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, status: 'skipped' } : r)));
        continue;
      }

      setRows((prev) => prev.map((r, j) => (j === i ? { ...r, status: 'in_progress' } : r)));

      try {
        const formData = new FormData();
        formData.append('file', row.file);
        formData.append('documentType', 'PROBLEM');
        formData.append('autoClassify', 'true');
        formData.append('generateSolutions', 'false');
        formData.append('sourceCategory', 'school');
        formData.append('subjectArea', 'math');
        formData.append('schoolMeta', JSON.stringify(toSchoolMetaPayload(row.meta)));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 295_000); // CLAUDE.md #5 — 295s
        const res = await fetch('/api/workflow/upload', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        const data = (await res.json()) as { autoSavedExamId?: string | null; jobId: string; classifyCompleted?: boolean };

        setRows((prev) => prev.map((r, j) => (j === i ? {
          ...r,
          status: data.autoSavedExamId ? 'success' : 'failed',
          examId: data.autoSavedExamId || undefined,
          error: data.autoSavedExamId ? undefined : '자동 자산화 실패 (수동 분석 필요)',
        } : r)));

        // 호흡 (CLAUDE.md #5)
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (e) {
        setRows((prev) => prev.map((r, j) => (j === i ? {
          ...r,
          status: 'failed',
          error: e instanceof Error ? e.message : String(e),
        } : r)));
      }
    }

    setStep('report');
  }, [rows, overwriteDuplicates]);

  // 통계
  const stats = useMemo(() => {
    const success = rows.filter((r) => r.status === 'success').length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    const skipped = rows.filter((r) => r.status === 'skipped').length;
    const duplicate = rows.filter((r) => r.status === 'duplicate').length;
    return { success, failed, skipped, duplicate, total: rows.length };
  }, [rows]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/cloud" className="text-zinc-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">학교 기출 단원집 폴더 import</h1>
          <div className="ml-auto text-sm text-zinc-400">
            STEP {step === 'select' ? '1' : step === 'preview' ? '2' : step === 'progress' ? '3' : '4'} / 4
          </div>
        </div>

        {/* STEP 1: 폴더 선택 */}
        {step === 'select' && (
          <div className="bg-zinc-900 rounded-xl p-8 border border-zinc-800">
            <div className="flex items-center gap-2 mb-4 text-zinc-300">
              <MapPin className="w-4 h-4" />
              <label className="text-sm">시도 (폴더 안 동래구·강남구 등 시군구의 상위 시도)</label>
            </div>
            <select
              value={sido}
              onChange={(e) => setSido(e.target.value)}
              className="bg-zinc-800 text-white rounded-lg px-4 py-2 mb-6 border border-zinc-700 focus:border-blue-500 outline-none"
            >
              {SIDO_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <div className="border-2 border-dashed border-zinc-700 rounded-xl p-12 text-center">
              <FolderUp className="w-16 h-16 mx-auto mb-4 text-zinc-500" />
              <div className="text-lg font-medium mb-2">학교 기출 폴더 선택</div>
              <div className="text-sm text-zinc-400 mb-6">
                폴더 구조: <code className="text-zinc-300">중2/동래구/1/260528_동래중학교 - 방정식_문제지.pdf</code>
              </div>
              <label className="inline-block">
                <input
                  type="file"
                  // @ts-expect-error — webkitdirectory 는 표준 React 타입에 없음
                  webkitdirectory="true"
                  directory="true"
                  multiple
                  className="hidden"
                  onChange={(e) => onFolderSelected(e.target.files)}
                />
                <span className="bg-blue-600 hover:bg-blue-500 transition px-6 py-3 rounded-lg font-medium cursor-pointer inline-flex items-center gap-2">
                  <FolderUp className="w-4 h-4" />
                  폴더 선택
                </span>
              </label>
              <div className="text-xs text-zinc-500 mt-4">
                Chrome/Edge 권장 — Safari·Firefox 는 폴더 선택 미지원
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: 미리보기 */}
        {step === 'preview' && (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-sm text-zinc-400">
                {rows.length} 개 PDF — 신규 <span className="text-emerald-400">{rows.filter((r) => r.status === 'pending').length}</span>,
                중복 <span className="text-amber-400">{rows.filter((r) => r.status === 'duplicate').length}</span>
              </div>
              {duplicateCheckLoading && (
                <span className="text-xs text-zinc-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> 중복 검사 중
                </span>
              )}
              <div className="ml-auto flex items-center gap-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwriteDuplicates}
                    onChange={(e) => setOverwriteDuplicates(e.target.checked)}
                    className="accent-blue-500"
                  />
                  중복도 다시 자산화
                </label>
                <select
                  value={sido}
                  onChange={(e) => onSidoChange(e.target.value)}
                  className="bg-zinc-800 text-white rounded-lg px-3 py-1.5 border border-zinc-700"
                >
                  {SIDO_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800 text-zinc-400 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">파일명</th>
                    <th className="px-3 py-2 text-left">학교</th>
                    <th className="px-3 py-2 text-left">학년·학기</th>
                    <th className="px-3 py-2 text-left">단원</th>
                    <th className="px-3 py-2 text-left">회차</th>
                    <th className="px-3 py-2 text-left">년도</th>
                    <th className="px-3 py-2 text-left">지역</th>
                    <th className="px-3 py-2 text-left">종류</th>
                    <th className="px-3 py-2 text-left">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-850">
                      <td className="px-3 py-2 text-zinc-300 max-w-xs truncate" title={r.path}>{r.file.name}</td>
                      <td className="px-3 py-2">
                        <input
                          value={r.meta.schoolNameNormalized || ''}
                          onChange={(e) => updateRowMeta(i, { schoolNameNormalized: e.target.value || null, schoolName: e.target.value || null })}
                          className="bg-zinc-800 px-2 py-1 rounded w-24 border border-zinc-700"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={r.meta.grade != null ? `${r.meta.schoolLevel || ''}${r.meta.grade}-${r.meta.semester || ''}` : ''}
                          onChange={(e) => {
                            const m = e.target.value.match(/^(초|중|고)?(\d)?(?:-([12]))?$/);
                            if (m) {
                              updateRowMeta(i, {
                                schoolLevel: (m[1] as '초' | '중' | '고') || null,
                                grade: m[2] ? Number(m[2]) : null,
                                semester: m[3] ? (Number(m[3]) as 1 | 2) : null,
                              });
                            }
                          }}
                          placeholder="중2-1"
                          className="bg-zinc-800 px-2 py-1 rounded w-20 border border-zinc-700"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={r.meta.chapter || ''}
                          onChange={(e) => updateRowMeta(i, { chapter: e.target.value || null })}
                          className="bg-zinc-800 px-2 py-1 rounded w-32 border border-zinc-700"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.meta.examRound || '단원집'}
                          onChange={(e) => updateRowMeta(i, { examRound: e.target.value })}
                          className="bg-zinc-800 px-2 py-1 rounded border border-zinc-700"
                        >
                          <option value="단원집">단원집</option>
                          <option value="중간">중간</option>
                          <option value="기말">기말</option>
                          <option value="수행평가">수행평가</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={r.meta.examYear || ''}
                          onChange={(e) => updateRowMeta(i, { examYear: Number(e.target.value) || null })}
                          className="bg-zinc-800 px-2 py-1 rounded w-20 border border-zinc-700"
                        />
                      </td>
                      <td className="px-3 py-2 text-zinc-400 text-xs">{r.meta.district || '미감지'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          r.meta.documentType === 'PROBLEM' ? 'bg-blue-900/40 text-blue-300' :
                          r.meta.documentType === 'ANSWER' ? 'bg-zinc-700 text-zinc-300' :
                          'bg-zinc-700 text-zinc-300'
                        }`}>
                          {r.meta.documentType === 'PROBLEM' ? '문제지' : r.meta.documentType === 'ANSWER' ? '정답지' : '빠른정답'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.status === 'duplicate' ? (
                          <span className="text-amber-400 text-xs flex items-center gap-1" title={r.duplicateOf?.title}>
                            <AlertCircle className="w-3 h-3" /> 중복
                          </span>
                        ) : r.meta.warnings.length > 0 ? (
                          <span className="text-amber-300 text-xs" title={r.meta.warnings.join(', ')}>
                            ⚠ {r.meta.warnings.length}
                          </span>
                        ) : (
                          <span className="text-emerald-400 text-xs">✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setRows([]); setStep('select'); }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition"
              >
                다시 선택
              </button>
              <button
                onClick={startImport}
                disabled={rows.length === 0}
                className="ml-auto px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg font-medium transition flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                자산화 시작 ({rows.filter((r) => r.status !== 'duplicate' || overwriteDuplicates).filter((r) => r.meta.documentType === 'PROBLEM').length} 건)
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: 진행 */}
        {step === 'progress' && (
          <div>
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mb-4">
              <div className="text-lg font-medium mb-2">자산화 진행 중</div>
              <div className="text-sm text-zinc-400">
                {stats.success + stats.failed + stats.skipped} / {stats.total} 완료
                — 성공 <span className="text-emerald-400">{stats.success}</span>,
                실패 <span className="text-red-400">{stats.failed}</span>,
                스킵 <span className="text-zinc-500">{stats.skipped}</span>
              </div>
            </div>
            <ProgressTable rows={rows} />
          </div>
        )}

        {/* STEP 4: 리포트 */}
        {step === 'report' && (
          <div>
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mb-4">
              <div className="text-2xl font-bold mb-3">자산화 완료</div>
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="성공" value={stats.success} colorClass="text-emerald-400" />
                <StatCard label="실패" value={stats.failed} colorClass="text-red-400" />
                <StatCard label="중복 스킵" value={stats.duplicate} colorClass="text-amber-400" />
                <StatCard label="기타 스킵" value={stats.skipped - stats.duplicate} colorClass="text-zinc-500" />
              </div>
            </div>
            <ProgressTable rows={rows} />
            <div className="mt-6">
              <Link
                href="/dashboard/cloud"
                className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition"
              >
                클라우드로 이동
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <div className="text-xs text-zinc-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}

function ProgressTable({ rows }: { rows: FileRow[] }) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-800 text-zinc-400 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left">파일명</th>
            <th className="px-3 py-2 text-left">학교 / 단원</th>
            <th className="px-3 py-2 text-left">상태</th>
            <th className="px-3 py-2 text-left">결과</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800">
              <td className="px-3 py-2 text-zinc-300 max-w-xs truncate">{r.file.name}</td>
              <td className="px-3 py-2 text-zinc-400">
                {r.meta.schoolNameNormalized} / {r.meta.chapter || '—'}
              </td>
              <td className="px-3 py-2">
                {r.status === 'pending' && <span className="text-zinc-500">대기</span>}
                {r.status === 'in_progress' && (
                  <span className="text-blue-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> 자산화 중
                  </span>
                )}
                {r.status === 'success' && (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> 성공
                  </span>
                )}
                {r.status === 'failed' && (
                  <span className="text-red-400 flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> 실패
                  </span>
                )}
                {r.status === 'duplicate' && (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> 중복
                  </span>
                )}
                {r.status === 'skipped' && <span className="text-zinc-500">스킵</span>}
              </td>
              <td className="px-3 py-2 text-xs">
                {r.examId && (
                  <Link href={`/dashboard/cloud/${r.examId}`} className="text-blue-400 hover:underline">
                    시험지 보기
                  </Link>
                )}
                {r.error && <span className="text-red-400" title={r.error}>{r.error.slice(0, 60)}</span>}
                {r.duplicateOf && (
                  <span className="text-amber-400" title={r.duplicateOf.title}>
                    {r.duplicateOf.title.slice(0, 30)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
