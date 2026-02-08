'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ClipboardList,
  Bell,
  BarChart3,
  ArrowRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface DashboardStats {
  enrolledClasses: number;
  pendingInvitations: number;
  completedExams: number;
  upcomingExams: number;
}

interface ClassItem {
  id: string;
  name: string;
  subject: string | null;
  tutorName: string;
}

interface InvitationItem {
  id: string;
  className: string;
  tutorName: string;
  invitedAt: string;
}

export default function StudentDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    enrolledClasses: 0,
    pendingInvitations: 0,
    completedExams: 0,
    upcomingExams: 0,
  });
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
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

      // 등록된 반 목록
      const { data: enrollments } = await supabaseBrowser
        .from('class_enrollments')
        .select(`
          class:classes(
            id,
            name,
            subject,
            tutor:users!tutor_id(full_name)
          )
        `)
        .eq('student_id', user.id)
        .eq('status', 'ACCEPTED');

      
      const enrolledClasses = (enrollments || [])
        .filter((e: any) => e.class)
        .map((e: any) => ({
          id: e.class.id,
          name: e.class.name,
          subject: e.class.subject,
          tutorName: e.class.tutor?.full_name || '강사',
        }));

      setClasses(enrolledClasses);

      // 대기 중인 초대
      const { data: pendingInvites } = await supabaseBrowser
        .from('class_enrollments')
        .select(`
          id,
          invited_at,
          class:classes(
            name,
            tutor:users!tutor_id(full_name)
          )
        `)
        .eq('student_id', user.id)
        .eq('status', 'PENDING');

      
      const invitationsList = (pendingInvites || [])
        .filter((i: any) => i.class)
        .map((i: any) => ({
          id: i.id,
          className: i.class.name,
          tutorName: i.class.tutor?.full_name || '강사',
          invitedAt: i.invited_at,
        }));

      setInvitations(invitationsList);

      // 완료된 시험 수
      const { count: completedExams } = await supabaseBrowser
        .from('exam_records')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .eq('is_completed', true);

      // 예정된 시험 (현재 시점 이후의 시험)
      // 간단하게 published 상태의 시험 중 아직 완료하지 않은 것
      // 실제로는 더 복잡한 로직이 필요할 수 있음

      setStats({
        enrolledClasses: enrolledClasses.length,
        pendingInvitations: invitationsList.length,
        completedExams: completedExams || 0,
        upcomingExams: 0,
      });
    } catch (error) {
      console.error('Dashboard data load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async (enrollmentId: string) => {
    if (!supabaseBrowser) return;

    try {
      await supabaseBrowser
        .from('class_enrollments')
        .update({
          status: 'ACCEPTED',
          enrolled_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
        })
        .eq('id', enrollmentId);

      // 새로고침
      loadDashboardData();
    } catch (error) {
      console.error('Accept invitation error:', error);
      alert('초대 수락 중 오류가 발생했습니다');
    }
  };

  const handleRejectInvitation = async (enrollmentId: string) => {
    if (!confirm('정말 이 초대를 거절하시겠습니까?')) return;

    if (!supabaseBrowser) return;

    try {
      await supabaseBrowser
        .from('class_enrollments')
        .update({
          status: 'REJECTED',
          responded_at: new Date().toISOString(),
        })
        .eq('id', enrollmentId);

      // 새로고침
      loadDashboardData();
    } catch (error) {
      console.error('Reject invitation error:', error);
      alert('초대 거절 중 오류가 발생했습니다');
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
        <h1>학생 대시보드</h1>
        <p>학습 현황을 확인하세요</p>
      </header>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon green">
            <BookOpen size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.enrolledClasses}</span>
            <span className="stat-label">등록된 반</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            <Bell size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.pendingInvitations}</span>
            <span className="stat-label">대기 중인 초대</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">
            <CheckCircle2 size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.completedExams}</span>
            <span className="stat-label">완료한 시험</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <Clock size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.upcomingExams}</span>
            <span className="stat-label">예정된 시험</span>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="content-grid">
        {/* Invitations */}
        {invitations.length > 0 && (
          <section className="card invitations">
            <div className="card-header">
              <h2>
                <Bell size={18} />
                대기 중인 초대
              </h2>
            </div>
            <div className="invitation-list">
              {invitations.map((inv) => (
                <div key={inv.id} className="invitation-item">
                  <div className="invitation-info">
                    <span className="class-name">{inv.className}</span>
                    <span className="tutor-name">{inv.tutorName} 강사</span>
                  </div>
                  <div className="invitation-actions">
                    <button
                      className="accept-btn"
                      onClick={() => handleAcceptInvitation(inv.id)}
                    >
                      수락
                    </button>
                    <button
                      className="reject-btn"
                      onClick={() => handleRejectInvitation(inv.id)}
                    >
                      거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* My Classes */}
        <section className="card">
          <div className="card-header">
            <h2>내 반</h2>
            <Link href="/student/classes" className="view-all">
              전체보기 <ArrowRight size={16} />
            </Link>
          </div>

          {classes.length === 0 ? (
            <div className="empty-state">
              <BookOpen size={48} />
              <p>아직 등록된 반이 없습니다</p>
              <span>강사의 초대를 기다리세요</span>
            </div>
          ) : (
            <div className="class-list">
              {classes.slice(0, 5).map((cls) => (
                <Link
                  key={cls.id}
                  href={`/student/classes/${cls.id}`}
                  className="class-item"
                >
                  <div className="class-info">
                    <span className="class-name">{cls.name}</span>
                    <span className="class-meta">
                      {cls.subject && `${cls.subject} · `}{cls.tutorName} 강사
                    </span>
                  </div>
                  <ArrowRight size={18} className="arrow" />
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
            <Link href="/student/exams" className="action-item">
              <div className="action-icon blue">
                <ClipboardList size={20} />
              </div>
              <span>시험 보기</span>
            </Link>

            <Link href="/student/analytics" className="action-item">
              <div className="action-icon purple">
                <BarChart3 size={20} />
              </div>
              <span>학습 분석 보기</span>
            </Link>

            <Link href="/student/invitations" className="action-item">
              <div className="action-icon orange">
                <Bell size={20} />
              </div>
              <span>초대 확인하기</span>
            </Link>
          </div>
        </section>
      </div>

      <style jsx>{`
        .dashboard {
          max-width: 1200px;
          margin: 0 auto;
        }

        .loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 60vh;
          gap: 16px;
          color: #6b7280;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #e5e7eb;
          border-top-color: #059669;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .page-header {
          margin-bottom: 32px;
        }

        .page-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 4px;
        }

        .page-header p {
          color: #6b7280;
          font-size: 14px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          border: 1px solid #e5e7eb;
        }

        .stat-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
        }

        .stat-icon.green {
          background: #ecfdf5;
          color: #059669;
        }

        .stat-icon.orange {
          background: #fff7ed;
          color: #ea580c;
        }

        .stat-icon.blue {
          background: #eef2ff;
          color: #4f46e5;
        }

        .stat-icon.purple {
          background: #f5f3ff;
          color: #7c3aed;
        }

        .stat-info {
          display: flex;
          flex-direction: column;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #1f2937;
        }

        .stat-label {
          font-size: 13px;
          color: #6b7280;
        }

        .content-grid {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .card {
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }

        .card.invitations {
          border-color: #fed7aa;
          background: #fffbeb;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .card.invitations .card-header {
          border-bottom-color: #fed7aa;
        }

        .card-header h2 {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 600;
          color: #1f2937;
        }

        .view-all {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #059669;
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
        }

        .invitation-list {
          padding: 12px;
        }

        .invitation-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: white;
          border-radius: 8px;
          margin-bottom: 8px;
        }

        .invitation-item:last-child {
          margin-bottom: 0;
        }

        .invitation-info {
          display: flex;
          flex-direction: column;
        }

        .invitation-info .class-name {
          font-weight: 600;
          color: #1f2937;
        }

        .invitation-info .tutor-name {
          font-size: 13px;
          color: #6b7280;
        }

        .invitation-actions {
          display: flex;
          gap: 8px;
        }

        .accept-btn {
          padding: 8px 16px;
          background: #059669;
          color: white;
          font-size: 13px;
          font-weight: 500;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }

        .accept-btn:hover {
          background: #047857;
        }

        .reject-btn {
          padding: 8px 16px;
          background: white;
          color: #6b7280;
          font-size: 13px;
          font-weight: 500;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          cursor: pointer;
        }

        .reject-btn:hover {
          background: #f3f4f6;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          color: #9ca3af;
        }

        .empty-state p {
          margin: 16px 0 4px;
          font-size: 14px;
          color: #6b7280;
        }

        .empty-state span {
          font-size: 13px;
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
          background: #f9fafb;
        }

        .class-info {
          display: flex;
          flex-direction: column;
        }

        .class-info .class-name {
          font-size: 15px;
          font-weight: 600;
          color: #1f2937;
        }

        .class-info .class-meta {
          font-size: 13px;
          color: #6b7280;
          margin-top: 2px;
        }

        .class-item :global(.arrow) {
          color: #9ca3af;
        }

        .quick-actions {
          padding: 16px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .action-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px 16px;
          border-radius: 8px;
          text-decoration: none;
          color: #374151;
          font-size: 13px;
          font-weight: 500;
          transition: background 0.2s;
          border: 1px solid #e5e7eb;
        }

        .action-item:hover {
          background: #f9fafb;
        }

        .action-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
        }

        .action-icon.blue {
          background: #eef2ff;
          color: #4f46e5;
        }

        .action-icon.purple {
          background: #f5f3ff;
          color: #7c3aed;
        }

        .action-icon.orange {
          background: #fff7ed;
          color: #ea580c;
        }

        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .quick-actions {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }

          .invitation-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .invitation-actions {
            width: 100%;
          }

          .invitation-actions button {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}
