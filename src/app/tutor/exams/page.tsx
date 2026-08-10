'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Filter,
  Calendar,
  Clock,
  Users,
  FileText,
  Play,
  Pause,
  CheckCircle,
  MoreVertical,
  Copy,
  Trash2,
  Eye,
  Edit,
  BarChart3,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface Exam {
  id: string;
  title: string;
  description: string | null;
  problemCount: number | null; // null = 집계 미구현 (거짓 0 대신 '—' 표시)
  duration: number; // minutes
  // 실제 DB CHECK 제약: DRAFT | COMPLETED | PUBLISHED (SCHEDULED/ACTIVE 는 존재하지 않던 상상 스키마)
  status: 'DRAFT' | 'COMPLETED' | 'PUBLISHED';
  publishedAt: string | null;
  createdAt: string;
  className: string | null;
  studentCount: number | null; // null = 집계 미구현
  submissionCount: number | null; // null = 집계 미구현
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  DRAFT: { label: '임시저장', color: '#6b7280', bg: '#f3f4f6', icon: Clock },
  COMPLETED: { label: '완성', color: '#3b82f6', bg: '#dbeafe', icon: CheckCircle },
  PUBLISHED: { label: '출제됨', color: '#22c55e', bg: '#dcfce7', icon: Play },
};

export default function TutorExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('전체');

  useEffect(() => {
    loadExams();
  }, []);

  const loadExams = async () => {
    setLoading(true);
    setError(null);
    if (!supabaseBrowser) {
      // Mock data
      setExams([
        {
          id: '1',
          title: '중간고사 대비 모의고사',
          description: '수학I 1~3단원 범위',
          problemCount: 25,
          duration: 60,
          status: 'COMPLETED',
          publishedAt: null,
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          className: 'A반',
          studentCount: 15,
          submissionCount: 15,
        },
        {
          id: '2',
          title: '주간 테스트 #5',
          description: '이차방정식 심화',
          problemCount: 10,
          duration: 30,
          status: 'PUBLISHED',
          publishedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          className: 'A반',
          studentCount: 15,
          submissionCount: 8,
        },
        {
          id: '3',
          title: '기말고사 대비',
          description: '전 범위 종합',
          problemCount: 30,
          duration: 90,
          status: 'COMPLETED',
          publishedAt: null,
          createdAt: new Date().toISOString(),
          className: 'B반',
          studentCount: 12,
          submissionCount: 0,
        },
        {
          id: '4',
          title: '복습 테스트',
          description: null,
          problemCount: 5,
          duration: 15,
          status: 'DRAFT',
          publishedAt: null,
          createdAt: new Date().toISOString(),
          className: null,
          studentCount: 0,
          submissionCount: 0,
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) return;

      // 실DB(클라우드) 실존 컬럼만 select — duration_minutes/scheduled_at/problem_count 는
      // 존재하지 않는 컬럼이라 42703 으로 이 화면이 한 번도 뜬 적이 없었음 (빈 상태로 위장돼 있었음)
      const { data, error } = await supabaseBrowser
        .from('exams')
        .select(`
          id,
          title,
          description,
          time_limit_minutes,
          status,
          created_at
        `)
        .eq('created_by', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 문제 수는 exam_problems 에서 실집계 — 실패하면 null(— 표시)로 폴백
      const examIds = (data || []).map((e: any) => e.id);
      const countByExam = new Map<string, number>();
      if (examIds.length > 0) {
        const { data: epRows, error: epError } = await supabaseBrowser
          .from('exam_problems')
          .select('exam_id')
          .in('exam_id', examIds);
        if (!epError && epRows) {
          for (const row of epRows as { exam_id: string }[]) {
            countByExam.set(row.exam_id, (countByExam.get(row.exam_id) ?? 0) + 1);
          }
        }
      }

      const examList: Exam[] = (data || []).map((e: any) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        problemCount: countByExam.has(e.id) ? countByExam.get(e.id)! : null,
        duration: e.time_limit_minutes || 60,
        status: e.status,
        publishedAt: null, // 실DB 에 출제 시각 컬럼 없음
        createdAt: e.created_at,
        className: null,
        // 반/응시 집계 쿼리 미구현 — 거짓 0 대신 null 로 두고 UI 에서 렌더 생략
        studentCount: null,
        submissionCount: null,
      }));

      setExams(examList);
    } catch (error) {
      console.error('Failed to load exams:', JSON.stringify(error));
      // 실제 원인(권한/컬럼 등)을 숨기지 않고 표시
      const detail =
        (error as { message?: string })?.message || '네트워크 상태를 확인한 뒤 다시 시도해주세요.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const filteredExams = exams.filter((exam) => {
    const matchesSearch =
      exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exam.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesStatus = filterStatus === '전체' || exam.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (id: string) => {
    if (!confirm('이 시험을 삭제하시겠습니까?')) return;

    if (supabaseBrowser) {
      // 삭제 실패를 성공처럼 위장하지 않기 — error 확인 후에만 목록에서 제거
      const { error: deleteError } = await supabaseBrowser
        .from('exams')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (deleteError) {
        console.error('Failed to delete exam:', deleteError);
        alert('삭제에 실패했습니다. 다시 시도해주세요.');
        return;
      }
    }

    setExams((prev) => prev.filter((e) => e.id !== id));
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>시험 목록 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="exams-page">
      <header className="page-header">
        <div>
          <h1>시험 관리</h1>
          <p>시험을 생성하고 학생들의 응시 현황을 확인하세요</p>
        </div>
        <Link href="/tutor/exams/new" className="btn-primary">
          <Plus size={18} />
          시험 만들기
        </Link>
      </header>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-item">
          <FileText size={20} />
          <span className="stat-value">{exams.length}</span>
          <span className="stat-label">전체 시험</span>
        </div>
        <div className="stat-item active">
          <Play size={20} />
          <span className="stat-value">
            {exams.filter((e) => e.status === 'PUBLISHED').length}
          </span>
          <span className="stat-label">출제됨</span>
        </div>
        <div className="stat-item scheduled">
          <Calendar size={20} />
          <span className="stat-value">
            {exams.filter((e) => e.status === 'DRAFT').length}
          </span>
          <span className="stat-label">임시저장</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="시험 제목으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <Filter size={16} />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="전체">전체 상태</option>
            <option value="DRAFT">임시저장</option>
            <option value="COMPLETED">완성</option>
            <option value="PUBLISHED">출제됨</option>
          </select>
        </div>
      </div>

      {/* Exam List */}
      {error ? (
        <div className="error-state">
          <AlertTriangle size={40} />
          <h3>시험 목록을 불러오지 못했습니다</h3>
          <p>{error}</p>
          <button className="retry-btn" onClick={loadExams}>
            <RefreshCw size={16} />
            다시 시도
          </button>
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <h3>생성된 시험이 없습니다</h3>
          <p>새 시험을 만들어 학생들에게 배포하세요</p>
          <Link href="/tutor/exams/new" className="btn-secondary">
            <Plus size={18} />
            첫 시험 만들기
          </Link>
        </div>
      ) : (
        <div className="exam-list">
          {filteredExams.map((exam) => {
            const statusConfig = STATUS_CONFIG[exam.status] ?? STATUS_CONFIG.DRAFT;
            const StatusIcon = statusConfig.icon;

            return (
              <div key={exam.id} className="exam-card">
                <div className="exam-header">
                  <div className="exam-title-row">
                    <h3>{exam.title}</h3>
                    <span
                      className="status-badge"
                      style={{ color: statusConfig.color, background: statusConfig.bg }}
                    >
                      <StatusIcon size={14} />
                      {statusConfig.label}
                    </span>
                  </div>
                  {exam.description && <p className="exam-desc">{exam.description}</p>}
                </div>

                <div className="exam-meta">
                  <div className="meta-item">
                    <FileText size={16} />
                    {/* 집계 미구현(null) 이면 거짓 0 대신 '—' */}
                    <span>{exam.problemCount != null ? `${exam.problemCount}문제` : '문제 수 —'}</span>
                  </div>
                  <div className="meta-item">
                    <Clock size={16} />
                    <span>{exam.duration}분</span>
                  </div>
                  {exam.className && (
                    <div className="meta-item">
                      <Users size={16} />
                      <span>{exam.className}</span>
                    </div>
                  )}
                  {exam.publishedAt && (
                    <div className="meta-item">
                      <Calendar size={16} />
                      <span>
                        {new Date(exam.publishedAt).toLocaleDateString('ko-KR', {
                          month: 'long',
                          day: 'numeric',
                        })}{' '}
                        출제
                      </span>
                    </div>
                  )}
                </div>

                {/* 응시 현황 — 집계 미구현(null) 이면 가짜 0%/0명 진행률 바를 렌더하지 않음 */}
                {exam.status !== 'DRAFT' && exam.studentCount != null && exam.submissionCount != null && (
                  <div className="exam-progress">
                    <div className="progress-info">
                      <span>응시 현황</span>
                      <span>
                        {exam.submissionCount}/{exam.studentCount}명
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${exam.studentCount > 0 ? (exam.submissionCount / exam.studentCount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="exam-actions">
                  <Link href={`/tutor/exams/${exam.id}`} className="action-btn">
                    <Eye size={16} />
                    상세보기
                  </Link>
                  {exam.status === 'COMPLETED' && (
                    <Link href={`/tutor/analytics?exam=${exam.id}`} className="action-btn primary">
                      <BarChart3 size={16} />
                      결과 분석
                    </Link>
                  )}
                  {exam.status === 'DRAFT' && (
                    <Link href={`/tutor/exams/${exam.id}/edit`} className="action-btn">
                      <Edit size={16} />
                      수정
                    </Link>
                  )}
                  <button className="action-btn" onClick={() => handleDelete(exam.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .exams-page {
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
          to { transform: rotate(360deg); }
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

        .stat-item.active svg {
          color: #34d399;
        }

        .stat-item.scheduled svg {
          color: #60a5fa;
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

        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          background: rgba(127, 29, 29, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.35);
          border-radius: 16px;
          color: #fca5a5;
        }

        .error-state h3 {
          margin: 12px 0 4px;
          font-size: 18px;
          font-weight: 600;
          color: #ffffff;
        }

        .error-state p {
          margin-bottom: 20px;
          font-size: 14px;
          color: #a1a1aa;
        }

        .retry-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
          font-size: 14px;
          font-weight: 500;
          border: 1px solid rgba(239, 68, 68, 0.35);
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .retry-btn:hover {
          background: rgba(239, 68, 68, 0.25);
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

        .exam-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .exam-card {
          background: rgba(24, 24, 27, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 20px;
        }

        .exam-header {
          margin-bottom: 16px;
        }

        .exam-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 4px;
        }

        .exam-title-row h3 {
          font-size: 18px;
          font-weight: 600;
          color: #ffffff;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 9999px;
        }

        .exam-desc {
          font-size: 14px;
          color: #a1a1aa;
        }

        .exam-meta {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #a1a1aa;
        }

        .meta-item svg {
          color: #71717a;
        }

        .exam-progress {
          margin-bottom: 16px;
          padding: 12px 16px;
          background: rgba(39, 39, 42, 0.5);
          border-radius: 8px;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 13px;
          color: #a1a1aa;
        }

        .progress-bar {
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #4f46e5, #6366f1);
          border-radius: 3px;
          transition: width 0.3s;
        }

        .exam-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: rgba(63, 63, 70, 0.5);
          color: #d4d4d8;
          font-size: 13px;
          font-weight: 500;
          border: none;
          border-radius: 8px;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.2s;
        }

        .action-btn:hover {
          background: rgba(63, 63, 70, 0.8);
        }

        .action-btn.primary {
          background: rgba(79, 70, 229, 0.15);
          color: #a5b4fc;
        }

        .action-btn.primary:hover {
          background: rgba(79, 70, 229, 0.25);
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

          .exam-meta {
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
}
