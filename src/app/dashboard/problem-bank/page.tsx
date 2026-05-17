'use client';

// ============================================================================
// 문제은행 (Problem Bank) — 신규 페이지
// Claude Design 번들 적용 (24kRHRzt8NdtxywqoQY09g)
// 수학비서 22,785 유형 트리 + problems 검색 + 카트 → 시험지 생성
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSubjectTrack } from '@/contexts/SubjectTrackContext';
import { Beaker } from 'lucide-react';
import {
  Library,
  Calculator,
  Atom,
  ChevronRight,
  Search,
  ShoppingCart,
  Trash2,
  Eye,
  Copy,
  Sparkles,
  GripVertical,
  X,
  FileText,
  Plus,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import './problem-bank.css';

// ============================================================================
// Types
// ============================================================================

interface TreeSubject {
  code: string;
  name: string;
}

interface TreeNode {
  t: string;
  c: string;
  ch?: TreeNode[];
}

interface ProblemRow {
  id: string;
  content_latex: string;
  answer_json: any;
  source_name?: string;
  source_year?: number;
  images?: any[];
  classifications?: {
    type_code?: string;
    expanded_type_code?: string;
    difficulty?: number;
    cognitive_domain?: string;
  }[];
}

interface CartItem {
  id: string;
  num: number;
  content_latex: string;
  typeCode?: string;
  difficulty?: number;
  domain?: string;
  sourceName?: string;
}

const DOMAIN_LABELS: Record<string, string> = {
  CALCULATION: '계산',
  UNDERSTANDING: '이해',
  INFERENCE: '추론',
  PROBLEM_SOLVING: '문제해결',
};

const DIFFICULTY_PRESETS = [
  { id: 'low', label: '하 1-3', range: [1, 2, 3] },
  { id: 'mid', label: '중 4-6', range: [4, 5, 6] },
  { id: 'high', label: '상 7-8', range: [7, 8] },
  { id: 'top', label: '최상 9-10', range: [9, 10] },
];

// ============================================================================
// Main Page
// ============================================================================

export default function ProblemBankPage() {
  const router = useRouter();
  // PR-T10 G-13c — 과학 트랙은 수학비서 트리 기반이라 임시 안내 카드만 (마스터 데이터 정식 분기 전)
  const { activeTrack, isEnabled: trackSplitEnabled } = useSubjectTrack();
  if (trackSplitEnabled && activeTrack === 'science') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-surface-card border border-subtle rounded-2xl p-8">
          <Beaker className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-content-primary mb-2">과학 문제은행 준비 중</h2>
          <p className="text-sm text-content-tertiary leading-relaxed">
            현재 문제은행은 수학비서 분류 트리 기반으로 운영됩니다.
            <br />
            과학 분류 마스터 데이터 적재 후 정식 분기 예정입니다.
            <br />
            상단 토글에서 [수학] 트랙으로 전환하면 사용 가능합니다.
          </p>
        </div>
      </div>
    );
  }

  // Tree state
  const [subjects, setSubjects] = useState<TreeSubject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('07'); // 공통수학1 default
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [openBranches, setOpenBranches] = useState<Set<string>>(new Set());
  const [selectedTypeCode, setSelectedTypeCode] = useState<string | null>(null);

  // Filters
  const [difficulty, setDifficulty] = useState<Set<number>>(new Set());
  const [domain, setDomain] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Results
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [creatingExam, setCreatingExam] = useState(false);

  // ── Fetch subjects on mount
  useEffect(() => {
    fetch('/api/mathsecr/tree')
      .then((r) => r.json())
      .then((data) => {
        if (data.subjects) setSubjects(data.subjects);
      })
      .catch(console.error);
  }, []);

  // ── Fetch tree when subject changes
  useEffect(() => {
    if (!selectedSubject) return;
    fetch(`/api/mathsecr/tree?subject=${selectedSubject}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tree) setTree(data.tree);
      })
      .catch(console.error);
  }, [selectedSubject]);

  // ── Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Fetch problems when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (selectedTypeCode) params.set('typeCode', selectedTypeCode);
    if (difficulty.size === 1) params.set('difficulty', String([...difficulty][0]));
    params.set('limit', '30');

    setLoading(true);
    fetch(`/api/problems/search?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setProblems(data.problems || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [debouncedQuery, selectedTypeCode, difficulty]);

  // ── Toggle tree branches
  const toggleBranch = useCallback((code: string) => {
    setOpenBranches((prev) => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  }, []);

  // ── Toggle difficulty
  const toggleDifficulty = useCallback((n: number) => {
    setDifficulty((prev) => {
      const s = new Set(prev);
      if (s.has(n)) s.delete(n);
      else s.add(n);
      return s;
    });
  }, []);

  const applyDifficultyPreset = useCallback((range: number[]) => {
    setDifficulty((prev) => {
      const curr = [...prev].sort().join(',');
      const next = [...range].sort().join(',');
      if (curr === next) return new Set();
      return new Set(range);
    });
  }, []);

  // ── Cart actions
  const addToCart = useCallback((p: ProblemRow) => {
    setCart((prev) => {
      if (prev.some((c) => c.id === p.id)) return prev;
      const cls = p.classifications?.[0];
      return [
        ...prev,
        {
          id: p.id,
          num: prev.length + 1,
          content_latex: p.content_latex,
          typeCode: cls?.type_code,
          difficulty: cls?.difficulty,
          domain: cls?.cognitive_domain,
          sourceName: p.source_name,
        },
      ];
    });
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id).map((c, i) => ({ ...c, num: i + 1 })));
  }, []);

  const clearCart = useCallback(() => {
    if (cart.length === 0) return;
    if (!confirm(`카트의 ${cart.length}개 문제를 모두 제거하시겠습니까?`)) return;
    setCart([]);
  }, [cart.length]);

  // ── Create exam from cart
  const createExamFromCart = useCallback(async () => {
    if (cart.length === 0) return;
    setCreatingExam(true);
    try {
      const title = `문제은행 출제 - ${new Date().toLocaleDateString('ko-KR')}`;
      const res = await fetch('/api/exams/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          problemIds: cart.map((c) => c.id),
        }),
      });
      if (!res.ok) {
        alert('시험지 생성 실패: ' + res.status);
        return;
      }
      const data = await res.json();
      if (data.examId) {
        router.push(`/dashboard/cloud/${data.examId}`);
      } else {
        alert('시험지 생성 완료. 과사람클라우드로 이동합니다.');
        router.push('/dashboard/cloud');
      }
    } catch (e) {
      alert('오류: ' + (e instanceof Error ? e.message : '알 수 없는 오류'));
    } finally {
      setCreatingExam(false);
    }
  }, [cart, router]);

  // ── Tree render helper
  const renderTreeNode = useCallback(
    (node: TreeNode, depth: number = 0): React.ReactNode => {
      const hasChildren = node.ch && node.ch.length > 0;
      const isOpen = openBranches.has(node.c);
      const isLeafType = !hasChildren;
      const isActive = selectedTypeCode === node.c;

      if (depth === 0) {
        // Top-level (대단원)
        return (
          <div key={node.c}>
            <button
              type="button"
              className={`pb-tree-grade ${isOpen ? 'open' : ''}`}
              onClick={() => toggleBranch(node.c)}
            >
              <ChevronRight className="caret" />
              <span style={{ flex: 1 }}>{node.t}</span>
              {hasChildren && <span className="grade-count">{node.ch!.length}</span>}
            </button>
            {isOpen && hasChildren && (
              <div className="pb-tree-units">
                {node.ch!.map((c) => renderTreeNode(c, depth + 1))}
              </div>
            )}
          </div>
        );
      }

      if (depth === 1) {
        // Mid-level (중단원)
        return (
          <div key={node.c}>
            <button
              type="button"
              className={`pb-tree-unit ${isOpen ? 'open' : ''}`}
              onClick={() => toggleBranch(node.c)}
            >
              <ChevronRight className="caret" />
              <span style={{ flex: 1 }}>{node.t}</span>
              {hasChildren && <span className="unit-count">{node.ch!.length}</span>}
            </button>
            {isOpen && hasChildren && (
              <div className="pb-tree-types">
                {node.ch!.map((c) => renderTreeNode(c, depth + 1))}
              </div>
            )}
          </div>
        );
      }

      // Leaf (소단원/유형)
      return (
        <button
          key={node.c}
          type="button"
          className={`pb-tree-type ${isActive ? 'active' : ''}`}
          onClick={() => setSelectedTypeCode(isActive ? null : `MS${selectedSubject}-${node.c}`)}
        >
          <span>· {node.t}</span>
        </button>
      );
    },
    [openBranches, selectedTypeCode, selectedSubject, toggleBranch]
  );

  // ── Active chips
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (selectedTypeCode) {
      chips.push({
        key: 'type',
        label: selectedTypeCode,
        onRemove: () => setSelectedTypeCode(null),
      });
    }
    if (difficulty.size > 0) {
      chips.push({
        key: 'diff',
        label: `난이도 ${[...difficulty].sort().join(',')}`,
        onRemove: () => setDifficulty(new Set()),
      });
    }
    if (domain.size > 0) {
      [...domain].forEach((d) => {
        chips.push({
          key: `dom-${d}`,
          label: DOMAIN_LABELS[d] || d,
          onRemove: () => {
            setDomain((prev) => {
              const n = new Set(prev);
              n.delete(d);
              return n;
            });
          },
        });
      });
    }
    return chips;
  }, [selectedTypeCode, difficulty, domain]);

  const currentPreset = useMemo(() => {
    const selected = [...difficulty].sort().join(',');
    return DIFFICULTY_PRESETS.find((p) => [...p.range].sort().join(',') === selected)?.id;
  }, [difficulty]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="pb-shell">
      {/* ═══════ LEFT SIDEBAR ═══════ */}
      <aside className="pb-side">
        <div className="pb-side-head">
          <div className="pb-side-title">
            <Library />
            <span>문제은행</span>
            <span className="count">22,785</span>
          </div>
          <div className="pb-subj-seg">
            <button className="active">
              <Calculator />
              수학
            </button>
            <button disabled>
              <Atom />
              과학
            </button>
          </div>
        </div>

        <div className="pb-side-scroll">
          {/* 과목 선택 */}
          <div className="pb-tree-section">
            <div className="pb-tree-section-h">
              <span>과목</span>
            </div>
            {subjects.map((s) => (
              <button
                key={s.code}
                type="button"
                className={`pb-tree-type ${selectedSubject === s.code ? 'active' : ''}`}
                onClick={() => {
                  setSelectedSubject(s.code);
                  setSelectedTypeCode(null);
                  setOpenBranches(new Set());
                }}
              >
                <span>{s.name}</span>
              </button>
            ))}
          </div>

          {/* 단원·유형 트리 */}
          <div className="pb-tree-section">
            <div className="pb-tree-section-h">
              <span>단원 · 유형</span>
              <span className="spacer" />
              {tree && tree.ch && (
                <button
                  className="qa"
                  type="button"
                  onClick={() => {
                    const allCodes = new Set<string>();
                    const walk = (n: TreeNode) => {
                      if (n.ch) {
                        allCodes.add(n.c);
                        n.ch.forEach(walk);
                      }
                    };
                    tree.ch?.forEach(walk);
                    setOpenBranches(allCodes);
                  }}
                >
                  모두 펼치기
                </button>
              )}
            </div>
            {tree?.ch?.map((n) => renderTreeNode(n))}
          </div>

          {/* 난이도 */}
          <div className="pb-tree-section">
            <div className="pb-tree-section-h">
              <span>난이도</span>
              <span className="spacer" />
              {difficulty.size > 0 && (
                <button className="qa" type="button" onClick={() => setDifficulty(new Set())}>
                  초기화
                </button>
              )}
            </div>
            <div className="pb-diff-presets">
              {DIFFICULTY_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={currentPreset === p.id ? 'active' : ''}
                  onClick={() => applyDifficultyPreset(p.range)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="pb-diff-row">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <div
                  key={n}
                  data-level={n}
                  className={`pb-diff-cell ${difficulty.has(n) ? 'active' : ''}`}
                  onClick={() => toggleDifficulty(n)}
                >
                  {n}
                </div>
              ))}
            </div>
          </div>

          {/* 인지영역 */}
          <div className="pb-tree-section">
            <div className="pb-tree-section-h">
              <span>인지영역</span>
              <span className="spacer" />
              {domain.size > 0 && (
                <button className="qa" type="button" onClick={() => setDomain(new Set())}>
                  초기화
                </button>
              )}
            </div>
            <div className="pb-dom-grid">
              {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
                <div
                  key={key}
                  data-dom={key}
                  className={`pb-dom-cell ${domain.has(key) ? 'active' : ''}`}
                  onClick={() => {
                    setDomain((prev) => {
                      const n = new Set(prev);
                      if (n.has(key)) n.delete(key);
                      else n.add(key);
                      return n;
                    });
                  }}
                >
                  <span className="dot" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ═══════ MAIN ═══════ */}
      <main className="pb-main">
        {/* Toolbar */}
        <div className="pb-main-toolbar">
          <div className="pb-toolbar-row">
            <div className="pb-search-big">
              <Search className="search-ic" />
              <input
                type="text"
                placeholder="문제 내용, 소스명 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select className="pb-sort-select">
              <option>최신순</option>
              <option>난이도 낮은순</option>
              <option>난이도 높은순</option>
            </select>
            <div className="pb-view-seg">
              <button className="active" title="리스트 뷰">
                <ListIcon />
              </button>
              <button title="카드 뷰">
                <LayoutGrid />
              </button>
            </div>
          </div>

          {/* Active chips + count */}
          <div className="pb-toolbar-row">
            <div className="pb-chips-row">
              {activeChips.length > 0 && (
                <>
                  <span className="pb-chips-label">적용된 필터</span>
                  {activeChips.map((chip) => (
                    <span key={chip.key} className="pb-chip">
                      {chip.label}
                      <button type="button" onClick={chip.onRemove}>
                        <X />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className="pb-chip-clear"
                    onClick={() => {
                      setSelectedTypeCode(null);
                      setDifficulty(new Set());
                      setDomain(new Set());
                    }}
                  >
                    전체 해제
                  </button>
                </>
              )}
            </div>
            <div className="pb-results-count" style={{ marginLeft: 'auto' }}>
              {loading ? (
                <span>불러오는 중...</span>
              ) : (
                <>
                  총 <b>{problems.length.toLocaleString()}</b>개 문제
                </>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="pb-main-body">
          <div className="pb-list">
            {problems.length === 0 && !loading && (
              <div
                style={{
                  padding: '60px 20px',
                  textAlign: 'center',
                  color: 'var(--chrome-fg-4)',
                }}
              >
                <div style={{ marginBottom: 8 }}>검색 결과가 없습니다</div>
                <div style={{ fontSize: 12 }}>필터를 조정하거나 다른 키워드로 검색해보세요</div>
              </div>
            )}
            {problems.map((p, idx) => {
              const cls = p.classifications?.[0];
              const diff = cls?.difficulty || 0;
              const dom = cls?.cognitive_domain || '';
              const inCart = cart.some((c) => c.id === p.id);

              return (
                <div
                  key={p.id}
                  className={`pb-card ${inCart ? 'selected' : ''}`}
                  onClick={() => (inCart ? removeFromCart(p.id) : addToCart(p))}
                >
                  <div className="pb-check">
                    <input
                      type="checkbox"
                      checked={inCart}
                      onChange={() => (inCart ? removeFromCart(p.id) : addToCart(p))}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="pb-body-col">
                    <div className="pb-head">
                      <span className="pb-num">{String(idx + 1).padStart(2, '0')}</span>
                      {cls?.type_code && <span className="pb-code">{cls.type_code}</span>}
                      {diff > 0 && (
                        <span className={`pb-badge pb-diff-pill-${diff}`}>난이도 {diff}</span>
                      )}
                      {dom && (
                        <span className={`pb-badge pb-dom-pill-${dom}`}>
                          {DOMAIN_LABELS[dom] || dom}
                        </span>
                      )}
                    </div>
                    <div className="pb-body-text">
                      <MixedContentRenderer content={p.content_latex || ''} />
                    </div>
                    <div className="pb-meta">
                      {p.source_name && <span className="tag">{p.source_name}</span>}
                      {p.source_year && <span className="tag">{p.source_year}</span>}
                    </div>
                  </div>
                  <div className="pb-actions">
                    <button
                      type="button"
                      className="pb-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/dashboard/cloud?problemId=${p.id}`, '_blank');
                      }}
                    >
                      <Eye />
                      미리보기
                    </button>
                    <button
                      type="button"
                      className={`pb-action ${inCart ? '' : 'primary'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (inCart) removeFromCart(p.id);
                        else addToCart(p);
                      }}
                    >
                      {inCart ? <X /> : <Plus />}
                      {inCart ? '제거' : '카트 담기'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* ═══════ CART PANEL ═══════ */}
      <aside className="pb-cart-panel">
        <div className="pb-cart-head">
          <div className="pb-cart-ic">
            <ShoppingCart />
          </div>
          <div className="pb-cart-title-wrap">
            <div className="pb-cart-title">
              시험지 편성
              <span className="pb-cart-count">{cart.length}</span>
            </div>
            <div className="pb-cart-sub">선택한 문제로 새 시험지 제작</div>
          </div>
          <button type="button" className="pb-clear-btn" onClick={clearCart} title="카트 비우기">
            <Trash2 />
          </button>
        </div>

        <div className="pb-cart-list">
          {cart.length === 0 ? (
            <div className="pb-cart-empty">
              <div className="ic">
                <ShoppingCart />
              </div>
              <div className="title">카트가 비어있습니다</div>
              <div className="sub">
                왼쪽 문제 목록에서 카드를 클릭하여
                <br />
                시험지에 포함할 문제를 선택하세요
              </div>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="pb-cart-item">
                <span className="drag-handle">
                  <GripVertical />
                </span>
                <span className="item-num">{String(item.num).padStart(2, '0')}</span>
                <div className="item-body">
                  <div className="item-title">
                    {(item.content_latex || '').replace(/<[^>]*>/g, '').slice(0, 40)}
                  </div>
                  <div className="item-meta">
                    {item.typeCode && <span>{item.typeCode}</span>}
                    {item.difficulty && (
                      <span>
                        <span
                          className="diff-dot"
                          style={{
                            background:
                              item.difficulty <= 2
                                ? '#2563eb'
                                : item.difficulty <= 4
                                  ? '#10b981'
                                  : item.difficulty <= 7
                                    ? '#eab308'
                                    : item.difficulty <= 9
                                      ? '#f97316'
                                      : '#dc2626',
                          }}
                        />
                        난이도 {item.difficulty}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="item-remove"
                  onClick={() => removeFromCart(item.id)}
                >
                  <X />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="pb-cart-foot">
          <button
            type="button"
            className="pb-cta-primary"
            disabled={cart.length === 0 || creatingExam}
            onClick={createExamFromCart}
          >
            {creatingExam ? (
              <>
                <Sparkles className="animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <FileText />
                새 시험지로 만들기 ({cart.length})
              </>
            )}
          </button>
          <button
            type="button"
            className="pb-cta-secondary"
            disabled={cart.length === 0}
            onClick={() => alert('기존 시험지에 추가 기능은 준비 중입니다')}
          >
            <Copy />
            기존 시험지에 추가
          </button>
        </div>
      </aside>
    </div>
  );
}
