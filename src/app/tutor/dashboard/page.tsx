'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  BookOpen,
  ClipboardList,
  TrendingUp,
  Plus,
  ArrowRight,
  UserPlus,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface DashboardStats {
  totalClasses: number;
  totalStudents: number;
  totalProblems: number;
  totalExams: number;
  pendingInvitations: number;
}

interface RecentClass {
  id: string;
  name: string;
  subject: string | null;
  enrolledCount: number;
  maxStudents: number;
}

export default function TutorDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalClasses: 0,
    totalStudents: 0,
    totalProblems: 0,
    totalExams: 0,
    pendingInvitations: 0,
  });
  const [recentClasses, setRecentClasses] = useState<RecentClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    if (!supabaseBrowser) {
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) return;

      // 반 목록 조회
      const { data: classes } = await supabaseBrowser
        .from('classes')
        .select('id, name, subject, max_students')
        .eq('tutor_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5);

      // 등록된 학생 수 계산 (클래스별)
      const classesWithCount: RecentClass[] = [];
      for (const cls of classes || []) {
        const { count } = await supabaseBrowser
          .from('class_enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('class_id', cls.id)
          .eq('status', 'ACCEPTED');

        classesWithCount.push({
          id: cls.id,
          name: cls.name,
          subject: cls.subject,
          enrolledCount: count || 0,
          maxStudents: cls.max_students,
        });
      }

      setRecentClasses(classesWithCount);

      // 전체 통계
      const { count: totalClasses } = await supabaseBrowser
        .from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('tutor_id', user.id)
        .is('deleted_at', null);

      // 전체 학생 수 (모든 반의 등록된 학생)
      const { data: allClassIds } = await supabaseBrowser
        .from('classes')
        .select('id')
        .eq('tutor_id', user.id)
        .is('deleted_at', null);

      let totalStudents = 0;
      let pendingInvitations = 0;
      if (allClassIds) {
        for (const cls of allClassIds) {
          const { count: enrolledCount } = await supabaseBrowser
            .from('class_enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('class_id', cls.id)
            .eq('status', 'ACCEPTED');

          const { count: pendingCount } = await supabaseBrowser
            .from('class_enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('class_id', cls.id)
            .eq('status', 'PENDING');

          totalStudents += enrolledCount || 0;
          pendingInvitations += pendingCount || 0;
        }
      }

      // 문제 수
      const { count: totalProblems } = await supabaseBrowser
        .from('problems')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .is('deleted_at', null);

      // 시험 수
      const { count: totalExams } = await supabaseBrowser
        .from('exams')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .is('deleted_at', null);

      setStats({
        totalClasses: totalClasses || 0,
        totalStudents,
        totalProblems: totalProblems || 0,
        totalExams: totalExams || 0,
        pendingInvitations,
      });
    } catch (error) {
      console.error('Dashboard data load error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>대시보드 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="page-header">
        <div>
          <h1>강사 대시보드</h1>
          <p>반과 학생들을 관리하세요</p>
        </div>
        <Link href="/tutor/classes/new" className="btn-primary">
          <Plus size={18} />
          새 반 만들기
        </Link>
      </header>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <Users size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.totalClasses}</span>
            <span className="stat-label">관리 중인 반</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <Users size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.totalStudents}</span>
            <span className="stat-label">등록된 학생</span>
          </div>
          {stats.pendingInvitations > 0 && (
            <span className="stat-badge">{stats.pendingInvitations} 대기중</span>
          )}
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <BookOpen size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.totalProblems}</span>
            <span className="stat-label">등록된 문제</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            <ClipboardList size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.totalExams}</span>
            <span className="stat-label">생성된 시험</span>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="content-grid">
        {/* Recent Classes */}
        <section className="card">
          <div className="card-header">
            <h2>내 반 목록</h2>
            <Link href="/tutor/classes" className="view-all">
              전체보기 <ArrowRight size={16} />
            </Link>
          </div>

          {recentClasses.length === 0 ? (
            <div className="empty-state">
              <Users size={48} />
              <p>아직 생성된 반이 없습니다</p>
              <Link href="/tutor/classes/new" className="btn-secondary">
                첫 반 만들기
              </Link>
            </div>
          ) : (
            <div className="class-list">
              {recentClasses.map((cls) => (
                <Link
                  key={cls.id}
                  href={`/tutor/classes/${cls.id}`}
                  className="class-item"
                >
                  <div className="class-info">
                    <span className="class-name">{cls.name}</span>
                    <span className="class-subject">{cls.subject || '과목 미지정'}</span>
                  </div>
                  <div className="class-stats">
                    <span className="student-count">
                      <Users size={14} />
                      {cls.enrolledCount}/{cls.maxStudents}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Quick Actions */}
        <section className="card">
          <div className="card-header">
            <h2>빠른 작업</h2>
          </div>

          <div className="quick-actions">
            <Link href="/tutor/workflow" className="action-item">
              <div className="action-icon blue">
                <Plus size={20} />
              </div>
              <span>문제 업로드</span>
            </Link>

            <Link href="/tutor/students" className="action-item">
              <div className="action-icon green">
                <UserPlus size={20} />
              </div>
              <span>학생 관리</span>
            </Link>

            <Link href="/tutor/exams" className="action-item">
              <div className="action-icon purple">
                <ClipboardList size={20} />
              </div>
              <span>시험 관리</span>
            </Link>

            <Link href="/tutor/analytics" className="action-item">
              <div className="action-icon orange">
                <TrendingUp size={20} />
              </div>
              <span>성적 분석</span>
            </Link>
          </div>
        </section>
      </div>

      <style jsx>{`
        .dashboard {
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
          margin-bottom: 32px;
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

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }

        .stat-card {
          position: relative;
          background: rgba(24, 24, 27, 0.6);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .stat-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
        }

        .stat-icon.blue {
          background: rgba(79, 70, 229, 0.15);
          color: #a5b4fc;
        }

        .stat-icon.green {
          background: rgba(5, 150, 105, 0.15);
          color: #34d399;
        }

        .stat-icon.purple {
          background: rgba(124, 58, 237, 0.15);
          color: #c4b5fd;
        }

        .stat-icon.orange {
          background: rgba(234, 88, 12, 0.15);
          color: #fb923c;
        }

        .stat-info {
          display: flex;
          flex-direction: column;
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

        .stat-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          padding: 4px 8px;
          background: rgba(217, 119, 6, 0.2);
          color: #fbbf24;
          font-size: 11px;
          font-weight: 600;
          border-radius: 9999px;
        }

        .content-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 24px;
        }

        .card {
          background: rgba(24, 24, 27, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .card-header h2 {
          font-size: 16px;
          font-weight: 600;
          color: #ffffff;
        }

        .view-all {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #a5b4fc;
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
        }

        .view-all:hover {
          text-decoration: underline;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          color: #71717a;
        }

        .empty-state p {
          margin: 16px 0;
          font-size: 14px;
        }

        .btn-secondary {
          padding: 10px 16px;
          background: rgba(63, 63, 70, 0.5);
          color: #d4d4d8;
          font-size: 14px;
          font-weight: 500;
          border-radius: 8px;
          text-decoration: none;
          transition: background 0.2s;
        }

        .btn-secondary:hover {
          background: rgba(63, 63, 70, 0.8);
        }

        .class-list {
          padding: 8px;
        }

        .class-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-radius: 8px;
          text-decoration: none;
          transition: background 0.2s;
        }

        .class-item:hover {
          background: rgba(63, 63, 70, 0.3);
        }

        .class-info {
          display: flex;
          flex-direction: column;
        }

        .class-name {
          font-size: 15px;
          font-weight: 600;
          color: #ffffff;
        }

        .class-subject {
          font-size: 13px;
          color: #a1a1aa;
          margin-top: 2px;
        }

        .class-stats {
          display: flex;
          align-items: center;
        }

        .student-count {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 13px;
          color: #a1a1aa;
        }

        .quick-actions {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .action-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 8px;
          text-decoration: none;
          color: #d4d4d8;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s;
        }

        .action-item:hover {
          background: rgba(63, 63, 70, 0.3);
        }

        .action-icon {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
        }

        .action-icon.blue {
          background: rgba(79, 70, 229, 0.15);
          color: #a5b4fc;
        }

        .action-icon.green {
          background: rgba(5, 150, 105, 0.15);
          color: #34d399;
        }

        .action-icon.purple {
          background: rgba(124, 58, 237, 0.15);
          color: #c4b5fd;
        }

        .action-icon.orange {
          background: rgba(234, 88, 12, 0.15);
          color: #fb923c;
        }

        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .content-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .page-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
