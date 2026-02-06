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
  const [autoClassify, setAutoClassify] = useState(true);
  const [generateSolutions, setGenerateSolutions] = useState(true);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // 파일 업로드 처리
  const handleUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      // 임시 Job 생성
      const tempJob: JobWithResults = {
        id: `temp-${Date.now()}`,
        userId,
        instituteId,
        fileName: file.name,
        fileSize: file.size,
        fileType: getFileType(file.name),
        storagePath: '',
        status: 'UPLOADING',
        progress: 0,
        currentStep: '업로드 준비 중...',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setJobs((prev) => [tempJob, ...prev]);

      try {
        // 파일 업로드 API 호출
        const formData = new FormData();
        formData.append('file', file);
        formData.append('instituteId', instituteId);
        formData.append('userId', userId);
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

        // 실제 Job ID로 업데이트
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

        // 폴링 시작 (autoClassify가 true인 경우)
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
    }
  }, [userId, instituteId, autoClassify, generateSolutions]);

  // Job 상태 폴링
  const startPolling = useCallback((jobId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/workflow/upload?jobId=${jobId}`);
        if (!response.ok) return;

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
          const interval = pollingRef.current.get(jobId);
          if (interval) {
            clearInterval(interval);
            pollingRef.current.delete(jobId);
          }

          if (job.status === 'COMPLETED' && results && onComplete) {
            onComplete(results);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
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
      handleUpload(e.dataTransfer.files);
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

  return (
    <div className="cloud-flow-uploader">
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
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.hwp,.hwpx"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
          className="hidden-input"
        />

        <div className="upload-icon">
          <Upload size={32} />
        </div>

        <h3>파일을 드래그하거나 클릭하여 업로드</h3>
        <p>PDF, 이미지, HWP 파일 지원</p>

        <div className="upload-features">
          <div className="feature">
            <FileSearch size={16} />
            <span>OCR 자동 변환</span>
          </div>
          <div className="feature">
            <Brain size={16} />
            <span>GPT-4o 분석</span>
          </div>
          <div className="feature">
            <Sparkles size={16} />
            <span>3,569 유형 분류</span>
          </div>
        </div>
      </div>

      {/* 옵션 */}
      <div className="upload-options">
        <label className="option">
          <input
            type="checkbox"
            checked={autoClassify}
            onChange={(e) => setAutoClassify(e.target.checked)}
          />
          <span>자동 유형 분류</span>
        </label>
        <label className="option">
          <input
            type="checkbox"
            checked={generateSolutions}
            onChange={(e) => setGenerateSolutions(e.target.checked)}
          />
          <span>단계별 해설 생성</span>
        </label>
      </div>

      {/* Job 목록 */}
      {jobs.length > 0 && (
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
      )}

      <style jsx>{`
        .cloud-flow-uploader {
          width: 100%;
        }

        .upload-zone {
          border: 2px dashed #d1d5db;
          border-radius: 16px;
          padding: 40px 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
          background: #fafafa;
        }

        .upload-zone:hover,
        .upload-zone.dragging {
          border-color: #4f46e5;
          background: #eef2ff;
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
          color: #1f2937;
        }

        .upload-zone p {
          margin: 0 0 20px;
          font-size: 13px;
          color: #6b7280;
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
          color: #4f46e5;
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
          color: #374151;
          cursor: pointer;
        }

        .option input {
          width: 16px;
          height: 16px;
          accent-color: #4f46e5;
        }

        .job-list {
          margin-top: 24px;
        }

        .job-list h4 {
          margin: 0 0 12px;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .job-card {
          background: white;
          border: 1px solid #e5e7eb;
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
        }

        .job-name {
          font-size: 14px;
          font-weight: 500;
          color: #1f2937;
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
          color: #6b7280;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .expand-button:hover {
          background: #f3f4f6;
          color: #4f46e5;
        }

        .remove-button:hover {
          background: #fee2e2;
          color: #dc2626;
        }

        .progress-section {
          margin-top: 12px;
        }

        .progress-bar {
          height: 6px;
          background: #e5e7eb;
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
          color: #6b7280;
        }

        .progress-percent {
          font-size: 12px;
          font-weight: 600;
          color: #374151;
        }

        .completed-info {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 8px 12px;
          background: #dcfce7;
          border-radius: 8px;
          font-size: 13px;
          color: #16a34a;
        }

        .failed-info {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 8px 12px;
          background: #fee2e2;
          border-radius: 8px;
          font-size: 13px;
          color: #dc2626;
        }

        .results-detail {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
        }

        .result-item {
          padding: 12px;
          background: #f9fafb;
          border-radius: 8px;
          margin-bottom: 8px;
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
          color: #4f46e5;
          background: #eef2ff;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .type-name {
          font-size: 14px;
          font-weight: 500;
          color: #1f2937;
        }

        .result-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 12px;
          color: #6b7280;
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
          color: #4b5563;
          background: #e5e7eb;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
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
