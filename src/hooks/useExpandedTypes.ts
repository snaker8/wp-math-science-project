'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  ExpandedMathType,
  ExpandedMathTypeRow,
  LevelNode,
} from '@/types/expanded-types';
import { toExpandedMathType, buildTypeTree } from '@/types/expanded-types';

// ============================================================================
// 트리 데이터 훅
// ============================================================================

interface UseTypeTreeResult {
  tree: LevelNode[];
  totalTypes: number;
  totalStandards: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTypeTree(filters?: {
  school?: string;
  level?: string;
}): UseTypeTreeResult {
  const [tree, setTree] = useState<LevelNode[]>([]);
  const [totalTypes, setTotalTypes] = useState(0);
  const [totalStandards, setTotalStandards] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters?.school) params.set('school', filters.school);
    if (filters?.level) params.set('level', filters.level);

    try {
      const res = await fetch(`/api/expanded-types/tree?${params}`);
      if (!res.ok) throw new Error('Failed to fetch tree');
      const json = await res.json();
      setTree(json.tree || []);
      setTotalTypes(json.totalTypes || 0);
      setTotalStandards(json.totalStandards || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filters?.school, filters?.level]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  return { tree, totalTypes, totalStandards, loading, error, refetch: fetchTree };
}

// ============================================================================
// 유형 상세 훅
// ============================================================================

interface TypeDetailResult {
  type: ExpandedMathTypeRow | null;
  problems: unknown[];
  relatedTypes: unknown[];
  loading: boolean;
  error: string | null;
}

export function useTypeDetail(typeCode: string | null): TypeDetailResult {
  const [type, setType] = useState<ExpandedMathTypeRow | null>(null);
  const [problems, setProblems] = useState<unknown[]>([]);
  const [relatedTypes, setRelatedTypes] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!typeCode) {
      setType(null);
      setProblems([]);
      setRelatedTypes([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/expanded-types/${encodeURIComponent(typeCode)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch type detail');
        return res.json();
      })
      .then(json => {
        if (cancelled) return;
        setType(json.type || null);
        setProblems(json.problems || []);
        setRelatedTypes(json.relatedTypes || []);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Unknown error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [typeCode]);

  return { type, problems, relatedTypes, loading, error };
}

// ============================================================================
// 통계 훅
// ============================================================================

interface StatsResult {
  total: number;
  totalStandards: number;
  byLevel: Record<string, number>;
  byDomain: Record<string, number>;
  byCognitive: Record<string, number>;
  bySchool: Record<string, number>;
  loading: boolean;
}

export function useExpandedTypesStats(): StatsResult {
  const [stats, setStats] = useState<Omit<StatsResult, 'loading'>>({
    total: 0, totalStandards: 0, byLevel: {}, byDomain: {}, byCognitive: {}, bySchool: {},
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/expanded-types/stats')
      .then(res => res.json())
      .then(json => setStats(json))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { ...stats, loading };
}

// ============================================================================
// 검색 훅
// ============================================================================

interface SearchResult {
  results: ExpandedMathType[];
  count: number;
  loading: boolean;
}

export function useExpandedTypesSearch(params: {
  search?: string;
  level?: string;
  domain?: string;
  cognitive?: string;
  limit?: number;
  offset?: number;
}): SearchResult {
  const [results, setResults] = useState<ExpandedMathType[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.level) qs.set('level', params.level);
    if (params.domain) qs.set('domain', params.domain);
    if (params.cognitive) qs.set('cognitive', params.cognitive);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));

    let cancelled = false;
    setLoading(true);

    fetch(`/api/expanded-types?${qs}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        const mapped = (json.data || []).map((row: ExpandedMathTypeRow) => toExpandedMathType(row));
        setResults(mapped);
        setCount(json.count || 0);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [params.search, params.level, params.domain, params.cognitive, params.limit, params.offset]);

  return { results, count, loading };
}
