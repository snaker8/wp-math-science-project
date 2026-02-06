'use client';

import { useState, useEffect } from 'react';
import {
  UserCog,
  Search,
  Shield,
  ShieldOff,
  Check,
  X,
  Mail,
  Phone,
  Building2,
  AlertCircle,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface Teacher {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  institute_id: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  isAcademyAdmin: boolean;
}

export default function TeachersManagementPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadTeachers();
  }, []);

  const loadTeachers = async () => {
    if (!supabaseBrowser) {
      // Mock data for demo
      setTeachers([
        {
          id: '1',
          email: 'teacher1@example.com',
          full_name: '김선생',
          phone: '010-1234-5678',
          institute_id: null,
          preferences: {},
          created_at: new Date().toISOString(),
          isAcademyAdmin: false,
        },
        {
          id: '2',
          email: 'teacher2@example.com',
          full_name: '이강사',
          phone: '010-9876-5432',
          institute_id: null,
          preferences: { isAcademyAdmin: true },
          created_at: new Date().toISOString(),
          isAcademyAdmin: true,
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabaseBrowser
        .from('users')
        .select('*')
        .eq('role', 'TEACHER')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const teachersWithAdmin = (data || []).map((teacher) => ({
        ...teacher,
        isAcademyAdmin:
          (teacher.preferences as Record<string, unknown>)?.isAcademyAdmin === true,
      }));

      setTeachers(teachersWithAdmin);
    } catch (error) {
      console.error('Error loading teachers:', error);
      setMessage({ type: 'error', text: '강사 목록을 불러오는 중 오류가 발생했습니다.' });
    } finally {
      setLoading(false);
    }
  };

  const toggleAdminPrivilege = async (teacherId: string, currentStatus: boolean) => {
    if (!supabaseBrowser) {
      // Demo mode toggle
      setTeachers((prev) =>
        prev.map((t) =>
          t.id === teacherId ? { ...t, isAcademyAdmin: !currentStatus } : t
        )
      );
      setMessage({
        type: 'success',
        text: currentStatus ? '관리자 권한이 해제되었습니다.' : '관리자 권한이 부여되었습니다.',
      });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setUpdating(teacherId);
    try {
      const teacher = teachers.find((t) => t.id === teacherId);
      if (!teacher) return;

      const newPreferences = {
        ...teacher.preferences,
        isAcademyAdmin: !currentStatus,
      };

      const { error } = await supabaseBrowser
        .from('users')
        .update({ preferences: newPreferences })
        .eq('id', teacherId);

      if (error) throw error;

      setTeachers((prev) =>
        prev.map((t) =>
          t.id === teacherId
            ? { ...t, preferences: newPreferences, isAcademyAdmin: !currentStatus }
            : t
        )
      );

      setMessage({
        type: 'success',
        text: currentStatus ? '관리자 권한이 해제되었습니다.' : '관리자 권한이 부여되었습니다.',
      });
    } catch (error) {
      console.error('Error updating privilege:', error);
      setMessage({ type: 'error', text: '권한 변경 중 오류가 발생했습니다.' });
    } finally {
      setUpdating(null);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const filteredTeachers = teachers.filter(
    (teacher) =>
      teacher.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      teacher.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const adminCount = teachers.filter((t) => t.isAcademyAdmin).length;

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>강사 목록 로딩 중...</p>

        <style jsx>{`
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
        `}</style>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="header-content">
          <h1>강사 권한 관리</h1>
          <p>선생님에게 학원 관리자 권한을 부여하거나 해제할 수 있습니다.</p>
        </div>
      </header>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon blue">
            <UserCog size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{teachers.length}</span>
            <span className="stat-label">전체 강사</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <Shield size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{adminCount}</span>
            <span className="stat-label">관리자 권한 보유</span>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`message ${message.type}`}>
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Info Banner */}
      <div className="info-banner">
        <Shield size={20} />
        <div>
          <strong>학원 관리자 권한이란?</strong>
          <p>
            관리자 권한을 부여받은 선생님은 관리자 콘솔(/admin)에 접근하여 학원 전체를 관리할 수
            있습니다. 학원 설정, 사용자 관리, 문제 관리, 통계 등의 기능을 사용할 수 있습니다.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="search-bar">
        <Search size={18} />
        <input
          type="text"
          placeholder="이름 또는 이메일로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Teachers List */}
      <div className="teachers-list">
        {filteredTeachers.length === 0 ? (
          <div className="empty-state">
            <UserCog size={48} />
            <h3>등록된 강사가 없습니다</h3>
            <p>아직 등록된 강사가 없거나 검색 결과가 없습니다.</p>
          </div>
        ) : (
          filteredTeachers.map((teacher) => (
            <div key={teacher.id} className={`teacher-card ${teacher.isAcademyAdmin ? 'admin' : ''}`}>
              <div className="teacher-info">
                <div className="teacher-avatar">
                  {teacher.full_name.charAt(0)}
                </div>
                <div className="teacher-details">
                  <div className="teacher-name">
                    {teacher.full_name}
                    {teacher.isAcademyAdmin && (
                      <span className="admin-badge">
                        <Shield size={12} />
                        관리자
                      </span>
                    )}
                  </div>
                  <div className="teacher-meta">
                    <span>
                      <Mail size={14} />
                      {teacher.email}
                    </span>
                    {teacher.phone && (
                      <span>
                        <Phone size={14} />
                        {teacher.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="teacher-actions">
                <button
                  className={`toggle-btn ${teacher.isAcademyAdmin ? 'revoke' : 'grant'}`}
                  onClick={() => toggleAdminPrivilege(teacher.id, teacher.isAcademyAdmin)}
                  disabled={updating === teacher.id}
                >
                  {updating === teacher.id ? (
                    <span className="btn-spinner" />
                  ) : teacher.isAcademyAdmin ? (
                    <>
                      <ShieldOff size={16} />
                      권한 해제
                    </>
                  ) : (
                    <>
                      <Shield size={16} />
                      권한 부여
                    </>
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .page {
          max-width: 1000px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 24px;
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

        .stats-row {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
        }

        .stat-card {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
        }

        .stat-icon {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
        }

        .stat-icon.blue {
          background: #eef2ff;
          color: #4f46e5;
        }

        .stat-icon.green {
          background: #ecfdf5;
          color: #059669;
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

        .message {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .message.success {
          background: #ecfdf5;
          color: #059669;
          border: 1px solid #a7f3d0;
        }

        .message.error {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }

        .info-banner {
          display: flex;
          gap: 16px;
          padding: 20px;
          background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
          border-radius: 12px;
          margin-bottom: 24px;
          color: #4f46e5;
        }

        .info-banner strong {
          display: block;
          margin-bottom: 4px;
          color: #1e1b4b;
        }

        .info-banner p {
          font-size: 14px;
          color: #4b5563;
          margin: 0;
        }

        .search-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          margin-bottom: 20px;
        }

        .search-bar :global(svg) {
          color: #9ca3af;
        }

        .search-bar input {
          flex: 1;
          border: none;
          font-size: 14px;
          outline: none;
        }

        .teachers-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          text-align: center;
          color: #9ca3af;
        }

        .empty-state h3 {
          margin: 16px 0 8px;
          color: #374151;
          font-size: 16px;
        }

        .empty-state p {
          font-size: 14px;
        }

        .teacher-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          transition: all 0.2s;
        }

        .teacher-card:hover {
          border-color: #c7d2fe;
        }

        .teacher-card.admin {
          border-color: #a7f3d0;
          background: linear-gradient(135deg, white 0%, #ecfdf5 100%);
        }

        .teacher-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .teacher-avatar {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          font-size: 18px;
          font-weight: 600;
          border-radius: 12px;
        }

        .teacher-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .teacher-name {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 600;
          color: #1f2937;
        }

        .admin-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          background: #059669;
          color: white;
          font-size: 11px;
          font-weight: 500;
          border-radius: 9999px;
        }

        .teacher-meta {
          display: flex;
          gap: 16px;
          font-size: 13px;
          color: #6b7280;
        }

        .teacher-meta span {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .toggle-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle-btn.grant {
          background: #4f46e5;
          color: white;
        }

        .toggle-btn.grant:hover {
          background: #4338ca;
        }

        .toggle-btn.revoke {
          background: #fee2e2;
          color: #dc2626;
        }

        .toggle-btn.revoke:hover {
          background: #fecaca;
        }

        .toggle-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 640px) {
          .stats-row {
            flex-direction: column;
          }

          .teacher-card {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }

          .teacher-actions {
            width: 100%;
          }

          .toggle-btn {
            width: 100%;
            justify-content: center;
          }

          .teacher-meta {
            flex-direction: column;
            gap: 4px;
          }
        }
      `}</style>
    </div>
  );
}
