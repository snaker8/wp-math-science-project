'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardList,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  GraduationCap,
  Upload,
  CheckSquare,
  Stethoscope,
  Home,
  Shield,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

// 사이드바 그룹 — 학습 흐름 순서대로 묶음 (학원장 검토 톤 통일)
const NAV_GROUPS: Array<{
  label: string | null;
  items: Array<{ href: string; label: string; icon: typeof LayoutDashboard; isExternal?: boolean }>;
}> = [
  {
    label: null, // 첫 그룹은 무라벨 (대시보드)
    items: [{ href: '/tutor/dashboard', label: '대시보드', icon: LayoutDashboard }],
  },
  {
    label: '콘텐츠',
    items: [
      // ★ 검증된 자산화 경로로 통일 (사고 반복 방지)
      { href: '/dashboard/cloud', label: '문제 업로드', icon: Upload },
      { href: '/tutor/problems', label: '문제 관리', icon: BookOpen },
      { href: '/tutor/exams', label: '시험 관리', icon: ClipboardList },
    ],
  },
  {
    label: '학생·반',
    items: [
      { href: '/tutor/classes', label: '반 관리', icon: Users },
      { href: '/tutor/students', label: '학생 관리', icon: GraduationCap },
    ],
  },
  {
    label: '평가·분석',
    items: [
      { href: '/tutor/grading', label: '채점하기', icon: CheckSquare },
      { href: '/tutor/clinic', label: '클리닉', icon: Stethoscope },
      { href: '/tutor/analytics', label: '성적 분석', icon: BarChart3 },
    ],
  },
  {
    label: '시스템',
    items: [
      { href: '/tutor/settings', label: '설정', icon: Settings },
      { href: '/dashboard', label: '메인으로', icon: Home, isExternal: true },
    ],
  },
];

export default function TutorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAcademyAdmin, setIsAcademyAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    if (!supabaseBrowser) return;

    try {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabaseBrowser
        .from('users')
        .select('preferences, role')
        .eq('id', user.id)
        .single();

      if (userData) {
        const prefs = userData.preferences as Record<string, unknown> || {};
        // ADMIN 역할이거나 isAcademyAdmin이 true인 경우
        setIsAcademyAdmin(userData.role === 'ADMIN' || prefs.isAcademyAdmin === true);
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const handleLogout = async () => {
    if (supabaseBrowser) {
      await supabaseBrowser.auth.signOut();
      window.location.href = '/auth/login';
    }
  };

  return (
    <div className="tutor-layout">
      {/* Mobile Header */}
      <header className="mobile-header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
        <h1>과사람 수학</h1>
      </header>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <Link href="/tutor/dashboard" className="logo">
            <div className="logo-icon">
              <BookOpen size={24} />
            </div>
            <span>과사람 수학</span>
          </Link>
          <button className="close-btn" onClick={() => setSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="nav-group">
              {group.label && <div className="nav-group-label">{group.label}</div>}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${isActive ? 'active' : ''} ${item.isExternal ? 'external' : ''}`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}

          {/* 관리자 권한이 있는 경우 관리자 콘솔 링크 표시 */}
          {isAcademyAdmin && (
            <div className="nav-group">
              <div className="nav-group-label">관리</div>
              <Link
                href="/admin/dashboard"
                className="nav-item admin-link"
                onClick={() => setSidebarOpen(false)}
              >
                <Shield size={16} />
                <span>관리자 콘솔</span>
              </Link>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main Content */}
      <main className="main-content">{children}</main>

      <style jsx>{`
        .tutor-layout {
          display: flex;
          min-height: 100vh;
          background: #000000;
        }

        .mobile-header {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 60px;
          background: rgba(9, 9, 11, 0.92);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding: 0 16px;
          align-items: center;
          gap: 16px;
          z-index: 100;
        }

        .mobile-header h1 {
          font-size: 18px;
          font-weight: 700;
          color: #ffffff;
        }

        .menu-btn,
        .close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border: none;
          background: none;
          color: #d4d4d8;
          cursor: pointer;
        }

        .sidebar {
          width: 232px;
          height: 100vh;
          position: fixed;
          left: 0;
          top: 0;
          background: #0a0a0a;
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          flex-direction: column;
          z-index: 200;
        }

        .sidebar-header {
          padding: 16px 16px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .sidebar-header .close-btn {
          display: none;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
        }

        .logo-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          border-radius: 8px;
          color: white;
        }
        .logo-icon :global(svg) { width: 18px; height: 18px; }

        .logo span {
          font-size: 15px;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.01em;
        }

        .sidebar-nav {
          flex: 1;
          padding: 8px 10px;
          overflow-y: auto;
        }

        .nav-group {
          padding: 6px 0 4px;
        }
        .nav-group + .nav-group {
          margin-top: 2px;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          padding-top: 8px;
        }
        .nav-group-label {
          padding: 4px 10px 6px;
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #52525b;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 10px;
          border-radius: 6px;
          color: #a1a1aa;
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          transition: background 0.15s, color 0.15s;
          margin-bottom: 1px;
        }

        .nav-item:hover {
          background: rgba(255, 255, 255, 0.04);
          color: #ffffff;
        }

        .nav-item.active {
          background: rgba(99, 102, 241, 0.14);
          color: #a5b4fc;
        }

        .nav-item.external {
          color: #71717a;
        }

        .nav-item.admin-link {
          background: rgba(220, 38, 38, 0.08);
          color: #fca5a5;
        }

        .nav-item.admin-link:hover {
          background: rgba(220, 38, 38, 0.16);
          color: #fecaca;
        }

        .sidebar-footer {
          padding: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .logout-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 7px 10px;
          border: none;
          border-radius: 6px;
          background: none;
          color: #f87171;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .logout-btn:hover {
          background: rgba(220, 38, 38, 0.12);
          color: #fca5a5;
        }

        .overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 150;
        }

        .main-content {
          flex: 1;
          margin-left: 232px;
          padding: 24px;
          min-height: 100vh;
        }

        @media (max-width: 768px) {
          .mobile-header {
            display: flex;
          }

          .sidebar {
            transform: translateX(-100%);
            transition: transform 0.3s ease;
          }

          .sidebar.open {
            transform: translateX(0);
          }

          .sidebar-header .close-btn {
            display: flex;
          }

          .overlay {
            display: block;
          }

          .main-content {
            margin-left: 0;
            padding-top: 84px;
          }
        }
      `}</style>
    </div>
  );
}
