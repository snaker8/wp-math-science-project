'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  Filter,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Download,
  ZoomIn,
  Trash2,
  Sparkles,
  Tag,
} from 'lucide-react';

interface DiagramImage {
  id: string;
  filename: string;
  storage_path: string;
  public_url: string | null;
  source_name: string;
  subject: string;
  page_number: number;
  width: number;
  height: number;
  diagram_type: string;
  is_enhanced: boolean;
  science_subject: string | null;
  unit_code: string | null;
  unit_name: string | null;
  tags: Record<string, unknown> | null;
  created_at: string;
}

export default function DiagramGalleryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isUploading = searchParams.get('uploading') === 'true';
  const [images, setImages] = useState<DiagramImage[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [extracting, setExtracting] = useState(isUploading);
  const [processingInfo, setProcessingInfo] = useState<{
    active: boolean; phase: string; current_page: number; total_pages: number; source: string;
  } | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [scienceSubjectFilter, setScienceSubjectFilter] = useState<string>('all');
  const [previewImage, setPreviewImage] = useState<DiagramImage | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // 개별 이미지 삭제
  const handleDeleteImage = async (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 이미지를 삭제하시겠습니까?')) return;
    setDeleting(imageId);
    try {
      await fetch(`/api/diagram-images?id=${imageId}`, { method: 'DELETE' });
      setImages(prev => prev.filter((img: any) => img.id !== imageId));
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(null);
    }
  };

  // 소스별 일괄 삭제
  const handleDeleteSource = async (sourceName: string) => {
    if (!confirm(`"${sourceName}" 출처의 모든 이미지를 삭제하시겠습니까?`)) return;
    setDeleting(sourceName);
    try {
      await fetch(`/api/diagram-images?source=${encodeURIComponent(sourceName)}`, { method: 'DELETE' });
      setImages(prev => prev.filter((img: any) => (img.source || img.source_name) !== sourceName));
    } catch (err) {
      console.error('Delete source failed:', err);
    } finally {
      setDeleting(null);
    }
  };

  const [localStats, setLocalStats] = useState<{ total_images: number; by_subject: Record<string, number> } | null>(null);
  const prevCountRef = React.useRef(0);
  const [tagging, setTagging] = useState(false);
  const [taggingProgress, setTaggingProgress] = useState<{
    active: boolean; current: number; total: number; tagged: number; errors: number; phase: string;
  } | null>(null);
  const [tagResult, setTagResult] = useState<{ tagged: number; errors: number; total: number } | null>(null);

  // AI 일괄 태깅 (미분류만 or 전체 재태깅)
  const handleBatchTag = async (force: boolean) => {
    if (!confirm(force
      ? '모든 이미지를 AI로 재태깅합니다. 기존 태그가 덮어씌워집니다. 진행하시겠습니까?'
      : '미분류 이미지만 AI 태깅합니다. 진행하시겠습니까?'
    )) return;

    setTagging(true);
    setTagResult(null);
    try {
      const res = await fetch('/api/image-pipeline/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: force ? 'retag-all' : 'batch',
          force,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(`태깅 오류: ${data.error}`);
        setTagging(false);
      }
      // 백그라운드 태깅 시작됨 — 폴링으로 진행률 추적 (fetchStats에서 처리)
    } catch (err) {
      alert(`태깅 실패: ${err}`);
      setTagging(false);
    }
  };

  const initialLoadDone = React.useRef(false);

  // /api/diagram-images 프록시를 통해 조회 (Supabase → 로컬 파이프라인 자동 폴백)
  const fetchImages = useCallback(async () => {
    // 초기 로딩에만 스피너 표시, 이후 폴링은 백그라운드
    if (!initialLoadDone.current) setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (subjectFilter !== 'all') params.set('subject', subjectFilter);
      params.set('limit', '2000');

      const res = await fetch(`/api/diagram-images?${params}`);
      if (res.ok) {
        const data = await res.json();
        const newImages = data.images || [];
        setImages(newImages);
        setTotal(data.total || 0);

        // 업로드 중일 때 새 이미지 도착 감지
        if (newImages.length > prevCountRef.current && prevCountRef.current > 0) {
          setExtracting(false);
        }
        prevCountRef.current = newImages.length;
      }
    } catch (err) {
      console.error('Failed to fetch diagram images:', err);
    } finally {
      setIsLoading(false);
      initialLoadDone.current = true;
    }
  }, [subjectFilter]);

  // health 통계 + 처리 상태 + 태깅 상태 확인 (로컬 서버 직접 — 실패해도 무시)
  const fetchStats = useCallback(() => {
    fetch('http://localhost:8200/health')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.db_stats) setLocalStats(data.db_stats);
        if (data?.processing) {
          setProcessingInfo(data.processing);
          if (data.processing.active && data.processing.phase !== 'done') {
            setExtracting(true);
          } else {
            setExtracting(false);
          }
        } else if (extracting) {
          // 서버에서 processing 정보가 없으면 추출 상태 해제
          setExtracting(false);
        }
        // 태깅 상태 추적
        if (data?.tagging) {
          setTaggingProgress(data.tagging);
          if (data.tagging.active) {
            setTagging(true);
          } else if (tagging && data.tagging.phase === 'done') {
            // 태깅 완료됨
            setTagging(false);
            setTagResult({
              tagged: data.tagging.tagged,
              errors: data.tagging.errors,
              total: data.tagging.total,
            });
            fetchImages(); // 결과 새로고침
          }
        }
      })
      .catch(() => {
        // 파이프라인 서버 미실행 시 추출 상태 해제 (무한로딩 방지)
        if (extracting) setExtracting(false);
      });
  }, [tagging, extracting]);

  // 초기 로드 + 폴링 (추출 중이면 2초, 아니면 10초)
  useEffect(() => {
    fetchImages();
    fetchStats();
    const interval = setInterval(() => {
      fetchImages();
      fetchStats();
    }, (extracting || tagging) ? 2000 : 10000);
    return () => clearInterval(interval);
  }, [fetchImages, fetchStats, extracting, tagging]);

  // 과목 필터 + 과학 세부 과목 필터
  const filteredLocal = images.filter((img: any) => {
    if (subjectFilter !== 'all' && img.subject !== subjectFilter) return false;
    if (scienceSubjectFilter !== 'all' && (img.science_subject || '') !== scienceSubjectFilter) return false;
    return true;
  });

  // 현재 이미지에 있는 과학 세부 과목 목록 (동적)
  const availableScienceSubjects = [...new Set(
    images
      .map((img: any) => img.science_subject)
      .filter(Boolean)
  )] as string[];

  const scienceSubjectNames: Record<string, string> = {
    IS1: '통합과학1', IS2: '통합과학2',
    PHY: '물리학', CHM: '화학', BIO: '생명과학', EAR: '지구과학',
    MS_SCI: '중학 과학',
    SEL1: '과학탐구실험1', SEL2: '과학탐구실험2',
    PHY_ME: '역학과 에너지', PHY_EQ: '전자기와 양자',
    CHM_ME: '물질과 에너지', CHM_RW: '화학 반응의 세계',
    BIO_CM: '세포와 물질대사', BIO_GN: '생명의 유전',
    EAR_SS: '지구시스템과학', EAR_PS: '행성우주과학',
    FUS_CC: '기후변화와 환경생태', FUS_SI: '융합과학탐구', FUS_HC: '과학의 역사와 문화',
  };

  // 접힘 상태 관리 (과목별, 소스별)
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<string>>(new Set());
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());

  const toggleSubject = (key: string) => {
    setCollapsedSubjects(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const toggleSource = (key: string) => {
    setCollapsedSources(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* 헤더 */}
      <div className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-emerald-400" />
                도식 이미지 갤러리
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                추출된 과학/수학 도식 이미지 — 총 {total || localStats?.total_images || 0}개
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 과목 필터 */}
            <div className="flex items-center gap-1.5 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
              {['all', 'math', 'science'].map(val => (
                <button
                  key={val}
                  onClick={() => setSubjectFilter(val)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    subjectFilter === val
                      ? val === 'science'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : val === 'math'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-zinc-700 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {val === 'all' ? '전체' : val === 'math' ? '수학' : '과학'}
                  {localStats?.by_subject?.[val] != null && val !== 'all' && (
                    <span className="ml-1 opacity-60">({localStats.by_subject[val]})</span>
                  )}
                </button>
              ))}
            </div>

            {/* AI 태깅 드롭다운 */}
            <div className="relative group/tag">
              <button
                disabled={tagging}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  tagging
                    ? 'bg-violet-500/20 text-violet-300 cursor-wait'
                    : 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300 border border-violet-500/20'
                }`}
              >
                {tagging ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {tagging ? 'AI 태깅 중...' : 'AI 태깅'}
              </button>
              {!tagging && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover/tag:opacity-100 group-hover/tag:pointer-events-auto transition-opacity z-50">
                  <button
                    onClick={() => handleBatchTag(false)}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 rounded-t-lg transition"
                  >
                    <Tag className="h-3 w-3 inline mr-1.5" />
                    미분류만 태깅
                  </button>
                  <button
                    onClick={() => handleBatchTag(true)}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 rounded-b-lg transition border-t border-zinc-800"
                  >
                    <RefreshCw className="h-3 w-3 inline mr-1.5" />
                    전체 재태깅
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={fetchImages}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 과학 세부 과목 탭 */}
        {availableScienceSubjects.length > 0 && (
          <div className="max-w-7xl mx-auto px-6 pb-3 flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] text-zinc-600 mr-1 whitespace-nowrap">과목:</span>
            <button
              onClick={() => setScienceSubjectFilter('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition ${
                scienceSubjectFilter === 'all'
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              전체
            </button>
            {availableScienceSubjects.map(code => (
              <button
                key={code}
                onClick={() => setScienceSubjectFilter(code)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition ${
                  scienceSubjectFilter === code
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {scienceSubjectNames[code] || code}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 추출 진행률 배너 (이미지가 있는 상태에서 추출 중일 때) */}
      {extracting && processingInfo?.active && processingInfo.phase !== 'done' && filteredLocal.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center gap-4">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-emerald-300 font-medium truncate">
                  {processingInfo.source || '파일 처리'} —{' '}
                  {processingInfo.phase === 'extracting'
                    ? `페이지 추출 중 (${processingInfo.current_page}/${processingInfo.total_pages})`
                    : processingInfo.phase === 'enhancing'
                      ? '이미지 보정 중'
                      : processingInfo.phase === 'filtering'
                        ? '이미지 필터링 중'
                        : '처리 중'}
                </p>
                {processingInfo.total_pages > 0 && (
                  <span className="text-[10px] text-emerald-400/70 ml-2">
                    {Math.round((processingInfo.current_page / processingInfo.total_pages) * 100)}%
                  </span>
                )}
              </div>
              {processingInfo.total_pages > 0 && (
                <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.round((processingInfo.current_page / processingInfo.total_pages) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 태깅 진행/결과 배너 */}
      {(tagging || tagResult) && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          {tagging && taggingProgress?.active ? (
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3 flex items-center gap-4">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-violet-300 font-medium">
                    AI 태깅 중... ({taggingProgress.current}/{taggingProgress.total})
                    {taggingProgress.tagged > 0 && ` — ${taggingProgress.tagged}개 성공`}
                    {taggingProgress.errors > 0 && `, ${taggingProgress.errors}개 오류`}
                  </p>
                  {taggingProgress.total > 0 && (
                    <span className="text-[10px] text-violet-400/70 ml-2">
                      {Math.round((taggingProgress.current / taggingProgress.total) * 100)}%
                    </span>
                  )}
                </div>
                {taggingProgress.total > 0 && (
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-violet-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((taggingProgress.current / taggingProgress.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : tagging ? (
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
              <p className="text-xs text-violet-300 font-medium">AI 태깅 시작 중...</p>
            </div>
          ) : tagResult ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <p className="text-xs text-emerald-300 font-medium">
                  AI 태깅 완료: {tagResult.tagged}/{tagResult.total}개 성공
                  {tagResult.errors > 0 && `, ${tagResult.errors}개 오류`}
                </p>
              </div>
              <button
                onClick={() => setTagResult(null)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition"
              >
                닫기
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* 컨텐츠 */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
          </div>
        ) : filteredLocal.length === 0 ? (
          <div className="text-center py-20">
            {extracting ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-emerald-400 mx-auto mb-4" />
                <p className="text-sm text-emerald-300 font-medium">도식 이미지 추출 중...</p>
                {processingInfo?.active && processingInfo.phase !== 'done' && (
                  <div className="mt-4 w-72 mx-auto">
                    <p className="text-xs text-zinc-400 mb-1 font-medium">
                      {processingInfo.source || '파일 처리 중'}
                    </p>
                    <p className="text-xs text-emerald-400/80 mb-2 font-mono">
                      {processingInfo.phase === 'extracting'
                        ? `페이지 추출 중 — ${processingInfo.current_page} / ${processingInfo.total_pages}`
                        : processingInfo.phase === 'enhancing'
                          ? '이미지 보정 중...'
                          : processingInfo.phase === 'done'
                            ? '완료!'
                            : '처리 중...'}
                    </p>
                    {processingInfo.total_pages > 0 && (
                      <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.round((processingInfo.current_page / processingInfo.total_pages) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                    {processingInfo.total_pages > 0 && (
                      <p className="text-[10px] text-zinc-600 mt-1 text-right">
                        {Math.round((processingInfo.current_page / processingInfo.total_pages) * 100)}%
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-zinc-500 mt-3">파일에서 이미지를 추출하고 보정하고 있습니다</p>
              </>
            ) : (
              <>
                <ImageIcon className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">추출된 도식 이미지가 없습니다</p>
                <p className="text-xs text-zinc-600 mt-2">과학 문서를 업로드하면 도식이 자동 추출됩니다</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* 과목별 → 소스(단원)별 계층 그룹 */}
            {(() => {
              // 1단계: science_subject별 그룹
              const subjectGroups = new Map<string, typeof filteredLocal>();
              for (const img of filteredLocal) {
                const sciSubj = (img as any).science_subject || (img as any).subject || '기타';
                if (!subjectGroups.has(sciSubj)) subjectGroups.set(sciSubj, []);
                subjectGroups.get(sciSubj)!.push(img);
              }

              // 과목 정렬 (IS1 → IS2 → PHY → CHM → BIO → EAR → 기타)
              const subjectOrder = ['IS1', 'IS2', 'MS_SCI', 'PHY', 'CHM', 'BIO', 'EAR', 'PHY_ME', 'PHY_EQ', 'CHM_ME', 'CHM_RW', 'BIO_CM', 'BIO_GN', 'EAR_SS', 'EAR_PS', 'math', 'science'];
              const sortedSubjects = Array.from(subjectGroups.entries()).sort(([a], [b]) => {
                const ia = subjectOrder.indexOf(a);
                const ib = subjectOrder.indexOf(b);
                return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
              });

              return sortedSubjects.map(([sciSubj, subjectImgs]) => {
                const subjectName = scienceSubjectNames[sciSubj] || (sciSubj === 'math' ? '수학' : sciSubj === 'science' ? '과학' : sciSubj);
                const isSubjectCollapsed = collapsedSubjects.has(sciSubj);

                // 2단계: 소스(단원)별 그룹
                const sourceGroups = new Map<string, typeof subjectImgs>();
                for (const img of subjectImgs) {
                  const src = (img as any).source || (img as any).source_name || '알 수 없음';
                  if (!sourceGroups.has(src)) sourceGroups.set(src, []);
                  sourceGroups.get(src)!.push(img);
                }

                return (
                  <div key={sciSubj} className="mb-10">
                    {/* 과목 헤더 */}
                    <button
                      onClick={() => toggleSubject(sciSubj)}
                      className="w-full flex items-center gap-3 mb-4 group/subj"
                    >
                      <div className={`w-1 h-6 rounded-full ${
                        sciSubj.startsWith('IS') || sciSubj === 'science'
                          ? 'bg-emerald-500'
                          : sciSubj === 'math'
                            ? 'bg-indigo-500'
                            : sciSubj.startsWith('PHY') ? 'bg-blue-500'
                            : sciSubj.startsWith('CHM') ? 'bg-orange-500'
                            : sciSubj.startsWith('BIO') ? 'bg-green-500'
                            : sciSubj.startsWith('EAR') ? 'bg-amber-500'
                            : 'bg-zinc-500'
                      }`} />
                      <h2 className="text-base font-bold text-white">{subjectName}</h2>
                      <span className="text-xs text-zinc-500">{subjectImgs.length}개</span>
                      <span className="text-xs text-zinc-600">({sourceGroups.size}개 출처)</span>
                      <svg
                        className={`h-4 w-4 text-zinc-500 transition-transform ${isSubjectCollapsed ? '' : 'rotate-90'}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    {!isSubjectCollapsed && (
                      <div className="space-y-6 pl-4 border-l border-zinc-800/50">
                        {Array.from(sourceGroups.entries()).map(([source, imgs]) => {
                          const sourceKey = `${sciSubj}::${source}`;
                          const isSourceCollapsed = collapsedSources.has(sourceKey);

                          return (
                            <div key={source}>
                              {/* 소스(단원) 헤더 */}
                              <div className="flex items-center gap-3 mb-3">
                                <button
                                  onClick={() => toggleSource(sourceKey)}
                                  className="flex items-center gap-2 group/src"
                                >
                                  <svg
                                    className={`h-3 w-3 text-zinc-600 transition-transform ${isSourceCollapsed ? '' : 'rotate-90'}`}
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                  <h3 className="text-sm font-medium text-zinc-300 group-hover/src:text-white transition">{source}</h3>
                                </button>
                                <span className="text-[11px] text-zinc-600">{imgs.length}개</span>
                                <button
                                  onClick={() => handleDeleteSource(source)}
                                  disabled={deleting === source}
                                  className="ml-auto flex items-center gap-1 px-2 py-1 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition"
                                >
                                  {deleting === source ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  삭제
                                </button>
                              </div>

                              {!isSourceCollapsed && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                  {imgs.map((img: any, idx: number) => {
                                    const imgUrl = img.public_url
                                      || (img.filepath
                                        ? `/api/diagram-images/proxy?path=${encodeURIComponent(img.filepath)}`
                                        : null);

                                    return (
                                      <div
                                        key={img.id || idx}
                                        className="group relative bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden hover:border-zinc-600 transition cursor-pointer"
                                        onClick={() => setPreviewImage(img)}
                                      >
                                        <div className="aspect-square bg-white flex items-center justify-center p-2">
                                          {imgUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={imgUrl}
                                              alt={img.filename}
                                              className="max-w-full max-h-full object-contain"
                                            />
                                          ) : (
                                            <div className="text-zinc-400 text-xs text-center">
                                              <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-30" />
                                              {img.filename}
                                            </div>
                                          )}
                                        </div>
                                        <div className="p-2">
                                          <p className="text-[10px] text-zinc-400 truncate">{img.filename}</p>
                                          <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[9px] text-zinc-600">
                                              {img.width}x{img.height}
                                            </span>
                                            <span className="text-[9px] text-zinc-600">p.{img.page || img.page_number || 0}</span>
                                            {(img.upscaled || img.is_enhanced) && (
                                              <CheckCircle className="h-2.5 w-2.5 text-emerald-500" />
                                            )}
                                          </div>
                                          {/* AI 태그 정보 */}
                                          {img.tags && typeof img.tags === 'object' && (img.tags as any).diagram_type && (img.tags as any).diagram_type !== '미분류' && (
                                            <div className="mt-1 space-y-0.5">
                                              <p className="text-[9px] text-violet-400 font-medium truncate">
                                                {(img.tags as any).diagram_type}
                                              </p>
                                              {(img.unit_code || (img.tags as any).unit_code) && (
                                                <p className="text-[8px] text-zinc-500 truncate">
                                                  {img.unit_code || (img.tags as any).unit_code}
                                                  {(img.unit_name || (img.tags as any).unit_name) && ` · ${img.unit_name || (img.tags as any).unit_name}`}
                                                </p>
                                              )}
                                            </div>
                                          )}
                                          {img.tags && typeof img.tags === 'object' && ((img.tags as any).diagram_type === '미분류' || !(img.tags as any).diagram_type) && (
                                            <p className="text-[9px] text-zinc-600 mt-1">미분류</p>
                                          )}
                                        </div>
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-3">
                                          <ZoomIn className="h-5 w-5 text-white" />
                                          <button
                                            onClick={(e) => handleDeleteImage(img.id, e)}
                                            disabled={deleting === img.id}
                                            className="p-1.5 bg-red-500/80 hover:bg-red-500 rounded-lg transition"
                                          >
                                            {deleting === img.id
                                              ? <Loader2 className="h-4 w-4 text-white animate-spin" />
                                              : <Trash2 className="h-4 w-4 text-white" />}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </>
        )}
      </div>

      {/* 이미지 프리뷰 모달 */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="max-w-4xl max-h-[90vh] bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-white p-4 flex items-center justify-center" style={{ maxHeight: '70vh' }}>
              {(previewImage as any).public_url || (previewImage as any).filepath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    (previewImage as any).public_url
                    || `/api/diagram-images/proxy?path=${encodeURIComponent((previewImage as any).filepath)}`
                  }
                  alt={previewImage.filename}
                  className="max-w-full max-h-[65vh] object-contain"
                />
              ) : (
                <p className="text-zinc-500">미리보기 불가</p>
              )}
            </div>
            <div className="p-4 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{previewImage.filename}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {(previewImage as any).source || (previewImage as any).source_name} ·{' '}
                    {(previewImage as any).width}×{(previewImage as any).height}px ·{' '}
                    페이지 {(previewImage as any).page || (previewImage as any).page_number || 0}
                  </p>
                  {/* AI 태그 상세 정보 */}
                  {(previewImage as any).tags && typeof (previewImage as any).tags === 'object' && (previewImage as any).tags.diagram_type && (previewImage as any).tags.diagram_type !== '미분류' && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded text-[10px] font-medium">
                          {(previewImage as any).tags.diagram_type}
                        </span>
                        {(previewImage as any).tags.subject && (
                          <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px]">
                            {(previewImage as any).tags.subject}
                          </span>
                        )}
                        {(previewImage as any).tags.grade_level && (
                          <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px]">
                            {(previewImage as any).tags.grade_level}
                          </span>
                        )}
                      </div>
                      {((previewImage as any).unit_code || (previewImage as any).tags.unit_code) && (
                        <p className="text-[10px] text-emerald-400">
                          {(previewImage as any).unit_code || (previewImage as any).tags.unit_code}
                          {((previewImage as any).unit_name || (previewImage as any).tags.unit_name) && ` — ${(previewImage as any).unit_name || (previewImage as any).tags.unit_name}`}
                        </p>
                      )}
                      {(previewImage as any).tags.description && (
                        <p className="text-[10px] text-zinc-400">{(previewImage as any).tags.description}</p>
                      )}
                      {(previewImage as any).tags.tags && Array.isArray((previewImage as any).tags.tags) && (previewImage as any).tags.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(previewImage as any).tags.tags.map((tag: string, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded text-[9px]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 transition"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
