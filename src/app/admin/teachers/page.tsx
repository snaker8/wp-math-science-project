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
  Trash2,
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
  /** 'TEACHER' 또는 'ORG_ADMIN' (비본부) — 정책 (2026-05-17) */
  role: string;
}

export default function TeachersManagementPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // ★ 보관(소프트 삭제) 확인창 — 영향 범위를 먼저 보여주고 나서 진행한다.
  const [archiveTarget, setArchiveTarget] = useState<
    { teacher: Teacher; impact: { classes: number; exams: number; problems: number } | null } | null
  >(null);
  const [archiving, setArchiving] = useState(false);

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
          role: 'TEACHER',
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
          role: 'TEACHER',
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      // ★ 정책 (2026-05-17): TEACHER + ORG_ADMIN(비본부) 모두 강사로 표시
      //   본부 institute 소속 ORG_ADMIN 은 학원 운영자라 제외.
      //   1) organizations.headquarter_institute_id 목록 조회
      //   2) users.role IN (TEACHER, ORG_ADMIN) 조회
      //   3) 본부 ORG_ADMIN 클라이언트 필터링
      const { data: orgs } = await supabaseBrowser
        .from('organizations')
        .select('headquarter_institute_id');
      const hqIds = new Set(
        ((orgs || []) as Array<{ headquarter_institute_id: string | null }>)
          .map((o) => o.headquarter_institute_id)
          .filter((v): v is string => !!v)
      );

      const { data, error } = await supabaseBrowser
        .from('users')
        .select('*')
        .in('role', ['TEACHER', 'ORG_ADMIN'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const teachersWithAdmin = (data || [])
        .filter((u) => {
          // 본부 institute ORG_ADMIN 은 제외 (학원 운영자로 분류)
          if (u.role === 'ORG_ADMIN' && u.institute_id && hqIds.has(u.institute_id)) {
            return false;
          }
          return true;
        })
        .map((teacher) => ({
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

  /** 확인창 열기 — 서버에서 영향 범위(반·시험지·문제 수)를 먼저 받아온다. */
  const openArchiveDialog = async (teacher: Teacher) => {
    setArchiveTarget({ teacher, impact: null });
    try {
      const res = await fetch(`/api/admin/teachers/${teacher.id}`);
      if (res.ok) {
        const data = await res.json();
        setArchiveTarget({ teacher, impact: data.impact });
      } else {
        const err = await res.json().catch(() => ({}));
        setArchiveTarget(null);
        setMessage({ type: 'error', text: err.message || '확인에 실패했습니다.' });
        setTimeout(() => setMessage(null), 4000);
      }
    } catch {
      // 영향 범위를 못 받아도 진행은 가능하게 둔다 (숫자만 '-' 로 표시)
      setArchiveTarget({ teacher, impact: { classes: -1, exams: -1, problems: -1 } });
    }
  };

  /** 실제 보관 — users.deleted_at 을 채운다. 반·시험지·문제는 그대로 남는다. */
  const confirmArchive = async () => {
    if (!archiveTarget) return;
    const { teacher } = archiveTarget;
    setArchiving(true);
    try {
      const res = await fetch(`/api/admin/teachers/${teacher.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.detail || '보관에 실패했습니다.');
      setTeachers((prev) => prev.filter((t) => t.id !== teacher.id));
      setArchiveTarget(null);
      setMessage({
        type: 'success',
        text: `${teacher.full_name} 계정을 보관했습니다. 로그인이 차단되며`
          + `${data.adminRevoked ? ' 관리자 권한도 해제됐습니다.' : ' 반·시험지·문제는 그대로 남습니다.'}`,
      });
      setTimeout(() => setMessage(null), 5000);
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '보관에 실패했습니다.' });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setArchiving(false);
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
            color: #71717a; /* zinc-500 */
          }

          .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #3f3f46; /* zinc-700 */
            border-top-color: rgba(255, 255, 255, 0.55);
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
                {/* ★ 실제 동작은 '보관'(소프트 삭제)이다 — 반·시험지·문제는 남고 로그인만 막힌다.
                    하드 삭제는 classes.tutor_id CASCADE 때문에 그 강사의 반이 통째로 사라진다. */}
                <button
                  className="archive-btn"
                  onClick={() => openArchiveDialog(teacher)}
                  disabled={updating === teacher.id}
                  title="계정 보관 (로그인 차단, 되돌릴 수 있음)"
                >
                  <Trash2 size={16} />
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>


      {/* ★ 보관 확인창 — 무엇이 남고 무엇이 막히는지 명시한다. 되돌릴 수 있다는 것도. */}
      {archiveTarget && (
        <div className="dialog-backdrop" onClick={() => !archiving && setArchiveTarget(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">
              <AlertCircle size={18} />
              {archiveTarget.teacher.full_name} 계정을 보관할까요?
            </div>

            <p className="dialog-desc">
              로그인이 차단됩니다.
              {archiveTarget.teacher.isAcademyAdmin && (
                <> <strong>관리자 권한도 함께 해제됩니다.</strong></>
              )}{' '}
              <strong>반·시험지·문제는 지워지지 않고 그대로 남습니다.</strong>
            </p>

            <div className="impact">
              {archiveTarget.impact === null ? (
                <span className="impact-loading">영향 범위 확인 중...</span>
              ) : (
                <>
                  <div className="impact-row"><span>담당 반</span><b>{archiveTarget.impact.classes < 0 ? '-' : `${archiveTarget.impact.classes}개`}</b></div>
                  <div className="impact-row"><span>만든 시험지</span><b>{archiveTarget.impact.exams < 0 ? '-' : `${archiveTarget.impact.exams}개`}</b></div>
                  <div className="impact-row"><span>만든 문제</span><b>{archiveTarget.impact.problems < 0 ? '-' : `${archiveTarget.impact.problems}개`}</b></div>
                  <div className="impact-note">위 자료는 보관 후에도 유지됩니다.</div>
                </>
              )}
            </div>

            <div className="dialog-actions">
              <button className="dialog-cancel" onClick={() => setArchiveTarget(null)} disabled={archiving}>
                취소
              </button>
              <button className="dialog-confirm" onClick={confirmArchive} disabled={archiving}>
                {archiving ? '보관 중...' : '보관하기'}
              </button>
            </div>
          </div>
        </div>
      )}

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
          color: #f4f4f5; /* zinc-100 */
          margin-bottom: 4px;
        }

        .page-header p {
          color: #a1a1aa; /* zinc-400 */
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
          background: #09090b; /* zinc-950 */
          border-radius: 12px;
          border: 1px solid #27272a; /* zinc-800 */
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
          background: rgba(255, 255, 255, 0.07);
          color: #ffffff;
        }

        .stat-icon.green {
          background: rgba(16, 185, 129, 0.1); /* emerald-500/10 */
          color: #34d399; /* emerald-400 */
        }

        .stat-info {
          display: flex;
          flex-direction: column;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #f4f4f5; /* zinc-100 */
        }

        .stat-label {
          font-size: 13px;
          color: #a1a1aa; /* zinc-400 */
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
          background: rgba(16, 185, 129, 0.05); /* emerald-500/5 */
          color: #6ee7b7; /* emerald-300 */
          border: 1px solid rgba(16, 185, 129, 0.2); /* emerald-500/20 */
        }

        .message.error {
          background: rgba(244, 63, 94, 0.05); /* rose-500/5 */
          color: #fda4af; /* rose-300 */
          border: 1px solid rgba(244, 63, 94, 0.2); /* rose-500/20 */
        }

        .info-banner {
          display: flex;
          gap: 16px;
          padding: 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          margin-bottom: 24px;
          color: #ffffff;
        }

        .info-banner strong {
          display: block;
          margin-bottom: 4px;
          color: #d4d4d8;
        }

        .info-banner p {
          font-size: 14px;
          color: #a1a1aa; /* zinc-400 */
          margin: 0;
        }

        .search-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #18181b; /* zinc-900 */
          border: 1px solid #27272a; /* zinc-800 */
          border-radius: 10px;
          margin-bottom: 20px;
        }

        .search-bar :global(svg) {
          color: #52525b; /* zinc-600 */
        }

        .search-bar input {
          flex: 1;
          border: none;
          background: transparent;
          color: #f4f4f5; /* zinc-100 */
          font-size: 14px;
          outline: none;
        }

        .search-bar input::placeholder {
          color: #52525b; /* zinc-600 */
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
          background: #09090b; /* zinc-950 */
          border-radius: 12px;
          border: 1px solid #27272a; /* zinc-800 */
          text-align: center;
          color: #71717a; /* zinc-500 */
        }

        .empty-state h3 {
          margin: 16px 0 8px;
          color: #d4d4d8; /* zinc-300 */
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
          background: #09090b; /* zinc-950 */
          border-radius: 12px;
          border: 1px solid #27272a; /* zinc-800 */
          transition: all 0.2s;
        }

        .teacher-card:hover {
          border-color: rgba(255, 255, 255, 0.24);
        }

        .teacher-card.admin {
          border-color: rgba(16, 185, 129, 0.3); /* emerald-500/30 */
          background: linear-gradient(135deg, #09090b 0%, rgba(16, 185, 129, 0.08) 100%);
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
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
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
          color: #f4f4f5; /* zinc-100 */
        }

        .admin-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          background: rgba(16, 185, 129, 0.15); /* emerald-500/15 */
          color: #34d399; /* emerald-400 */
          border: 1px solid rgba(16, 185, 129, 0.3); /* emerald-500/30 */
          font-size: 11px;
          font-weight: 500;
          border-radius: 9999px;
        }

        .teacher-meta {
          display: flex;
          gap: 16px;
          font-size: 13px;
          color: #a1a1aa; /* zinc-400 */
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
          background: #ffffff;
          color: #09090b;
          color: white;
        }

        .toggle-btn.grant:hover {
          background: #e4e4e7;
          color: #09090b;
        }

        .toggle-btn.revoke {
          background: rgba(244, 63, 94, 0.1); /* rose-500/10 */
          color: #fb7185; /* rose-400 */
        }

        .toggle-btn.revoke:hover {
          background: rgba(244, 63, 94, 0.2); /* rose-500/20 */
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

        .archive-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #a1a1aa;
          transition: all 0.15s;
        }
        .archive-btn:hover:not(:disabled) {
          border-color: rgba(248, 113, 113, 0.45);
          color: #f87171;
          background: rgba(248, 113, 113, 0.08);
        }
        .archive-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .dialog-backdrop {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .dialog {
          width: 100%;
          max-width: 420px;
          background: #18181b;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          padding: 22px;
        }
        .dialog-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 10px;
        }
        .dialog-desc {
          font-size: 13px;
          line-height: 1.6;
          color: #a1a1aa;
          margin: 0 0 14px;
        }
        .dialog-desc strong { color: #e4e4e7; font-weight: 600; }
        .impact {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 18px;
        }
        .impact-loading { font-size: 12px; color: #71717a; }
        .impact-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: #a1a1aa;
          padding: 3px 0;
        }
        .impact-row b { color: #ffffff; font-weight: 600; }
        .impact-note {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 11px;
          color: #71717a;
        }
        .dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .dialog-cancel, .dialog-confirm {
          padding: 9px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .dialog-cancel {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #a1a1aa;
        }
        .dialog-cancel:hover:not(:disabled) { color: #ffffff; border-color: rgba(255, 255, 255, 0.24); }
        .dialog-confirm {
          background: #ffffff;
          border: 1px solid #ffffff;
          color: #09090b;
        }
        .dialog-confirm:hover:not(:disabled) { background: #e4e4e7; }
        .dialog-cancel:disabled, .dialog-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

      `}</style>
    </div>
  );
}
