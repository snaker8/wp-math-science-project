'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Users,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  UserPlus,
  ArrowLeft,
  GraduationCap,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { GlowCard } from '@/components/shared/GlowCard';

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
  const router = useRouter();
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
      <div className="classes-loading">
        <div className="spinner" />
        <p>반 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="classes-page"
    >
      <header className="page-header">
        <div className="header-left">
          <button onClick={() => router.back()} className="back-btn" title="뒤로가기">
            <ArrowLeft size={18} />
          </button>
          <div className="header-title-area">
            <h1>반 관리</h1>
            <p>수업을 개설하고 학생들을 체계적으로 관리하세요</p>
          </div>
        </div>
        <Link href="/tutor/classes/new" className="btn-primary">
          <Plus size={18} />
          <span>새 반 만들기</span>
        </Link>
      </header>

      {/* Controls Area */}
      <div className="controls-area">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="반 이름 또는 과목 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Classes Grid */}
      {filteredClasses.length === 0 ? (
        <div className="empty-state">
          <GraduationCap size={64} className="empty-icon text-zinc-800" />
          <h3>관리 중인 반이 없습니다</h3>
          <p>새로운 반을 만들고 학생들을 초대하여 학습을 시작하세요</p>
          <Link href="/tutor/classes/new" className="btn-primary mt-6">
            <Plus size={18} />
            첫 번째 반 만들기
          </Link>
        </div>
      ) : (
        <motion.div
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: {
                staggerChildren: 0.1,
              },
            },
          }}
          initial="hidden"
          animate="show"
          className="classes-grid"
        >
          {filteredClasses.map((cls) => (
            <motion.div
              key={cls.id}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 },
              }}
            >
              <GlowCard className={`class-card-wrapper ${!cls.isActive ? 'inactive' : ''}`}>
                <div className="card-header mt-[-24px]">
                  <div className="class-badges">
                    {cls.subject && <span className="badge subject">{cls.subject}</span>}
                    {cls.grade && <span className="badge grade">{gradeLabel(cls.grade)}</span>}
                    {!cls.isActive && <span className="badge inactive-badge">비활성</span>}
                  </div>
                  <div className="menu-area">
                    <button
                      className="dots-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === cls.id ? null : cls.id);
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>
                    <AnimatePresence>
                      {menuOpenId === cls.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          className="dropdown-menu"
                        >
                          <Link href={`/tutor/classes/${cls.id}/edit`} className="dropdown-item">
                            <Edit2 size={14} />
                            수정
                          </Link>
                          <Link href={`/tutor/classes/${cls.id}/invite`} className="dropdown-item">
                            <UserPlus size={14} />
                            학생 초대
                          </Link>
                          <div className="dropdown-divider" />
                          <button
                            className="dropdown-item danger"
                            onClick={() => handleDeleteClass(cls.id)}
                          >
                            <Trash2 size={14} />
                            삭제
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <Link href={`/tutor/classes/${cls.id}`} className="card-body">
                  <h3 className="class-name">{cls.name}</h3>
                  <p className="class-desc">{cls.description || '반 설명이 없습니다.'}</p>

                  <div className="stats-row">
                    <div className="stat-item">
                      <Users size={14} />
                      <span>
                        {cls.enrolledCount} / {cls.maxStudents}명
                      </span>
                    </div>
                    {cls.pendingCount > 0 && (
                      <div className="pending-indicator">
                        <span className="dot" />
                        {cls.pendingCount}명 대입 대기
                      </div>
                    )}
                  </div>
                </Link>

                <div className="card-footer">
                  <Link href={`/tutor/classes/${cls.id}`} className="view-detail-btn">
                    상세보기
                    <ChevronRight size={14} />
                  </Link>
                  <Link href={`/tutor/classes/${cls.id}/invite`} className="quick-invite-btn">
                    <UserPlus size={14} />
                  </Link>
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </motion.div>
      )}

      <style jsx>{`
        .classes-page {
          max-width: 1400px;
          margin: 0 auto;
          padding: 32px;
          min-height: 100vh;
          background: #000000;
          color: #ffffff;
        }

        .classes-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 60vh;
          gap: 16px;
          color: #71717a;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255, 255, 255, 0.05);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          padding: 24px 32px;
          background: rgba(24, 24, 27, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          backdrop-filter: blur(12px);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          background: rgba(39, 39, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #a1a1aa;
          border-radius: 12px;
          transition: all 0.2s;
        }

        .back-btn:hover {
          background: rgba(63, 63, 70, 0.8);
          color: #ffffff;
          transform: translateX(-2px);
        }

        .header-title-area h1 {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.025em;
          margin-bottom: 2px;
        }

        .header-title-area p {
          font-size: 13px;
          color: #71717a;
        }

        .btn-primary {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: #ffffff;
          color: #000000;
          font-size: 14px;
          font-weight: 700;
          border-radius: 12px;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
          text-decoration: none;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(255, 255, 255, 0.15);
          background: #f4f4f5;
        }

        .controls-area {
          margin-bottom: 32px;
        }

        .search-wrapper {
          position: relative;
          max-width: 400px;
        }

        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #52525b;
        }

        .search-wrapper input {
          width: 100%;
          padding: 12px 16px 12px 42px;
          background: rgba(24, 24, 27, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          font-size: 14px;
          color: #ffffff;
          transition: all 0.2s;
        }

        .search-wrapper input:focus {
          outline: none;
          background: rgba(39, 39, 42, 0.8);
          border-color: rgba(99, 102, 241, 0.4);
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
        }

        .classes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
        }

        :global(.class-card-wrapper) {
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 24px !important;
          background: rgba(9, 9, 11, 0.6) !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
        }

        .class-card-wrapper.inactive {
          opacity: 0.6;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .class-badges {
          display: flex;
          gap: 6px;
        }

        .badge {
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 700;
          border-radius: 6px;
          text-transform: uppercase;
        }

        .badge.subject {
          background: rgba(99, 102, 241, 0.15);
          color: #a5b4fc;
        }

        .badge.grade {
          background: rgba(255, 255, 255, 0.05);
          color: #d4d4d8;
        }

        .badge.inactive-badge {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
        }

        .menu-area {
          position: relative;
        }

        .dots-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          color: #52525b;
          transition: all 0.2s;
          background: transparent;
          border: none;
          cursor: pointer;
        }

        .dots-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #ffffff;
        }

        .dropdown-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 8px;
          width: 160px;
          background: #18181b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 6px;
          z-index: 50;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 500;
          color: #d4d4d8;
          border-radius: 8px;
          transition: all 0.2s;
          text-decoration: none;
          background: transparent;
          border: none;
          cursor: pointer;
        }

        .dropdown-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #ffffff;
        }

        .dropdown-item.danger {
          color: #f87171;
        }

        .dropdown-item.danger:hover {
          background: rgba(239, 68, 68, 0.1);
        }

        .dropdown-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.05);
          margin: 6px 0;
        }

        .card-body {
          flex: 1;
          display: block;
          text-decoration: none;
          margin-bottom: 24px;
        }

        .class-name {
          font-size: 18px;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 8px;
          letter-spacing: -0.01em;
        }

        .class-desc {
          font-size: 13px;
          line-height: 1.5;
          color: #71717a;
          margin-bottom: 16px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .stats-row {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #a1a1aa;
        }

        .pending-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(245, 158, 11, 0.1);
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          color: #f59e0b;
        }

        .pending-indicator .dot {
          width: 6px;
          height: 6px;
          background: #f59e0b;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }

        .card-footer {
          display: flex;
          gap: 12px;
          margin-top: auto;
        }

        .view-detail-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          border-radius: 10px;
          transition: all 0.2s;
          text-decoration: none;
        }

        .view-detail-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .quick-invite-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          color: #818cf8;
          border-radius: 10px;
          transition: all 0.2s;
          text-decoration: none;
        }

        .quick-invite-btn:hover {
          background: rgba(99, 102, 241, 0.2);
          transform: translateY(-2px);
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 120px 40px;
          background: rgba(24, 24, 27, 0.2);
          border: 1px dashed rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          text-align: center;
        }

        .empty-icon {
          margin-bottom: 24px;
        }

        .empty-state h3 {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .empty-state p {
          font-size: 14px;
          color: #52525b;
          max-width: 320px;
        }

        @media (max-width: 768px) {
          .classes-page {
            padding: 20px;
          }

          .page-header {
            flex-direction: column;
            gap: 20px;
            align-items: flex-start;
            padding: 24px;
          }

          .classes-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </motion.div>
  );
}
