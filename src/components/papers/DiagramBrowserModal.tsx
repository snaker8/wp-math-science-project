'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Loader2, Check, Image as ImageIcon, RefreshCw, Upload, Code2 } from 'lucide-react';

// ============================================================================
// SVG → PNG 변환 유틸리티 (클라이언트 사이드 Canvas 렌더링)
// ============================================================================
async function svgToPngBlob(svgText: string, scaleFactor = 2): Promise<Blob> {
  // SVG에 명시적 width/height 없으면 viewBox에서 추출
  let processed = svgText;
  if (!/<svg[^>]*\bwidth\s*=/i.test(processed)) {
    const vbMatch = processed.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    if (vbMatch) {
      const parts = vbMatch[1].trim().split(/[\s,]+/);
      if (parts.length >= 4) {
        processed = processed.replace(/<svg/i, `<svg width="${parts[2]}" height="${parts[3]}"`);
      }
    } else {
      processed = processed.replace(/<svg/i, '<svg width="600" height="400"');
    }
  }

  return new Promise((resolve, reject) => {
    const blob = new Blob([processed], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 600;
      const h = img.naturalHeight || 400;
      const canvas = document.createElement('canvas');
      canvas.width = w * scaleFactor;
      canvas.height = h * scaleFactor;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scaleFactor, scaleFactor);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (pngBlob) => {
          URL.revokeObjectURL(url);
          if (pngBlob) resolve(pngBlob);
          else reject(new Error('PNG 변환 실패'));
        },
        'image/png',
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG 렌더링 실패 — 파일을 확인해주세요'));
    };
    img.src = url;
  });
}

interface DiagramImage {
  id: string;
  filename: string;
  public_url?: string;
  storage_path?: string;
  filepath?: string;  // 파이프라인 서버 필드
  source_name?: string;
  source?: string;    // 파이프라인 서버 필드
  subject?: string;
  diagram_type?: string;
  tags?: Record<string, unknown>;
  width?: number;
  height?: number;
  unit_code?: string;
  unit_name?: string;
}

/** onSelect에 전달되는 추가 메타데이터 (SVG 교정 학습용) */
export interface DiagramSelectMeta {
  svgSource?: string;                  // SVG 원본 코드 (paste/file upload)
  correctionType: 'svg_paste' | 'svg_file_upload' | 'image_upload' | 'diagram_db';
}

interface DiagramBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string, meta?: DiagramSelectMeta) => void;
  // ★ "현재 이미지 삭제" 옵션. 미지정 시 버튼 숨김 (기존 호출부 영향 X).
  onDelete?: () => void;
  currentImageUrl?: string;
  problemNumber?: number;
}

export function DiagramBrowserModal({
  isOpen,
  onClose,
  onSelect,
  onDelete,
  currentImageUrl,
  problemNumber,
}: DiagramBrowserModalProps) {
  const [activeTab, setActiveTab] = useState<'browse' | 'upload' | 'svg-paste'>('browse');
  const [diagrams, setDiagrams] = useState<DiagramImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  // 업로드 탭 상태
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSvgFile, setIsSvgFile] = useState(false);
  const [svgCode, setSvgCode] = useState<string | null>(null);
  const [svgError, setSvgError] = useState<string | null>(null);
  // SVG 코드 붙여넣기 탭 상태
  const [svgPasteCode, setSvgPasteCode] = useState('');
  const [svgPastePreview, setSvgPastePreview] = useState<string | null>(null);

  const fetchDiagrams = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (subjectFilter) params.set('subject', subjectFilter);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));

      const res = await fetch(`/api/diagram-images?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDiagrams(data.images || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch diagrams:', err);
    } finally {
      setLoading(false);
    }
  }, [subjectFilter, page]);

  useEffect(() => {
    if (isOpen) {
      setSelectedId(null);
      setPage(0);
      fetchDiagrams();
    }
  }, [isOpen, fetchDiagrams]);

  const getImageUrl = (d: DiagramImage) => {
    if (d.public_url) return d.public_url;
    const storagePath = d.storage_path || d.filepath;
    if (storagePath) return `/api/diagram-images/proxy?path=${encodeURIComponent(storagePath)}`;
    return '';
  };

  const filteredDiagrams = searchQuery
    ? diagrams.filter(d =>
        (d.filename || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.source_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.diagram_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.unit_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : diagrams;

  const handleConfirm = () => {
    const selected = diagrams.find(d => d.id === selectedId);
    if (selected) {
      const url = getImageUrl(selected);
      if (url) onSelect(url, { correctionType: 'diagram_db' });
    }
  };

  // 파일 선택 시 미리보기 (이미지 + SVG 코드 파일 지원)
  const handleFileSelect = (file: File) => {
    setUploadFile(file);
    setSvgError(null);

    const isSvg = file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml';
    setIsSvgFile(isSvg);

    if (isSvg) {
      const textReader = new FileReader();
      textReader.onload = (e) => {
        const code = e.target?.result as string;
        setSvgCode(code);
        // data URL 미리보기
        try {
          const b64 = btoa(unescape(encodeURIComponent(code)));
          setUploadPreview(`data:image/svg+xml;base64,${b64}`);
        } catch {
          setSvgError('SVG 인코딩 실패');
        }
      };
      textReader.readAsText(file);
    } else {
      setSvgCode(null);
      const reader = new FileReader();
      reader.onload = (e) => setUploadPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  // 업로드 + Supabase 저장 + 도식 교체
  // SVG인 경우: Canvas로 PNG 렌더링 → PNG를 메인 이미지로 업로드 + SVG 원본도 별도 저장
  const handleUploadAndReplace = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    setSvgError(null);
    try {
      const formData = new FormData();
      if (problemNumber) formData.append('problemNumber', String(problemNumber));

      if (isSvgFile && svgCode) {
        // ── SVG → PNG 변환 후 업로드 ──
        const pngBlob = await svgToPngBlob(svgCode, 2);
        const pngName = uploadFile.name.replace(/\.svg$/i, '.png');
        const pngFile = new File([pngBlob], pngName, { type: 'image/png' });
        formData.append('file', pngFile);
        // SVG 원본 코드도 함께 전송 (서버에서 별도 자산으로 저장)
        formData.append('svgSource', svgCode);
        formData.append('svgFileName', uploadFile.name);
      } else {
        formData.append('file', uploadFile);
      }

      const res = await fetch('/api/diagram-images/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`업로드 실패 (${res.status}): ${detail.slice(0, 200) || '응답 없음'}`);
      }
      const data = await res.json();

      if (data.publicUrl) {
        onSelect(data.publicUrl, {
          correctionType: isSvgFile ? 'svg_file_upload' : 'image_upload',
          svgSource: isSvgFile ? svgCode ?? undefined : undefined,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      setSvgError(isSvgFile ? `SVG 변환/업로드 실패: ${msg}` : `이미지 업로드 실패: ${msg}`);
      alert(isSvgFile ? `SVG 변환/업로드 실패: ${msg}` : `이미지 업로드 실패: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  // ── SVG 코드 붙여넣기 → 미리보기 갱신 ──
  const handleSvgPasteChange = useCallback((code: string) => {
    setSvgPasteCode(code);
    setSvgError(null);
    const trimmed = code.trim();
    if (!trimmed || !trimmed.includes('<svg')) {
      setSvgPastePreview(null);
      return;
    }
    try {
      const b64 = btoa(unescape(encodeURIComponent(trimmed)));
      setSvgPastePreview(`data:image/svg+xml;base64,${b64}`);
    } catch {
      setSvgPastePreview(null);
      setSvgError('SVG 인코딩 실패 — 코드를 확인해주세요');
    }
  }, []);

  // ── SVG 코드 붙여넣기 → 업로드 ──
  const handleSvgPasteUpload = async () => {
    const trimmed = svgPasteCode.trim();
    if (!trimmed || !trimmed.includes('<svg')) return;
    setIsUploading(true);
    setSvgError(null);
    try {
      const pngBlob = await svgToPngBlob(trimmed, 2);
      const pngFile = new File([pngBlob], `svg-paste-${Date.now()}.png`, { type: 'image/png' });

      const formData = new FormData();
      formData.append('file', pngFile);
      if (problemNumber) formData.append('problemNumber', String(problemNumber));
      formData.append('svgSource', trimmed);
      formData.append('svgFileName', `paste-${Date.now()}.svg`);

      const res = await fetch('/api/diagram-images/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`업로드 실패 (${res.status}): ${detail.slice(0, 200) || '응답 없음'}`);
      }
      const data = await res.json();
      if (data.publicUrl) {
        onSelect(data.publicUrl, { correctionType: 'svg_paste', svgSource: trimmed });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      setSvgError(`SVG 변환/업로드 실패: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-subtle rounded-2xl shadow-2xl w-[900px] max-h-[85vh] flex flex-col">
        {/* 헤더 + 탭 */}
        <div className="px-6 py-4 border-b border-subtle">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <ImageIcon className="h-5 w-5 text-teal-400" />
              <h2 className="text-lg font-bold text-content-primary">
                도식 이미지 교체 {problemNumber ? `— ${problemNumber}번 문제` : ''}
              </h2>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-surface-raised transition-colors">
              <X className="h-5 w-5 text-content-muted" />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('browse')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'browse' ? 'bg-teal-500/15 text-teal-400' : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              DB 검색
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'upload' ? 'bg-teal-500/15 text-teal-400' : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              직접 업로드
            </button>
            <button
              onClick={() => setActiveTab('svg-paste')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'svg-paste' ? 'bg-violet-500/15 text-violet-400' : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              <Code2 size={13} />
              SVG 코드
            </button>
          </div>
        </div>

        {/* 업로드 탭 */}
        {activeTab === 'upload' && (
          <div className="flex-1 overflow-y-auto px-6 py-8">
            <div
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById('diagram-upload-input')?.click()}
              className="border-2 border-dashed border-subtle rounded-xl p-12 text-center hover:border-teal-500/50 transition-colors cursor-pointer"
            >
              <input
                id="diagram-upload-input"
                type="file"
                accept="image/*,.svg"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                className="hidden"
              />
              {uploadPreview ? (
                <div className="space-y-4">
                  {/* SVG 파일인 경우 배지 표시 */}
                  {isSvgFile && (
                    <div className="flex items-center justify-center gap-1.5">
                      <Code2 size={14} className="text-violet-400" />
                      <span className="text-xs font-medium text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">
                        SVG 코드 → PNG 변환 후 저장됩니다
                      </span>
                    </div>
                  )}
                  <img src={uploadPreview} alt="미리보기" className="mx-auto max-h-64 rounded-lg border border-subtle object-contain bg-white" />
                  <p className="text-sm text-content-secondary">{uploadFile?.name}</p>
                  <p className="text-xs text-content-muted">다른 파일을 선택하려면 클릭하세요</p>
                </div>
              ) : (
                <div>
                  <Upload size={40} className="mx-auto text-content-muted mb-3" />
                  <p className="text-sm text-content-secondary">이미지 또는 SVG 파일을 드래그하거나 클릭하여 선택</p>
                  <p className="text-xs text-content-muted mt-1">PNG, JPG, <span className="text-violet-400 font-medium">SVG</span> 지원 — SVG는 PNG로 렌더링 후 저장됩니다</p>
                </div>
              )}
            </div>

            {/* SVG 에러 메시지 */}
            {svgError && (
              <p className="mt-2 text-xs text-red-400">{svgError}</p>
            )}

            {/* SVG 코드 미리보기 (접기/펼치기) */}
            {isSvgFile && svgCode && (
              <details className="mt-3 border border-subtle rounded-lg overflow-hidden">
                <summary className="px-3 py-2 text-xs text-content-muted cursor-pointer hover:bg-surface-raised flex items-center gap-1.5">
                  <Code2 size={12} className="text-violet-400" />
                  SVG 소스 코드 ({(svgCode.length / 1024).toFixed(1)} KB)
                </summary>
                <pre className="px-3 py-2 text-[10px] text-content-tertiary bg-surface-raised max-h-32 overflow-auto font-mono whitespace-pre-wrap break-all">
                  {svgCode.slice(0, 3000)}{svgCode.length > 3000 ? '\n... (이하 생략)' : ''}
                </pre>
              </details>
            )}

            {uploadPreview && (
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleUploadAndReplace}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white font-medium text-sm hover:bg-teal-500 disabled:opacity-50 transition-colors"
                >
                  {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {isUploading ? (isSvgFile ? 'SVG → PNG 변환 중...' : '업로드 중...') : '이미지 교체'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── SVG 코드 붙여넣기 탭 ── */}
        {activeTab === 'svg-paste' && (
          <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4">
            <div className="flex gap-4 min-h-0 flex-1">
              {/* 좌: 코드 입력 */}
              <div className="flex-1 flex flex-col min-w-0">
                <label className="text-xs text-content-muted mb-1.5 flex items-center gap-1.5">
                  <Code2 size={12} className="text-violet-400" />
                  SVG 코드 붙여넣기
                </label>
                <textarea
                  value={svgPasteCode}
                  onChange={(e) => handleSvgPasteChange(e.target.value)}
                  placeholder={'<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">\n  <circle cx="100" cy="100" r="80" fill="none" stroke="black" />\n</svg>'}
                  spellCheck={false}
                  className="flex-1 min-h-[220px] p-3 rounded-lg bg-surface-raised border border-subtle text-xs font-mono text-content-primary placeholder:text-content-muted/40 resize-none outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 leading-relaxed"
                />
                <p className="text-[10px] text-content-muted mt-1">
                  {svgPasteCode.trim().length > 0
                    ? `${(svgPasteCode.length / 1024).toFixed(1)} KB`
                    : 'SVG 코드를 붙여넣으면 오른쪽에 미리보기가 표시됩니다'}
                </p>
              </div>

              {/* 우: 미리보기 */}
              <div className="w-[280px] flex-shrink-0 flex flex-col">
                <label className="text-xs text-content-muted mb-1.5">미리보기</label>
                <div className="flex-1 min-h-[220px] rounded-lg border border-subtle bg-white flex items-center justify-center p-3 overflow-hidden">
                  {svgPastePreview ? (
                    <img
                      src={svgPastePreview}
                      alt="SVG 미리보기"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-content-muted/40">
                      <Code2 size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-xs">SVG 미리보기</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SVG 에러 */}
            {svgError && (
              <p className="text-xs text-red-400">{svgError}</p>
            )}

            {/* 교체 버튼 */}
            {svgPastePreview && (
              <div className="flex justify-end">
                <button
                  onClick={handleSvgPasteUpload}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white font-medium text-sm hover:bg-violet-500 disabled:opacity-50 transition-colors"
                >
                  {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {isUploading ? 'SVG → PNG 변환 중...' : 'SVG 이미지 교체'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* browse 탭 전체 */}
        {activeTab === 'browse' && (
          <>
        {/* 필터 바 */}
        <div className="px-6 py-3 border-b border-subtle flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="파일명, 출처, 유형으로 검색..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-surface-raised border border-subtle text-sm text-content-primary placeholder:text-content-muted focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 outline-none"
            />
          </div>
          <select
            value={subjectFilter}
            onChange={(e) => { setSubjectFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-lg bg-surface-raised border border-subtle text-sm text-content-primary outline-none"
          >
            <option value="">전체 과목</option>
            <option value="physics">물리</option>
            <option value="chemistry">화학</option>
            <option value="biology">생명과학</option>
            <option value="earth_science">지구과학</option>
            <option value="math">수학</option>
          </select>
          <button
            onClick={fetchDiagrams}
            className="p-2 rounded-lg bg-surface-raised border border-subtle hover:bg-surface-card transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`h-4 w-4 text-content-muted ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 현재 이미지 비교 */}
        {currentImageUrl && (
          <div className="px-6 py-3 border-b border-subtle">
            <p className="text-xs text-content-muted mb-2">현재 도식 이미지:</p>
            <div className="flex items-center gap-4">
              <img
                src={currentImageUrl}
                alt="현재 도식"
                className="h-20 rounded border border-subtle object-contain bg-white"
              />
              {selectedId && (
                <>
                  <span className="text-content-muted text-lg">→</span>
                  <img
                    src={getImageUrl(diagrams.find(d => d.id === selectedId)!)}
                    alt="교체할 도식"
                    className="h-20 rounded border-2 border-teal-500 object-contain bg-white"
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* 이미지 그리드 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
              <span className="ml-3 text-content-muted">도식 이미지 로딩 중...</span>
            </div>
          ) : filteredDiagrams.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-content-muted">
              <ImageIcon className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">도식 이미지가 없습니다</p>
              <p className="text-xs mt-1">과학 시험지를 업로드하면 도식이 자동 추출됩니다</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-content-muted mb-3">
                {total}개 도식 중 {filteredDiagrams.length}개 표시
              </p>
              <div className="grid grid-cols-4 gap-3">
                {filteredDiagrams.map((d) => {
                  const imgUrl = getImageUrl(d);
                  const isSelected = d.id === selectedId;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedId(isSelected ? null : d.id)}
                      className={`relative group rounded-xl border-2 overflow-hidden transition-all ${
                        isSelected
                          ? 'border-teal-500 ring-2 ring-teal-500/30 bg-teal-500/5'
                          : 'border-subtle hover:border-teal-500/50 bg-surface-raised'
                      }`}
                    >
                      {/* 선택 체크 */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center">
                          <Check className="h-4 w-4 text-white" />
                        </div>
                      )}
                      {/* 이미지 */}
                      <div className="aspect-square flex items-center justify-center p-2 bg-white">
                        <img
                          src={imgUrl}
                          alt={d.filename}
                          className="max-h-full max-w-full object-contain"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="20" y="55" fill="gray">No Image</text></svg>';
                          }}
                        />
                      </div>
                      {/* 메타 정보 */}
                      <div className="px-2 py-1.5 border-t border-subtle">
                        <p className="text-[10px] text-content-secondary truncate font-medium">
                          {d.source_name || d.source || d.filename}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {d.diagram_type && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-teal-500/10 text-teal-400">
                              {d.diagram_type}
                            </span>
                          )}
                          {d.unit_name && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 truncate max-w-[100px]">
                              {d.unit_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* 페이지네이션 */}
              {total > PAGE_SIZE && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 rounded text-sm border border-subtle text-content-muted hover:bg-surface-raised disabled:opacity-30"
                  >
                    이전
                  </button>
                  <span className="text-sm text-content-muted">
                    {page + 1} / {Math.ceil(total / PAGE_SIZE)}
                  </span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * PAGE_SIZE >= total}
                    className="px-3 py-1 rounded text-sm border border-subtle text-content-muted hover:bg-surface-raised disabled:opacity-30"
                  >
                    다음
                  </button>
                </div>
              )}
            </>
          )}
        </div>

          </>
        )}

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-subtle flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-content-muted flex-1 min-w-0">
            이미지를 선택하고 &quot;교체&quot;를 누르거나, &quot;이미지 삭제&quot;로 현재 도식을 제거할 수 있습니다
          </p>
          <div className="flex items-center gap-2">
            {/* ★ 이미지 삭제 — 현재 이미지 있고 onDelete 핸들러 제공된 경우만 노출 */}
            {currentImageUrl && onDelete && (
              <button
                onClick={() => {
                  if (confirm('현재 도식·이미지를 삭제하시겠습니까?')) {
                    onDelete();
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                이미지 삭제
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-content-muted hover:bg-surface-raised transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedId}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              교체
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
