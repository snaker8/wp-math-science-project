'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Users, Search, MoreVertical, Edit2, Trash2, UserPlus } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface ClassItem {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  grade: number | null;
  maxStudents: number;
  isActive: boolean;
  enrolledCount: number;
  pendingCount: number;
  createdAt: string;
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    if (!supabaseBrowser) {
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) return;

      const { data: classesData } = await supabaseBrowser
        .from('classes')
        .select('*')
        .eq('tutor_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const classesWithStats: ClassItem[] = [];
      for (const cls of classesData || []) {
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

        classesWithStats.push({
          id: cls.id,
          name: cls.name,
          description: cls.description,
          subject: cls.subject,
          grade: cls.grade,
          maxStudents: cls.max_students,
          isActive: cls.is_active,
          enrolledCount: enrolledCount || 0,
          pendingCount: pendingCount || 0,
          createdAt: cls.created_at,
        });
      }

      setClasses(classesWithStats);
    } catch (error) {
      console.error('Classes load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!confirm('정말 이 반을 삭제하시겠습니까?')) return;

    if (!supabaseBrowser) return;

    try {
      await supabaseBrowser
        .from('classes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', classId);

      setClasses((prev) => prev.filter((c) => c.id !== classId));
      setMenuOpenId(null);
    } catch (error) {
      console.error('Delete class error:', error);
      alert('반 삭제 중 오류가 발생했습니다');
    }
  };

  const filteredClasses = classes.filter(
    (cls) =>
      cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const gradeLabel = (grade: number | null) => {
    if (!grade) return '';
    if (grade <= 6) return `초${grade}`;
    if (grade <= 9) return `중${grade - 6}`;
    return `고${grade - 9}`;
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>반 목록 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="classes-page">
      <header className="page-header">
        <div>
          <h1>반 관리</h1>
          <p>반을 만들고 학생들을 초대하세요</p>
        </div>
        <Link href="/tutor/classes/new" className="btn-primary">
          <Plus size={18} />
          새 반 만들기
        </Link>
      </header>

      {/* Search */}
      <div className="search-bar">
        <Search size={18} />
        <input
          type="text"
          placeholder="반 이름 또는 과목으로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Classes Grid */}
      {filteredClasses.length === 0 ? (
        <div className="empty-state">
          <Users size={64} />
          <h3>아직 생성된 반이 없습니다</h3>
          <p>새 반을 만들어 학생들을 초대해보세요</p>
          <Link href="/tutor/classes/new" className="btn-primary">
            <Plus size={18} />
            첫 반 만들기
          </Link>
        </div>
      ) : (
        <div className="classes-grid">
          {filteredClasses.map((cls) => (
            <div key={cls.id} className={`class-card ${!cls.isActive ? 'inactive' : ''}`}>
              <div className="card-header">
                <div className="class-meta">
                  {cls.subject && <span className="subject-badge">{cls.subject}</span>}
                  {cls.grade && <span className="grade-badge">{gradeLabel(cls.grade)}</span>}
                  {!cls.isActive && <span className="inactive-badge">비활성</span>}
                </div>
                <div className="menu-container">
                  <button
                    className="menu-btn"
                    onClick={() => setMenuOpenId(menuOpenId === cls.id ? null : cls.id)}
                  >
                    <MoreVertical size={18} />
                  </button>
                  {menuOpenId === cls.id && (
                    <div className="menu-dropdown">
                      <Link
                        href={`/tutor/classes/${cls.id}/edit`}
                        className="menu-item"
                        onClick={() => setMenuOpenId(null)}
                      >
                        <Edit2 size={14} />
                        수정
                      </Link>
                      <Link
                        href={`/tutor/classes/${cls.id}/invite`}
                        className="menu-item"
                        onClick={() => setMenuOpenId(null)}
                      >
                        <UserPlus size={14} />
                        학생 초대
                      </Link>
                      <button
                        className="menu-item danger"
                        onClick={() => handleDeleteClass(cls.id)}
                      >
                        <Trash2 size={14} />
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <Link href={`/tutor/classes/${cls.id}`} className="card-body">
                <h3>{cls.name}</h3>
                {cls.description && <p className="description">{cls.description}</p>}

                <div className="student-info">
                  <Users size={16} />
                  <span>
                    {cls.enrolledCount} / {cls.maxStudents}명
                  </span>
                  {cls.pendingCount > 0 && (
                    <span className="pending-badge">{cls.pendingCount} 대기</span>
                  )}
                </div>
              </Link>

              <div className="card-footer">
                <Link href={`/tutor/classes/${cls.id}/invite`} className="invite-btn">
                  <UserPlus size={16} />
                  학생 초대
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .classes-page {
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
          display: flex;
          justify-content: space-between;
          align-items: center;
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
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .search-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          margin-bottom: 24px;
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

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 24px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          color: #9ca3af;
        }

        .empty-state h3 {
          margin: 24px 0 8px;
          font-size: 18px;
          color: #374151;
        }

        .empty-state p {
          margin-bottom: 24px;
          font-size: 14px;
        }

        .classes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }

        .class-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.2s;
        }

        .class-card:hover {
          border-color: #c7d2fe;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .class-card.inactive {
          opacity: 0.7;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 16px 0;
        }

        .class-meta {
          display: flex;
          gap: 8px;
        }

        .subject-badge,
        .grade-badge {
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 500;
          border-radius: 6px;
        }

        .subject-badge {
          background: #eef2ff;
          color: #4f46e5;
        }

        .grade-badge {
          background: #ecfdf5;
          color: #059669;
        }

        .inactive-badge {
          padding: 4px 10px;
          background: #f3f4f6;
          color: #6b7280;
          font-size: 12px;
          font-weight: 500;
          border-radius: 6px;
        }

        .menu-container {
          position: relative;
        }

        .menu-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          background: none;
          color: #9ca3af;
          cursor: pointer;
          border-radius: 6px;
        }

        .menu-btn:hover {
          background: #f3f4f6;
          color: #6b7280;
        }

        .menu-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          min-width: 140px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          z-index: 10;
          overflow: hidden;
        }

        .menu-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 10px 14px;
          border: none;
          background: none;
          font-size: 13px;
          color: #374151;
          text-decoration: none;
          cursor: pointer;
        }

        .menu-item:hover {
          background: #f9fafb;
        }

        .menu-item.danger {
          color: #dc2626;
        }

        .menu-item.danger:hover {
          background: #fef2f2;
        }

        .card-body {
          display: block;
          padding: 16px;
          text-decoration: none;
        }

        .card-body h3 {
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 8px;
        }

        .description {
          font-size: 13px;
          color: #6b7280;
          line-height: 1.5;
          margin-bottom: 16px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .student-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #6b7280;
        }

        .pending-badge {
          padding: 2px 8px;
          background: #fef3c7;
          color: #d97706;
          font-size: 11px;
          font-weight: 600;
          border-radius: 9999px;
        }

        .card-footer {
          padding: 12px 16px;
          border-top: 1px solid #e5e7eb;
        }

        .invite-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          padding: 10px;
          background: #f8fafc;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          color: #4f46e5;
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s;
        }

        .invite-btn:hover {
          background: #eef2ff;
          border-color: #c7d2fe;
        }

        @media (max-width: 640px) {
          .page-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }

          .classes-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
