'use client';

// ============================================================================
// PDF Options Modal
// PDF 생성 옵션 설정 UI
// ============================================================================

import React, { useState } from 'react';
import {
  X,
  FileText,
  Layout,
  Image,
  Settings,
  Download,
  Upload,
  Eye,
} from 'lucide-react';
import type { PDFExamConfig } from '@/types/pdf';
import { DEFAULT_PDF_CONFIG } from '@/types/pdf';
import { imageToBase64 } from '@/lib/pdf/generator';

interface PDFOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: PDFExamConfig) => void;
  onPreview: (config: PDFExamConfig) => void;
  initialConfig?: Partial<PDFExamConfig>;
  isGenerating?: boolean;
  progress?: number;
}

export default function PDFOptionsModal({
  isOpen,
  onClose,
  onGenerate,
  onPreview,
  initialConfig,
  isGenerating = false,
  progress = 0,
}: PDFOptionsModalProps) {
  const [config, setConfig] = useState<PDFExamConfig>({
    ...DEFAULT_PDF_CONFIG,
    ...initialConfig,
  });

  const [activeTab, setActiveTab] = useState<'basic' | 'layout' | 'watermark' | 'advanced'>('basic');

  if (!isOpen) return null;

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await imageToBase64(file);
      setConfig((prev) => ({ ...prev, instituteLogo: base64 }));
    }
  };

  const handleWatermarkImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await imageToBase64(file);
      setConfig((prev) => ({
        ...prev,
        watermark: { ...prev.watermark, image: base64, text: undefined },
      }));
    }
  };

  const updateConfig = <K extends keyof PDFExamConfig>(
    key: K,
    value: PDFExamConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { id: 'basic', label: '기본 정보', icon: FileText },
    { id: 'layout', label: '레이아웃', icon: Layout },
    { id: 'watermark', label: '워터마크', icon: Image },
    { id: 'advanced', label: '고급 설정', icon: Settings },
  ] as const;

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        {/* 헤더 */}
        <div className="modal-header">
          <h2>PDF 내보내기 설정</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* 탭 */}
        <div className="tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="tab-content">
          {/* 기본 정보 탭 */}
          {activeTab === 'basic' && (
            <div className="tab-panel">
              <div className="form-group">
                <label>시험지 제목</label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) => updateConfig('title', e.target.value)}
                  placeholder="예: 수학I 중간고사"
                />
              </div>

              <div className="form-group">
                <label>부제목 (선택)</label>
                <input
                  type="text"
                  value={config.subtitle || ''}
                  onChange={(e) => updateConfig('subtitle', e.target.value)}
                  placeholder="예: 1학기 중간고사"
                />
              </div>

              <div className="form-group">
                <label>학원/기관명</label>
                <input
                  type="text"
                  value={config.instituteName || ''}
                  onChange={(e) => updateConfig('instituteName', e.target.value)}
                  placeholder="예: 과사람 수학학원"
                />
              </div>

              <div className="form-group">
                <label>학원 로고</label>
                <div className="file-upload">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    id="logo-upload"
                  />
                  <label htmlFor="logo-upload" className="upload-btn">
                    <Upload size={16} />
                    로고 업로드
                  </label>
                  {config.instituteLogo && (
                    <div className="preview">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={config.instituteLogo} alt="Logo preview" />
                      <button onClick={() => updateConfig('instituteLogo', undefined)}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>날짜</label>
                <input
                  type="text"
                  value={config.date || ''}
                  onChange={(e) => updateConfig('date', e.target.value)}
                />
              </div>

              <div className="form-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showNameField}
                    onChange={(e) => updateConfig('showNameField', e.target.checked)}
                  />
                  성명 칸 표시
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showClassField}
                    onChange={(e) => updateConfig('showClassField', e.target.checked)}
                  />
                  반 칸 표시
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showScoreField}
                    onChange={(e) => updateConfig('showScoreField', e.target.checked)}
                  />
                  점수 칸 표시
                </label>
              </div>
            </div>
          )}

          {/* 레이아웃 탭 */}
          {activeTab === 'layout' && (
            <div className="tab-panel">
              <div className="form-group">
                <label>레이아웃</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="layout"
                      checked={config.layout === 'two-column'}
                      onChange={() => updateConfig('layout', 'two-column')}
                    />
                    <span className="radio-icon two-col" />
                    2단 레이아웃
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="layout"
                      checked={config.layout === 'single'}
                      onChange={() => updateConfig('layout', 'single')}
                    />
                    <span className="radio-icon single" />
                    1단 레이아웃
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>문제 간격: {config.problemSpacing}px</label>
                <input
                  type="range"
                  min="12"
                  max="60"
                  value={config.problemSpacing}
                  onChange={(e) => updateConfig('problemSpacing', parseInt(e.target.value))}
                />
                <div className="range-labels">
                  <span>좁게</span>
                  <span>넓게</span>
                </div>
              </div>

              <div className="form-group">
                <label>글자 크기: {config.fontSize}pt</label>
                <input
                  type="range"
                  min="9"
                  max="14"
                  value={config.fontSize}
                  onChange={(e) => updateConfig('fontSize', parseInt(e.target.value))}
                />
                <div className="range-labels">
                  <span>작게</span>
                  <span>크게</span>
                </div>
              </div>

              <div className="form-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showProblemNumbers}
                    onChange={(e) => updateConfig('showProblemNumbers', e.target.checked)}
                  />
                  문제 번호 표시
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showProblemPoints}
                    onChange={(e) => updateConfig('showProblemPoints', e.target.checked)}
                  />
                  배점 표시
                </label>
              </div>
            </div>
          )}

          {/* 워터마크 탭 */}
          {activeTab === 'watermark' && (
            <div className="tab-panel">
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.watermark.enabled}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        watermark: { ...prev.watermark, enabled: e.target.checked },
                      }))
                    }
                  />
                  워터마크 사용
                </label>
              </div>

              {config.watermark.enabled && (
                <>
                  <div className="form-group">
                    <label>워터마크 유형</label>
                    <div className="watermark-type">
                      <div className="form-group">
                        <label>텍스트 워터마크</label>
                        <input
                          type="text"
                          value={config.watermark.text || ''}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              watermark: {
                                ...prev.watermark,
                                text: e.target.value,
                                image: undefined,
                              },
                            }))
                          }
                          placeholder="예: 과사람 수학"
                        />
                      </div>

                      <div className="divider">또는</div>

                      <div className="form-group">
                        <label>이미지 워터마크</label>
                        <div className="file-upload">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleWatermarkImageUpload}
                            id="watermark-upload"
                          />
                          <label htmlFor="watermark-upload" className="upload-btn">
                            <Upload size={16} />
                            이미지 업로드
                          </label>
                          {config.watermark.image && (
                            <div className="preview">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={config.watermark.image} alt="Watermark preview" />
                              <button
                                onClick={() =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    watermark: { ...prev.watermark, image: undefined },
                                  }))
                                }
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>투명도: {Math.round(config.watermark.opacity * 100)}%</label>
                    <input
                      type="range"
                      min="0.05"
                      max="0.3"
                      step="0.01"
                      value={config.watermark.opacity}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          watermark: { ...prev.watermark, opacity: parseFloat(e.target.value) },
                        }))
                      }
                    />
                    <div className="range-labels">
                      <span>연하게</span>
                      <span>진하게</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 고급 설정 탭 */}
          {activeTab === 'advanced' && (
            <div className="tab-panel">
              <div className="form-group">
                <label>용지 크기</label>
                <select
                  value={config.pageSize}
                  onChange={(e) => updateConfig('pageSize', e.target.value as 'A4' | 'Letter')}
                >
                  <option value="A4">A4 (210 x 297mm)</option>
                  <option value="Letter">Letter (8.5 x 11in)</option>
                </select>
              </div>

              <div className="form-group">
                <label>용지 방향</label>
                <select
                  value={config.orientation}
                  onChange={(e) =>
                    updateConfig('orientation', e.target.value as 'portrait' | 'landscape')
                  }
                >
                  <option value="portrait">세로 (Portrait)</option>
                  <option value="landscape">가로 (Landscape)</option>
                </select>
              </div>

              <div className="form-group">
                <label>여백 (mm)</label>
                <div className="margin-inputs">
                  <div>
                    <span>상</span>
                    <input
                      type="number"
                      value={config.margin.top}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          margin: { ...prev.margin, top: parseInt(e.target.value) || 0 },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <span>우</span>
                    <input
                      type="number"
                      value={config.margin.right}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          margin: { ...prev.margin, right: parseInt(e.target.value) || 0 },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <span>하</span>
                    <input
                      type="number"
                      value={config.margin.bottom}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          margin: { ...prev.margin, bottom: parseInt(e.target.value) || 0 },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <span>좌</span>
                    <input
                      type="number"
                      value={config.margin.left}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          margin: { ...prev.margin, left: parseInt(e.target.value) || 0 },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.showAnswerSheet}
                    onChange={(e) => updateConfig('showAnswerSheet', e.target.checked)}
                  />
                  별도 답안지 페이지 생성
                </label>
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="modal-footer">
          {isGenerating && (
            <div className="progress-bar">
              <div className="progress" style={{ width: `${progress}%` }} />
              <span>{progress}%</span>
            </div>
          )}

          <div className="actions">
            <button className="btn-secondary" onClick={() => onPreview(config)}>
              <Eye size={16} />
              미리보기
            </button>
            <button
              className="btn-primary"
              onClick={() => onGenerate(config)}
              disabled={isGenerating}
            >
              <Download size={16} />
              {isGenerating ? 'PDF 생성 중...' : 'PDF 다운로드'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal-container {
          width: 100%;
          max-width: 600px;
          max-height: 90vh;
          background: white;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .modal-header h2 {
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
        }

        .close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          background: none;
          color: #6b7280;
          cursor: pointer;
          border-radius: 6px;
        }

        .close-btn:hover {
          background: #f3f4f6;
          color: #374151;
        }

        .tabs {
          display: flex;
          padding: 0 24px;
          border-bottom: 1px solid #e5e7eb;
          gap: 4px;
        }

        .tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 12px 16px;
          font-size: 13px;
          font-weight: 500;
          color: #6b7280;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab:hover {
          color: #374151;
        }

        .tab.active {
          color: #4f46e5;
          border-bottom-color: #4f46e5;
        }

        .tab-content {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        .tab-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-size: 13px;
          font-weight: 500;
          color: #374151;
        }

        .form-group input[type="text"],
        .form-group input[type="number"],
        .form-group select {
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
        }

        .form-group input[type="text"]:focus,
        .form-group input[type="number"]:focus,
        .form-group select:focus {
          outline: none;
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }

        .form-group input[type="range"] {
          width: 100%;
          accent-color: #4f46e5;
        }

        .range-labels {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #9ca3af;
        }

        .form-row {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #374151;
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: #4f46e5;
        }

        .radio-group {
          display: flex;
          gap: 16px;
        }

        .radio-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #374151;
          cursor: pointer;
        }

        .radio-label input[type="radio"] {
          display: none;
        }

        .radio-icon {
          width: 48px;
          height: 36px;
          border: 2px solid #d1d5db;
          border-radius: 6px;
          position: relative;
        }

        .radio-icon.two-col::before,
        .radio-icon.two-col::after {
          content: "";
          position: absolute;
          top: 4px;
          bottom: 4px;
          width: calc(50% - 6px);
          background: #e5e7eb;
          border-radius: 2px;
        }

        .radio-icon.two-col::before {
          left: 4px;
        }

        .radio-icon.two-col::after {
          right: 4px;
        }

        .radio-icon.single::before {
          content: "";
          position: absolute;
          top: 4px;
          bottom: 4px;
          left: 4px;
          right: 4px;
          background: #e5e7eb;
          border-radius: 2px;
        }

        .radio-label input[type="radio"]:checked + .radio-icon {
          border-color: #4f46e5;
          background: #eef2ff;
        }

        .radio-label input[type="radio"]:checked + .radio-icon::before,
        .radio-label input[type="radio"]:checked + .radio-icon::after {
          background: #c7d2fe;
        }

        .file-upload input[type="file"] {
          display: none;
        }

        .upload-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: #f3f4f6;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 13px;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
        }

        .upload-btn:hover {
          background: #e5e7eb;
        }

        .preview {
          position: relative;
          display: inline-block;
          margin-top: 8px;
        }

        .preview img {
          max-width: 100px;
          max-height: 50px;
          border-radius: 4px;
          border: 1px solid #e5e7eb;
        }

        .preview button {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 50%;
          cursor: pointer;
        }

        .divider {
          text-align: center;
          color: #9ca3af;
          font-size: 12px;
          margin: 8px 0;
        }

        .margin-inputs {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }

        .margin-inputs div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .margin-inputs span {
          font-size: 11px;
          color: #9ca3af;
          text-align: center;
        }

        .margin-inputs input {
          padding: 8px;
          text-align: center;
        }

        .modal-footer {
          padding: 16px 24px;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .progress-bar {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          margin-bottom: 12px;
          position: relative;
          overflow: hidden;
        }

        .progress-bar .progress {
          height: 100%;
          background: linear-gradient(90deg, #4f46e5, #6366f1);
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .progress-bar span {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 10px;
          color: #6b7280;
        }

        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .btn-secondary {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: #f3f4f6;
        }

        .btn-primary {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary:hover:not(:disabled) {
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
