'use client';

import { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  BookOpen,
  ClipboardList,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface DashboardStats {
  totalInstitutes: number;
  totalUsers: number;
  totalProblems: number;
  totalExams: number;
  recentUsers: number;
  recentProblems: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalInstitutes: 0,
    totalUsers: 0,
    totalProblems: 0,
    totalExams: 0,
    recentUsers: 0,
    recentProblems: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    if (!supabaseBrowser) {
      setLoading(false);
      return;
    }

    try {
      // 총 학원 수
      const { count: totalInstitutes } = await supabaseBrowser
        .from('institutes')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      // 총 사용자 수
      const { count: totalUsers } = await supabaseBrowser
        .from('users')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      // 총 문제 수
      const { count: totalProblems } = await supabaseBrowser
        .from('problems')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      // 총 시험 수
      const { count: totalExams } = await supabaseBrowser
        .from('exams')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      // 최근 7일 신규 사용자
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count: recentUsers } = await supabaseBrowser
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString());

      // 최근 7일 신규 문제
      const { count: recentProblems } = await supabaseBrowser
        .from('problems')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString());

      setStats({
        totalInstitutes: totalInstitutes || 0,
        totalUsers: totalUsers || 0,
        totalProblems: totalProblems || 0,
        totalExams: totalExams || 0,
        recentUsers: recentUsers || 0,
        recentProblems: recentProblems || 0,
      });
    } catch (error) {
      console.error('Stats load error:', error);
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
        <h1>관리자 대시보드</h1>
        <p>플랫폼 전체 현황을 확인하세요</p>
      </header>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon red">
            <Building2 size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.totalInstitutes}</span>
            <span className="stat-label">등록된 학원</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">
            <Users size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.totalUsers}</span>
            <span className="stat-label">전체 사용자</span>
          </div>
          <div className={`stat-trend ${stats.recentUsers > 0 ? 'up' : ''}`}>
            {stats.recentUsers > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>+{stats.recentUsers} 이번 주</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <BookOpen size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.totalProblems}</span>
            <span className="stat-label">등록된 문제</span>
          </div>
          <div className={`stat-trend ${stats.recentProblems > 0 ? 'up' : ''}`}>
            {stats.recentProblems > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>+{stats.recentProblems} 이번 주</span>
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

      <div className="info-banner">
        <p>관리자 콘솔에서 학원, 사용자, 문제를 관리할 수 있습니다.</p>
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
          border-top-color: #4f46e5;
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
          position: relative;
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

        .stat-icon.red {
          background: #fef2f2;
          color: #dc2626;
        }

        .stat-icon.blue {
          background: #eef2ff;
          color: #4f46e5;
        }

        .stat-icon.purple {
          background: #f5f3ff;
          color: #7c3aed;
        }

        .stat-icon.orange {
          background: #fff7ed;
          color: #ea580c;
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

        .stat-trend {
          position: absolute;
          top: 12px;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: #f3f4f6;
          border-radius: 9999px;
          font-size: 11px;
          color: #6b7280;
        }

        .stat-trend.up {
          background: #ecfdf5;
          color: #059669;
        }

        .info-banner {
          background: #f8fafc;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px;
          text-align: center;
        }

        .info-banner p {
          color: #6b7280;
          font-size: 14px;
        }

        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 640px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
