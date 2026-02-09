'use client';

// ============================================================================
// Cloud Flow Uploader Component
// PDF 업로드 → OCR → AI 분류/해설 자동화 UI
// ============================================================================

import React, { useState, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import type { UploadJob, ProcessingStatus, LLMAnalysisResult } from '@/types/workflow';
import { getStatusLabel, getStatusColor } from '@/lib/workflow/cloud-flow';

interface CloudFlowUploaderProps {
  instituteId?: string;
  userId?: string;
  onComplete?: (results: LLMAnalysisResult[]) => void;
}

interface JobWithResults extends UploadJob {
  results?: LLMAnalysisResult[];
}

export default function CloudFlowUploader({
  instituteId = 'default',
  userId = 'user',
  onComplete,
}: CloudFlowUploaderProps) {
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

  const [autoClassify, setAutoClassify] = useState(true);
  const [generateSolutions, setGenerateSolutions] = useState(true);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // 파일 선택 처리 (Staging)
  const handleFileSelect = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // 현재 활성화된 탭에 파일 할당 (첫 번째 파일만)
    const file = fileArray[0];
    setPendingFiles(prev => ({
      ...prev,
      [activeTab]: file
    }));
  }, [activeTab]);

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
      formData.append('documentType', 'PROBLEM'); // 메인 타입은 항상 PROBLEM
      formData.append('autoClassify', String(autoClassify));
      formData.append('generateSolutions', String(generateSolutions));

      const response = await fetch('/api/workflow/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
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

      // 폴링 시작
      if (autoClassify) {
        startPolling(data.jobId);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setJobs((prev) =>
        prev.map((j) =>
          j.id === tempJob.id
            ? {
              ...j,
              status: 'FAILED',
              error: '업로드 실패',
            }
            : j
        )
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles, userId, instituteId, autoClassify, generateSolutions]);

  // Job 상태 폴링
  const startPolling = useCallback((jobId: string) => {
    let errorCount = 0;
    const MAX_ERRORS = 15; // 최대 15회 (30초) 연속 실패 시 폴링 중지

    const stopPolling = (id: string) => {
      const interval = pollingRef.current.get(id);
      if (interval) {
        clearInterval(interval);
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

    // 2초 간격으로 폴링
    const interval = setInterval(poll, 2000);
    pollingRef.current.set(jobId, interval);
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
    const interval = pollingRef.current.get(jobId);
    if (interval) {
      clearInterval(interval);
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
          <div className="mt-4 p-3 bg-zinc-800 rounded-lg flex items-center gap-3 border border-indigo-500/30">
            <CheckCircle className="text-indigo-400" size={20} />
            <span className="text-indigo-100 font-medium">{pendingFiles[activeTab]?.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); clearPendingFile(activeTab); }}
              className="ml-auto text-zinc-500 hover:text-red-400"
            >
              <XCircle size={18} />
            </button>
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
                  <div className="completed-info">
                    <CheckCircle size={16} />
                    <span>{job.results.length}개 문제 분석 완료</span>
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
