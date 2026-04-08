'use client';

// ============================================================================
// Cloud Flow Uploader Component
// PDF 업로드 → OCR → AI 분류/해설 자동화 UI
// ============================================================================

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
  Brain,
  FileSearch,
  Clock,
  ChevronDown,
  ChevronUp,
  Trash2,
  Beaker,
  Calculator,
  ImagePlus,
  AlertTriangle,
} from 'lucide-react';
import type { UploadJob, ProcessingStatus, LLMAnalysisResult } from '@/types/workflow';
import { getStatusLabel, getStatusColor } from '@/lib/workflow/cloud-flow';
import {
  SCIENCE_SUBJECTS,
  type ScienceSubjectCode,
  type CurriculumVersion,
  type ScienceSubjectMeta,
} from '@/lib/image-pipeline/types';

interface CloudFlowUploaderProps {
  instituteId?: string;
  userId?: string;
  /** 업로드 시 연결할 북그룹 ID */
  bookGroupId?: string;
  /** 기존 시험지에 병합 (문제 추가 기능) */
  appendToExamId?: string;
  onComplete?: (results: LLMAnalysisResult[]) => void;
  /** true이면 업로드 시작 후 바로 분석 페이지로 이동 */
  autoNavigateToAnalyze?: boolean;
  /** 기존 업로드된 파일명 목록 (중복 체크용) */
  existingFileNames?: string[];
}

interface JobWithResults extends UploadJob {
  results?: LLMAnalysisResult[];
}

export default function CloudFlowUploader({
  instituteId = 'default',
  userId = 'user',
  bookGroupId,
  appendToExamId,
  onComplete,
  autoNavigateToAnalyze = false,
  existingFileNames = [],
}: CloudFlowUploaderProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobWithResults[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Staged Upload State
  const [activeTab, setActiveTab] = useState<'PROBLEM' | 'ANSWER' | 'QUICK_ANSWER'>('PROBLEM');
  const [pendingFiles, setPendingFiles] = useState<{
    PROBLEM: File | null;
    ANSWER: File | null;
    QUICK_ANSWER: File | null;
  }>({
    PROBLEM: null,
    ANSWER: null,
    QUICK_ANSWER: null,
  });

  // 과목 선택 상태
  const [subjectArea, setSubjectArea] = useState<'math' | 'science'>('math');
  const [scienceSubject, setScienceSubject] = useState<ScienceSubjectCode>('IS1');
  const [curriculumVersion, setCurriculumVersion] = useState<CurriculumVersion>('2022');

  // 과학 처리 모드: 'diagrams_only' = 도식 추출만 | 'full' = 문제까지 자산화
  const [scienceMode, setScienceMode] = useState<'diagrams_only' | 'full'>('full');

  const [autoClassify, setAutoClassify] = useState(false); // 기본 OFF — 분석 페이지에서 수동/AI 감지 선택
  const [generateSolutions, setGenerateSolutions] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // 카테고리별 과학 과목 그룹 (중복 제거)
  const scienceSubjectGroups = useMemo(() => {
    const groups: Record<string, { label: string; subjects: ScienceSubjectMeta[] }> = {
      middle: { label: '중학교', subjects: [] },
      common: { label: '고등 공통', subjects: [] },
      general: { label: '고등 일반선택', subjects: [] },
      career: { label: '고등 진로선택', subjects: [] },
      fusion: { label: '고등 융합선택', subjects: [] },
    };
    const seen = new Set<string>();
    for (const s of SCIENCE_SUBJECTS) {
      const key = `${s.code}-${s.category}`;
      if (!seen.has(key)) {
        seen.add(key);
        groups[s.category].subjects.push(s);
      }
    }
    return groups;
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // ★ 중복 파일명 경고 상태
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // 파일 선택 처리 (Staging)
  const handleFileSelect = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // 현재 활성화된 탭에 파일 할당 (첫 번째 파일만)
    const file = fileArray[0];

    // ★ 중복 체크 — 기존 업로드된 파일명과 비교
    if (activeTab === 'PROBLEM' && existingFileNames.length > 0) {
      const baseName = file.name.replace(/\.[^.]+$/, '').trim().toLowerCase();
      const found = existingFileNames.find(n =>
        n.replace(/\.[^.]+$/, '').trim().toLowerCase() === baseName
      );
      if (found) {
        setDuplicateWarning(`"${file.name}" — 이미 업로드된 자료입니다 ("${found}")`);
      } else {
        setDuplicateWarning(null);
      }
    }

    setPendingFiles(prev => ({
      ...prev,
      [activeTab]: file
    }));
  }, [activeTab, existingFileNames]);

  // 업로드 시작 (Processing)
  const startProcessing = useCallback(async () => {
    const problemFile = pendingFiles.PROBLEM;
    if (!problemFile) {
      alert('문제지 파일은 필수입니다.');
      return;
    }

    // 임시 Job 생성
    const tempJob: JobWithResults = {
      id: `temp-${Date.now()}`,
      userId,
      instituteId,
      fileName: problemFile.name,
      fileSize: problemFile.size,
      fileType: getFileType(problemFile.name),
      documentType: 'PROBLEM',
      storagePath: '',
      status: 'UPLOADING',
      progress: 0,
      currentStep: '업로드 준비 중...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setJobs((prev) => [tempJob, ...prev]);

    try {
      const formData = new FormData();
      formData.append('file', problemFile); // Main Problem File

      if (pendingFiles.ANSWER) {
        formData.append('answerFile', pendingFiles.ANSWER);
      }
      if (pendingFiles.QUICK_ANSWER) {
        formData.append('quickAnswerFile', pendingFiles.QUICK_ANSWER);
      }

      formData.append('instituteId', instituteId);
      formData.append('userId', userId);
      formData.append('documentType', 'PROBLEM');
      formData.append('subjectArea', subjectArea);

      if (subjectArea === 'science') {
        formData.append('scienceSubject', scienceSubject);
        formData.append('curriculumVersion', curriculumVersion);
        formData.append('scienceMode', scienceMode); // ★ 서버에 모드 전달
        // 과학은 항상 autoClassify OFF — full 모드에서도 분석 페이지에서 수동 크롭/감지
        formData.append('autoClassify', 'false');
        formData.append('generateSolutions', 'false');
      } else {
        // 수학 모드: 기존 OCR/분류 파이프라인
        formData.append('autoClassify', String(autoClassify));
        formData.append('generateSolutions', String(generateSolutions));
      }
      if (bookGroupId) {
        formData.append('bookGroupId', bookGroupId);
      }
      if (appendToExamId) {
        formData.append('appendTo', appendToExamId);
      }

      // 과학 도식 추출 모드: 서버에서 추출 완료까지 대기하므로 상태 표시 업데이트
      if (subjectArea === 'science' && scienceMode === 'diagrams_only') {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === tempJob.id
              ? { ...j, currentStep: '도식 이미지 추출 중... (수 분 소요)' }
              : j
          )
        );
      }

      const response = await fetch('/api/workflow/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '서버 응답 오류' }));
        throw new Error(errorData.error || errorData.message || `업로드 실패 (${response.status})`);
      }

      const data = await response.json();

      // 실제 Job ID로 업데이트 및 파일 목록 초기화
      setJobs((prev) =>
        prev.map((j) =>
          j.id === tempJob.id
            ? {
              ...j,
              id: data.jobId,
              status: data.job.status,
              progress: data.job.progress,
            }
            : j
        )
      );

      setPendingFiles({
        PROBLEM: null,
        ANSWER: null,
        QUICK_ANSWER: null,
      });

      // ★ 과학 도식 추출만 모드: 갤러리로 이동 (jobId 전달하여 진행상태 표시)
      if (subjectArea === 'science' && scienceMode === 'diagrams_only') {
        router.push(`/dashboard/materials/diagrams?uploading=true&jobId=${data.jobId}&fileName=${encodeURIComponent(problemFile.name)}`);
        return;
      }

      // ★ 과학 전체 모드: 항상 분석 페이지로 이동 (수동 크롭 → 분석 → 자산화)
      if (subjectArea === 'science' && scienceMode === 'full') {
        const params = new URLSearchParams();
        if (bookGroupId) params.set('bookGroupId', bookGroupId);
        params.set('subjectArea', 'science');
        params.set('scienceSubject', scienceSubject);
        params.set('curriculumVersion', curriculumVersion);
        const qs = params.toString();
        router.push(`/dashboard/workflow/analyze/${data.jobId}?${qs}`);
        return;
      }

      // 수학 모드: 분석 페이지로 이동 (appendTo 모드 포함)
      {
        const params = new URLSearchParams();
        if (bookGroupId) params.set('bookGroupId', bookGroupId);
        params.set('subjectArea', subjectArea);
        if (appendToExamId) params.set('appendTo', appendToExamId);
        const qs = params.toString();
        router.push(`/dashboard/workflow/analyze/${data.jobId}?${qs}`);
        return;
      }
    } catch (error) {
      console.error('Upload error:', error);
      const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
      alert(`업로드 실패: ${errorMsg}`);
      setJobs((prev) =>
        prev.map((j) =>
          j.id === tempJob.id
            ? {
              ...j,
              status: 'FAILED',
              error: errorMsg,
            }
            : j
        )
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles, userId, instituteId, autoClassify, generateSolutions, subjectArea, scienceSubject, curriculumVersion, scienceMode]);

  // Job 상태 폴링
  const startPolling = useCallback((jobId: string) => {
    let errorCount = 0;
    const MAX_ERRORS = 15; // 최대 15회 (30초) 연속 실패 시 폴링 중지

    const stopPolling = (id: string) => {
      const timer = pollingRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        pollingRef.current.delete(id);
      }
    };

    const poll = async () => {
      try {
        const response = await fetch(`/api/workflow/upload?jobId=${jobId}`);

        if (!response.ok) {
          errorCount++;
          console.warn(`[Polling] Job ${jobId}: HTTP ${response.status} (${errorCount}/${MAX_ERRORS})`);

          // 연속 실패 횟수 초과 시 폴링 중지 + FAILED 상태 설정
          if (errorCount >= MAX_ERRORS) {
            stopPolling(jobId);
            setJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? {
                    ...j,
                    status: 'FAILED' as ProcessingStatus,
                    error: '서버와 연결이 끊어졌습니다. 페이지를 새로고침 후 다시 시도해주세요.',
                  }
                  : j
              )
            );
          }
          return;
        }

        // 성공 시 에러 카운터 리셋
        errorCount = 0;

        const data = await response.json();
        const { job, results } = data;

        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                ...j,
                ...job,
                results: results || j.results,
              }
              : j
          )
        );

        // 완료 또는 실패 시 폴링 중지
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
          stopPolling(jobId);

          if (job.status === 'COMPLETED' && results && onComplete) {
            onComplete(results);
          }
        }
      } catch (error) {
        errorCount++;
        console.error('Polling error:', error);

        if (errorCount >= MAX_ERRORS) {
          stopPolling(jobId);
          setJobs((prev) =>
            prev.map((j) =>
              j.id === jobId
                ? {
                  ...j,
                  status: 'FAILED' as ProcessingStatus,
                  error: '네트워크 오류로 상태 확인에 실패했습니다.',
                }
                : j
            )
          );
        }
      }
    };

    // 즉시 한 번 실행
    poll();

    // 점진적 폴링: 초기 2초 → 최대 8초 (결과 없으면 간격 증가, 있으면 2초 복귀)
    let pollCount = 0;
    const getPollInterval = () => {
      pollCount++;
      if (pollCount <= 5) return 2000;   // 처음 10초: 2초
      if (pollCount <= 15) return 4000;  // 다음 40초: 4초
      return 8000;                        // 이후: 8초
    };

    const schedulePoll = () => {
      const timeout = setTimeout(async () => {
        await poll();
        // 아직 폴링 중이면 다음 스케줄
        if (pollingRef.current.has(jobId)) {
          schedulePoll();
        }
      }, getPollInterval());
      pollingRef.current.set(jobId, timeout);
    };

    schedulePoll();
  }, [onComplete]);

  // 드래그 앤 드롭
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  // Job 삭제
  const handleRemoveJob = (jobId: string) => {
    const timer = pollingRef.current.get(jobId);
    if (timer) {
      clearTimeout(timer);
      pollingRef.current.delete(jobId);
    }
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  // 파일 삭제 (Staging)
  const clearPendingFile = (type: 'PROBLEM' | 'ANSWER' | 'QUICK_ANSWER') => {
    setPendingFiles(prev => ({ ...prev, [type]: null }));
  };

  return (
    <div className="cloud-flow-uploader">
      {/* ── 과목 영역 선택 (수학/과학) ── */}
      <div className="subject-area-selector">
        <button
          className={`subject-area-btn ${subjectArea === 'math' ? 'active math' : ''}`}
          onClick={() => setSubjectArea('math')}
        >
          <Calculator size={16} />
          수학
        </button>
        <button
          className={`subject-area-btn ${subjectArea === 'science' ? 'active science' : ''}`}
          onClick={() => setSubjectArea('science')}
        >
          <Beaker size={16} />
          과학
        </button>
      </div>

      {/* ── 과학 세부 과목 선택 ── */}
      {subjectArea === 'science' && (
        <div className="science-subject-picker">
          <div className="science-picker-header">
            <select
              className="curriculum-version-select"
              value={curriculumVersion}
              onChange={(e) => setCurriculumVersion(e.target.value as CurriculumVersion)}
            >
              <option value="2022">2022 개정</option>
              <option value="2015">2015 개정</option>
            </select>
          </div>
          <div className="science-subject-groups">
            {Object.entries(scienceSubjectGroups).map(([cat, group]) => (
              group.subjects.length > 0 && (
                <div key={cat} className="science-group">
                  <span className="science-group-label">{group.label}</span>
                  <div className="science-group-items">
                    {group.subjects.map((s) => (
                      <button
                        key={s.code}
                        className={`science-subject-btn ${scienceSubject === s.code ? 'active' : ''}`}
                        onClick={() => setScienceSubject(s.code)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>

          {/* 과학 처리 모드 선택 */}
          <div className="science-mode-selector">
            <button
              className={`science-mode-btn ${scienceMode === 'diagrams_only' ? 'active' : ''}`}
              onClick={() => setScienceMode('diagrams_only')}
            >
              <ImagePlus size={14} />
              도식 추출만
            </button>
            <button
              className={`science-mode-btn ${scienceMode === 'full' ? 'active' : ''}`}
              onClick={() => setScienceMode('full')}
            >
              <Brain size={14} />
              문제 자산화까지
            </button>
          </div>
        </div>
      )}

      <div className="upload-controls">
        <div className="document-type-selector">
          <button
            className={`type-btn ${activeTab === 'PROBLEM' ? 'active' : ''}`}
            onClick={() => setActiveTab('PROBLEM')}
          >
            <FileText size={16} />
            문제지
            {pendingFiles.PROBLEM && <span className="absolute top-0 right-0 w-2 h-2 bg-indigo-500 rounded-full"></span>}
          </button>
          <button
            className={`type-btn ${activeTab === 'ANSWER' ? 'active' : ''}`}
            onClick={() => setActiveTab('ANSWER')}
          >
            <CheckCircle size={16} />
            해설지
            {pendingFiles.ANSWER && <span className="absolute top-0 right-0 w-2 h-2 bg-indigo-500 rounded-full"></span>}
          </button>
          <button
            className={`type-btn ${activeTab === 'QUICK_ANSWER' ? 'active' : ''}`}
            onClick={() => setActiveTab('QUICK_ANSWER')}
          >
            <Sparkles size={16} />
            빠른 답지
            {pendingFiles.QUICK_ANSWER && <span className="absolute top-0 right-0 w-2 h-2 bg-indigo-500 rounded-full"></span>}
          </button>
        </div>

        <div className="options">
          <label>
            <input
              type="checkbox"
              checked={autoClassify}
              onChange={(e) => setAutoClassify(e.target.checked)}
            />
            자동 분류
          </label>
          <label>
            <input
              type="checkbox"
              checked={generateSolutions}
              onChange={(e) => setGenerateSolutions(e.target.checked)}
            />
            AI 해설 생성
          </label>
        </div>
      </div>

      {/* 업로드 영역 */}
      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.hwp,.hwpx"
          onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
          className="hidden-input"
        />

        <div className="upload-icon">
          <Upload size={32} />
        </div>

        <h3>
          {activeTab === 'PROBLEM' ? '문제지' : activeTab === 'ANSWER' ? '해설지' : '빠른 답지'}
          파일을 드래그하거나 클릭하여 업로드
        </h3>

        {pendingFiles[activeTab] ? (
          <div className="mt-4 space-y-2">
            <div className="p-3 bg-zinc-800 rounded-lg flex items-center gap-3 border border-indigo-500/30">
              <CheckCircle className="text-indigo-400" size={20} />
              <span className="text-indigo-100 font-medium">{pendingFiles[activeTab]?.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); clearPendingFile(activeTab); setDuplicateWarning(null); }}
                className="ml-auto text-zinc-500 hover:text-red-400"
              >
                <XCircle size={18} />
              </button>
            </div>
            {/* ★ 중복 경고 */}
            {duplicateWarning && activeTab === 'PROBLEM' && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-amber-300 font-medium">{duplicateWarning}</p>
                  <p className="text-[10px] text-amber-400/70 mt-0.5">그래도 업로드하려면 시작 버튼을 누르세요.</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2 text-zinc-500 text-sm">
            PDF, 이미지, HWP 파일 지원
          </div>
        )}
      </div>

      {/* 대기 중인 파일 목록 및 시작 버튼 */}
      {(pendingFiles.PROBLEM || pendingFiles.ANSWER || pendingFiles.QUICK_ANSWER) && (
        <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800 mb-6">
          <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Upload size={14} /> 업로드 대기 목록
          </h4>
          <div className="space-y-2 mb-4">
            {pendingFiles.PROBLEM && (
              <div className="flex items-center justify-between text-sm p-2 bg-zinc-800 rounded border border-indigo-500/20">
                <span className="flex items-center gap-2 text-indigo-300">
                  <FileText size={14} /> 문제지: {pendingFiles.PROBLEM.name}
                </span>
              </div>
            )}
            {pendingFiles.ANSWER && (
              <div className="flex items-center justify-between text-sm p-2 bg-zinc-800 rounded border border-emerald-500/20">
                <span className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle size={14} /> 해설지: {pendingFiles.ANSWER.name}
                </span>
              </div>
            )}
            {pendingFiles.QUICK_ANSWER && (
              <div className="flex items-center justify-between text-sm p-2 bg-zinc-800 rounded border border-amber-500/20">
                <span className="flex items-center gap-2 text-amber-300">
                  <Sparkles size={14} /> 빠른 답지: {pendingFiles.QUICK_ANSWER.name}
                </span>
              </div>
            )}
            {!pendingFiles.PROBLEM && (
              <div className="text-sm text-rose-400 flex items-center gap-2 p-2">
                <XCircle size={14} /> 문제지 파일이 필요합니다.
              </div>
            )}
          </div>

          <button
            onClick={startProcessing}
            disabled={!pendingFiles.PROBLEM}
            className={`
                      w-full py-3 rounded-lg font-bold text-white transition-all
                      ${pendingFiles.PROBLEM
                ? 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'}
                  `}
          >
            분석 시작하기
          </button>
        </div>
      )}

      {/* Job 목록 */}
      {
        jobs.length > 0 && (
          <div className="job-list">
            <h4>처리 현황</h4>
            {jobs.map((job) => (
              <div key={job.id} className="job-card">
                <div className="job-header">
                  <div className="job-info">
                    <FileText size={18} />
                    <span className="job-name">{job.fileName}</span>
                    <span
                      className="job-status"
                      style={{ color: getStatusColor(job.status) }}
                    >
                      {getStatusLabel(job.status)}
                    </span>
                  </div>

                  <div className="job-actions">
                    {job.results && job.results.length > 0 && (
                      <button
                        className="expand-button"
                        onClick={() =>
                          setExpandedJobId(expandedJobId === job.id ? null : job.id)
                        }
                      >
                        {expandedJobId === job.id ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    )}
                    <button
                      className="remove-button"
                      onClick={() => handleRemoveJob(job.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* 진행률 바 */}
                {job.status !== 'COMPLETED' && job.status !== 'FAILED' && (
                  <div className="progress-section">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${job.progress}%`,
                          backgroundColor: getStatusColor(job.status),
                        }}
                      />
                    </div>
                    <div className="progress-info">
                      <span className="current-step">
                        <Loader2 size={12} className="spinning" />
                        {job.currentStep}
                      </span>
                      <span className="progress-percent">{job.progress}%</span>
                    </div>
                  </div>
                )}

                {/* 완료 상태 */}
                {job.status === 'COMPLETED' && job.results && (
                  <div className="completed-info" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle size={16} />
                      <span>{job.results.length}개 문제 분석 완료</span>
                    </div>
                    <a
                      href={bookGroupId ? `/dashboard/workflow/analyze/${job.id}?bookGroupId=${bookGroupId}` : `/dashboard/workflow/analyze/${job.id}`}
                      className="analyze-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      문제 확인하기 →
                    </a>
                  </div>
                )}

                {/* 실패 상태 */}
                {job.status === 'FAILED' && (
                  <div className="failed-info">
                    <XCircle size={16} />
                    <span>{job.error || '처리 실패'}</span>
                  </div>
                )}

                {/* 분석 결과 상세 */}
                {expandedJobId === job.id && job.results && (
                  <div className="results-detail">
                    {job.results.map((result, idx) => (
                      <div key={idx} className="result-item">
                        <div className="result-header">
                          <span className="type-code">
                            {result.classification.typeCode}
                          </span>
                          <span className="type-name">
                            {result.classification.typeName}
                          </span>
                        </div>
                        <div className="result-meta">
                          <span>{result.classification.subject}</span>
                          <span>{result.classification.chapter}</span>
                          <span>난이도 {result.classification.difficulty}</span>
                          <span>
                            <Clock size={12} />
                            {result.estimatedTimeMinutes}분
                          </span>
                        </div>
                        <div className="result-tags">
                          {result.keywordsTags.map((tag, i) => (
                            <span key={i} className="tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      }

      <style jsx>{`
        .cloud-flow-uploader {
          width: 100%;
        }

        .subject-area-selector {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .subject-area-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: rgba(39, 39, 42, 0.5);
          border: 2px solid rgba(255, 255, 255, 0.08);
          color: #a1a1aa;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 10px;
          transition: all 0.2s;
          flex: 1;
          justify-content: center;
        }

        .subject-area-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.05);
        }

        .subject-area-btn.active.math {
          background: rgba(99, 102, 241, 0.15);
          border-color: rgba(99, 102, 241, 0.5);
          color: #a5b4fc;
        }

        .subject-area-btn.active.science {
          background: rgba(16, 185, 129, 0.15);
          border-color: rgba(16, 185, 129, 0.5);
          color: #6ee7b7;
        }

        .science-subject-picker {
          margin-bottom: 16px;
          padding: 16px;
          background: rgba(16, 185, 129, 0.05);
          border: 1px solid rgba(16, 185, 129, 0.15);
          border-radius: 12px;
        }

        .science-picker-header {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 12px;
        }

        .curriculum-version-select {
          padding: 4px 10px;
          background: rgba(39, 39, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #d4d4d8;
          font-size: 12px;
          cursor: pointer;
        }

        .curriculum-version-select:focus {
          outline: none;
          border-color: rgba(16, 185, 129, 0.5);
        }

        .science-subject-groups {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .science-group {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .science-group-label {
          font-size: 11px;
          font-weight: 600;
          color: #71717a;
          min-width: 90px;
          padding-top: 6px;
          white-space: nowrap;
        }

        .science-group-items {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .science-subject-btn {
          padding: 5px 12px;
          background: rgba(39, 39, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: #a1a1aa;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }

        .science-subject-btn:hover {
          color: #ffffff;
          border-color: rgba(16, 185, 129, 0.3);
        }

        .science-subject-btn.active {
          background: rgba(16, 185, 129, 0.2);
          border-color: rgba(16, 185, 129, 0.5);
          color: #6ee7b7;
          font-weight: 600;
        }

        .science-mode-selector {
          display: flex;
          gap: 6px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(16, 185, 129, 0.1);
        }

        .science-mode-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          background: rgba(39, 39, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: #a1a1aa;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          flex: 1;
          justify-content: center;
        }

        .science-mode-btn:hover {
          color: #ffffff;
          border-color: rgba(16, 185, 129, 0.3);
        }

        .science-mode-btn.active {
          background: rgba(16, 185, 129, 0.15);
          border-color: rgba(16, 185, 129, 0.5);
          color: #6ee7b7;
          font-weight: 600;
        }

        .upload-zone {
          border: 2px dashed rgba(99, 102, 241, 0.3);
          border-radius: 16px;
          padding: 40px 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
          background: rgba(24, 24, 27, 0.6);
        }

        .upload-zone:hover,
        .upload-zone.dragging {
          border-color: rgba(99, 102, 241, 0.6);
          background: rgba(79, 70, 229, 0.1);
        }

        .hidden-input {
          display: none;
        }

        .upload-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .upload-zone h3 {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 600;
          color: #ffffff;
        }

        .upload-zone p {
          margin: 0 0 20px;
          font-size: 13px;
          color: #a1a1aa;
        }

        .upload-features {
          display: flex;
          justify-content: center;
          gap: 24px;
        }

        .feature {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #a5b4fc;
        }

        .upload-options {
          display: flex;
          justify-content: center;
          gap: 24px;
          margin-top: 16px;
        }

        .option {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #d4d4d8;
          cursor: pointer;
        }

        .option input {
          width: 16px;
          height: 16px;
          accent-color: #6366f1;
        }

        .job-list {
          margin-top: 24px;
        }

        .job-list h4 {
          margin: 0 0 12px;
          font-size: 14px;
          font-weight: 600;
          color: #e4e4e7;
        }

        .job-card {
          background: rgba(39, 39, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 12px;
        }

        .job-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .job-info {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #a1a1aa;
        }

        .job-name {
          font-size: 14px;
          font-weight: 500;
          color: #ffffff;
        }

        .job-status {
          font-size: 12px;
          font-weight: 600;
        }

        .job-actions {
          display: flex;
          gap: 8px;
        }

        .expand-button,
        .remove-button {
          padding: 6px;
          background: none;
          border: none;
          color: #71717a;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .expand-button:hover {
          background: rgba(99, 102, 241, 0.1);
          color: #a5b4fc;
        }

        .remove-button:hover {
          background: rgba(220, 38, 38, 0.1);
          color: #f87171;
        }

        .progress-section {
          margin-top: 12px;
        }

        .progress-bar {
          height: 6px;
          background: rgba(63, 63, 70, 0.5);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          margin-top: 6px;
        }

        .current-step {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #a1a1aa;
        }

        .progress-percent {
          font-size: 12px;
          font-weight: 600;
          color: #e4e4e7;
        }

        .completed-info {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 8px 12px;
          background: rgba(22, 163, 74, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.2);
          border-radius: 8px;
          font-size: 13px;
          color: #4ade80;
        }

        .failed-info {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 8px 12px;
          background: rgba(220, 38, 38, 0.15);
          border: 1px solid rgba(248, 113, 113, 0.2);
          border-radius: 8px;
          font-size: 13px;
          color: #f87171;
        }

        .results-detail {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .result-item {
          padding: 12px;
          background: rgba(24, 24, 27, 0.6);
          border-radius: 8px;
          margin-bottom: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .result-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }

        .type-code {
          font-size: 11px;
          font-weight: 600;
          color: #a5b4fc;
          background: rgba(99, 102, 241, 0.15);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .type-name {
          font-size: 14px;
          font-weight: 500;
          color: #ffffff;
        }

        .result-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 12px;
          color: #a1a1aa;
          margin-bottom: 8px;
        }

        .result-meta span {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .result-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .tag {
          font-size: 11px;
          color: #d4d4d8;
          background: rgba(63, 63, 70, 0.5);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        .analyze-link {
          font-size: 13px;
          font-weight: 600;
          color: #22d3ee;
          text-decoration: none;
          padding: 4px 12px;
          border-radius: 6px;
          background: rgba(34, 211, 238, 0.1);
          border: 1px solid rgba(34, 211, 238, 0.2);
          transition: all 0.2s;
        }

        .analyze-link:hover {
          background: rgba(34, 211, 238, 0.2);
          border-color: rgba(34, 211, 238, 0.4);
        }

        .upload-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }

        .document-type-selector {
          display: flex;
          background: rgba(39, 39, 42, 0.5);
          padding: 4px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .type-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: transparent;
          border: none;
          color: #a1a1aa;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .type-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.05);
        }

        .type-btn.active {
          background: #3f3f46;
          color: #ffffff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }

        .type-btn svg {
          opacity: 0.7;
        }

        .type-btn.active svg {
          opacity: 1;
          color: #818cf8;
        }

        .options {
          display: flex;
          gap: 16px;
        }

        .options label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #d4d4d8;
          cursor: pointer;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div >
  );
}

function getFileType(fileName: string): 'PDF' | 'IMG' | 'HWP' {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':
      return 'PDF';
    case 'hwp':
    case 'hwpx':
      return 'HWP';
    default:
      return 'IMG';
  }
}
