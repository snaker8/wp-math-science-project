'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Loader2, Check, Image as ImageIcon, RefreshCw } from 'lucide-react';

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

interface DiagramBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string) => void;
  currentImageUrl?: string;
  problemNumber?: number;
}

export function DiagramBrowserModal({
  isOpen,
  onClose,
  onSelect,
  currentImageUrl,
  problemNumber,
}: DiagramBrowserModalProps) {
  const [diagrams, setDiagrams] = useState<DiagramImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

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
      if (url) onSelect(url);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-subtle rounded-2xl shadow-2xl w-[900px] max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
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

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-subtle flex items-center justify-between">
          <p className="text-xs text-content-muted">
            이미지를 선택하고 &quot;교체&quot;를 누르면 현재 도식이 교체됩니다
          </p>
          <div className="flex items-center gap-2">
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
