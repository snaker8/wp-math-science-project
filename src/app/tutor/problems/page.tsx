'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  Plus,
  ChevronDown,
  Eye,
  Edit,
  Trash2,
  BookOpen,
  Tag,
  Clock,
  BarChart3,
  Upload,
  ArrowLeft,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface Problem {
  id: string;
  content: string;           // 표시용 (content_latex에서 파생)
  content_latex: string | null;
  answer: string | null;
  solution: string | null;
  solution_latex: string | null;
  difficulty: number;
  type_code: string | null;
  type_name: string | null;
  subject: string | null;
  chapter: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'PENDING_REVIEW' | 'APPROVED';
  created_at: string;
  ai_analysis: Record<string, unknown> | null;
  source_name: string | null;
  tags: string[] | null;
}

const DIFFICULTY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: '매우 쉬움', color: '#22c55e' },
  2: { label: '쉬움', color: '#84cc16' },
  3: { label: '보통', color: '#eab308' },
  4: { label: '어려움', color: '#f97316' },
  5: { label: '매우 어려움', color: '#ef4444' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '임시저장', color: '#6b7280' },
  PENDING_REVIEW: { label: '검토 대기', color: '#f59e0b' },
  APPROVED: { label: '승인됨', color: '#3b82f6' },
  ACTIVE: { label: '활성', color: '#22c55e' },
  ARCHIVED: { label: '보관됨', color: '#9ca3af' },
};

export default function TutorProblemsPage() {
  const router = useRouter();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('전체');
  const [filterDifficulty, setFilterDifficulty] = useState('전체');
  const [filterStatus, setFilterStatus] = useState('전체');

  const subjects = ['전체', '수학I', '수학II', '미적분', '확률과 통계', '기하'];
  const difficulties = ['전체', '1', '2', '3', '4', '5'];
  const statuses = ['전체', 'DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ACTIVE', 'ARCHIVED'];

  useEffect(() => {
    loadProblems();
  }, []);

  const loadProblems = async () => {
    if (!supabaseBrowser) {
      // Mock data when Supabase is not configured
      setProblems([
        {
          id: '1',
          content: '다음 이차방정식의 두 근을 구하시오.',
          content_latex: 'x^2 - 5x + 6 = 0',
          answer: 'x = 2 또는 x = 3',
          solution: '(x-2)(x-3) = 0을 이용',
          solution_latex: null,
          difficulty: 2,
          type_code: 'MA-HS1-ALG-02-015',
          type_name: '이차방정식의 풀이 - 인수분해',
          subject: '수학I',
          chapter: '방정식과 부등식',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
          ai_analysis: null,
          source_name: null,
          tags: null,
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabaseBrowser.auth.getUser();

      // problems 테이블과 classifications 테이블을 조인
      let query = supabaseBrowser
        .from('problems')
        .select(`
          id,
          content_latex,
          solution_latex,
          answer_json,
          status,
          source_name,
          ai_analysis,
          tags,
          created_at,
          created_by,
          classifications (
            type_code,
            difficulty,
            cognitive_domain,
            ai_confidence
          )
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100);

      // 로그인한 사용자가 있으면 본인 문제 + created_by가 null인 문제 (업로드 시 익명으로 저장된 것)
      // 로그인하지 않은 경우에도 모든 문제를 보여줌
      if (user) {
        query = query.or(`created_by.eq.${user.id},created_by.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // DB 결과를 Problem 인터페이스에 맞게 변환
      const mapped: Problem[] = (data || []).map((row: any) => {
        const classification = row.classifications?.[0]; // 첫 번째 분류 사용
        const aiAnalysis = row.ai_analysis as Record<string, any> | null;
        const answerJson = row.answer_json as Record<string, any> | null;

        // content_latex에서 표시용 content 추출
        const contentLatex = row.content_latex || '';
        const displayContent = contentLatex
          .replace(/\$[^$]+\$/g, '[수식]')  // 인라인 수식 → [수식]
          .replace(/\\[a-zA-Z]+/g, '')       // LaTeX 명령어 제거
          .replace(/[{}]/g, '')              // 중괄호 제거
          .trim() || contentLatex.substring(0, 200);

        return {
          id: row.id,
          content: displayContent,
          content_latex: contentLatex,
          answer: answerJson?.finalAnswer || answerJson?.correct_answer || null,
          solution: row.solution_latex?.substring(0, 200) || null,
          solution_latex: row.solution_latex,
          difficulty: classification?.difficulty ? parseInt(classification.difficulty) : (aiAnalysis?.classification?.difficulty || 3),
          type_code: classification?.type_code || aiAnalysis?.classification?.typeCode || null,
          type_name: aiAnalysis?.classification?.typeName || null,
          subject: aiAnalysis?.classification?.subject || null,
          chapter: aiAnalysis?.classification?.chapter || null,
          status: row.status || 'PENDING_REVIEW',
          created_at: row.created_at,
          ai_analysis: aiAnalysis,
          source_name: row.source_name,
          tags: row.tags,
        };
      });

      setProblems(mapped);
    } catch (error) {
      console.error('Failed to load problems:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProblems = problems.filter((problem) => {
    const matchesSearch =
      problem.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (problem.content_latex?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (problem.type_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesSubject = filterSubject === '전체' || problem.subject === filterSubject;
    const matchesDifficulty =
      filterDifficulty === '전체' || problem.difficulty === parseInt(filterDifficulty);
    const matchesStatus = filterStatus === '전체' || problem.status === filterStatus;

    return matchesSearch && matchesSubject && matchesDifficulty && matchesStatus;
  });

  const handleDelete = async (id: string) => {
    if (!confirm('이 문제를 삭제하시겠습니까?')) return;

    if (supabaseBrowser) {
      const { error } = await supabaseBrowser
        .from('problems')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (!error) {
        setProblems((prev) => prev.filter((p) => p.id !== id));
      }
    } else {
      setProblems((prev) => prev.filter((p) => p.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>문제 목록 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="problems-page">
      <header className="page-header">
        <div className="header-left">
          <button onClick={() => router.back()} className="back-btn" title="뒤로가기">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>문제 관리</h1>
            <p>업로드된 문제를 관리하고 시험지에 활용하세요</p>
          </div>
        </div>
        <Link href="/tutor/workflow" className="btn-primary">
          <Upload size={18} />
          문제 업로드
        </Link>
      </header>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-item">
          <BookOpen size={20} />
          <span className="stat-value">{problems.length}</span>
          <span className="stat-label">전체 문제</span>
        </div>
        <div className="stat-item">
          <Tag size={20} />
          <span className="stat-value">
            {new Set(problems.map((p) => p.type_code).filter(Boolean)).size}
          </span>
          <span className="stat-label">유형</span>
        </div>
        <div className="stat-item">
          <BarChart3 size={20} />
          <span className="stat-value">
            {problems.filter((p) => p.status === 'ACTIVE').length}
          </span>
          <span className="stat-label">활성 문제</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="문제, 수식, 유형으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <Filter size={16} />
          <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
          >
            <option value="전체">난이도</option>
            {difficulties.slice(1).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[parseInt(d)].label}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="전체">상태</option>
            {statuses.slice(1).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Problem List */}
      {filteredProblems.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={48} />
          <h3>등록된 문제가 없습니다</h3>
          <p>문제를 업로드하여 시작하세요</p>
          <Link href="/tutor/workflow" className="btn-secondary">
            <Plus size={18} />
            첫 문제 업로드
          </Link>
        </div>
      ) : (
        <div className="problem-list">
          {filteredProblems.map((problem) => (
            <div key={problem.id} className="problem-card">
              <div className="problem-header">
                <div className="problem-meta">
                  {problem.type_code && (
                    <span className="type-code">{problem.type_code}</span>
                  )}
                  <span
                    className="status-badge"
                    style={{ background: STATUS_LABELS[problem.status]?.color || '#6b7280' }}
                  >
                    {STATUS_LABELS[problem.status]?.label || problem.status}
                  </span>
                  <span
                    className="difficulty-badge"
                    style={{ color: DIFFICULTY_LABELS[problem.difficulty]?.color }}
                  >
                    난이도 {problem.difficulty}
                  </span>
                </div>
                <div className="problem-actions">
                  <button className="action-btn" title="미리보기" onClick={() => alert(`문제 미리보기:\n\n${problem.content}\n\n${problem.content_latex ? `LaTeX: ${problem.content_latex}` : ''}`)}>
                    <Eye size={16} />
                  </button>
                  <button className="action-btn" title="수정" onClick={() => alert(`문제 수정 화면으로 이동합니다. (데모)\n문제 ID: ${problem.id}`)}>
                    <Edit size={16} />
                  </button>
                  <button
                    className="action-btn delete"
                    title="삭제"
                    onClick={() => handleDelete(problem.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="problem-content">
                <p className="problem-text">{problem.content}</p>
                {problem.content_latex && (
                  <div className="problem-latex">
                    <code>${problem.content_latex}$</code>
                  </div>
                )}
              </div>

              <div className="problem-footer">
                <div className="problem-info">
                  {problem.subject && <span>{problem.subject}</span>}
                  {problem.chapter && <span>{problem.chapter}</span>}
                  {problem.type_name && <span>{problem.type_name}</span>}
                </div>
                <div className="problem-date">
                  <Clock size={14} />
                  {new Date(problem.created_at).toLocaleDateString('ko-KR')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .problems-page {
          max-width: 1200px;
          margin: 0 auto;
          min-height: 100vh;
          background: #000000;
          color: #ffffff;
        }

        .loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 60vh;
          gap: 16px;
          color: #a1a1aa;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding: 24px;
          background: rgba(24, 24, 27, 0.8);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .page-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 4px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(39, 39, 42, 0.5);
          color: #a1a1aa;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .back-btn:hover {
          background: rgba(63, 63, 70, 0.8);
          color: #ffffff;
        }

        .page-header p {
          color: #a1a1aa;
          font-size: 14px;
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          font-size: 14px;
          font-weight: 600;
          border-radius: 10px;
          text-decoration: none;
          transition: all 0.2s;
        }

        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .stats-row {
          display: flex;
          gap: 24px;
          margin-bottom: 24px;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 24px;
          background: rgba(24, 24, 27, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
        }

        .stat-item svg {
          color: #a5b4fc;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #ffffff;
        }

        .stat-label {
          font-size: 13px;
          color: #a1a1aa;
        }

        .filters {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(39, 39, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          flex: 1;
          min-width: 250px;
        }

        .search-box svg {
          color: #71717a;
        }

        .search-box input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 14px;
          background: transparent;
          color: #ffffff;
        }

        .search-box input::placeholder {
          color: #71717a;
        }

        .filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-group svg {
          color: #71717a;
        }

        .filter-group select {
          padding: 10px 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 14px;
          color: #ffffff;
          background: rgba(39, 39, 42, 0.8);
          cursor: pointer;
        }

        .filter-group select option {
          background: #27272a;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 24px;
          background: rgba(24, 24, 27, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          color: #71717a;
        }

        .empty-state h3 {
          margin: 16px 0 8px;
          font-size: 18px;
          font-weight: 600;
          color: #ffffff;
        }

        .empty-state p {
          margin-bottom: 24px;
          font-size: 14px;
        }

        .btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: rgba(63, 63, 70, 0.5);
          color: #d4d4d8;
          font-size: 14px;
          font-weight: 500;
          border-radius: 10px;
          text-decoration: none;
        }

        .btn-secondary:hover {
          background: rgba(63, 63, 70, 0.8);
        }

        .problem-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .problem-card {
          background: rgba(24, 24, 27, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 20px;
        }

        .problem-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .problem-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .type-code {
          padding: 4px 10px;
          background: rgba(79, 70, 229, 0.2);
          color: #a5b4fc;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
        }

        .status-badge {
          padding: 4px 10px;
          color: white;
          font-size: 11px;
          font-weight: 600;
          border-radius: 9999px;
        }

        .difficulty-badge {
          font-size: 12px;
          font-weight: 600;
        }

        .problem-actions {
          display: flex;
          gap: 4px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          background: none;
          color: #71717a;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-btn:hover {
          background: rgba(63, 63, 70, 0.5);
          color: #a1a1aa;
        }

        .action-btn.delete:hover {
          background: rgba(220, 38, 38, 0.15);
          color: #f87171;
        }

        .problem-content {
          margin-bottom: 16px;
        }

        .problem-text {
          font-size: 15px;
          color: #ffffff;
          line-height: 1.6;
        }

        .problem-latex {
          margin-top: 8px;
          padding: 12px 16px;
          background: rgba(39, 39, 42, 0.5);
          border-radius: 8px;
        }

        .problem-latex code {
          font-size: 14px;
          color: #a5b4fc;
        }

        .problem-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .problem-info {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .problem-info span {
          font-size: 12px;
          color: #a1a1aa;
        }

        .problem-date {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #71717a;
        }

        @media (max-width: 768px) {
          .page-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }

          .stats-row {
            flex-direction: column;
          }

          .filters {
            flex-direction: column;
          }

          .filter-group {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
}
