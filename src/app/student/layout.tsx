'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  BarChart3,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  GraduationCap,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/student/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/student/classes', label: '내 반', icon: BookOpen },
  { href: '/student/exams', label: '시험', icon: ClipboardList },
  { href: '/student/analytics', label: '학습 분석', icon: BarChart3 },
  { href: '/student/invitations', label: '초대', icon: Bell },
  { href: '/student/settings', label: '설정', icon: Settings },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    if (supabaseBrowser) {
      await supabaseBrowser.auth.signOut();
      window.location.href = '/auth/login';
    }
  };

  return (
    <div className="student-layout">
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
          <Link href="/student/dashboard" className="logo">
            <div className="logo-icon">
              <GraduationCap size={24} />
            </div>
            <span>과사람 수학</span>
          </Link>
          <button className="close-btn" onClick={() => setSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={20} />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main Content */}
      <main className="main-content">{children}</main>

      <style jsx>{`
        .student-layout {
          display: flex;
          min-height: 100vh;
          background: #f8fafc;
        }

        .mobile-header {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 60px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
          padding: 0 16px;
          align-items: center;
          gap: 16px;
          z-index: 100;
        }

        .mobile-header h1 {
          font-size: 18px;
          font-weight: 700;
          color: #1e1b4b;
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
          color: #374151;
          cursor: pointer;
        }

        .sidebar {
          width: 260px;
          height: 100vh;
          position: fixed;
          left: 0;
          top: 0;
          background: white;
          border-right: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
          z-index: 200;
        }

        .sidebar-header {
          padding: 20px;
          border-bottom: 1px solid #e5e7eb;
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
          gap: 12px;
          text-decoration: none;
        }

        .logo-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #059669 0%, #10b981 100%);
          border-radius: 10px;
          color: white;
        }

        .logo span {
          font-size: 18px;
          font-weight: 700;
          color: #1e1b4b;
        }

        .sidebar-nav {
          flex: 1;
          padding: 16px 12px;
          overflow-y: auto;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 8px;
          color: #6b7280;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
          margin-bottom: 4px;
        }

        .nav-item:hover {
          background: #f3f4f6;
          color: #374151;
        }

        .nav-item.active {
          background: #ecfdf5;
          color: #059669;
        }

        .sidebar-footer {
          padding: 16px 12px;
          border-top: 1px solid #e5e7eb;
        }

        .logout-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px 16px;
          border: none;
          border-radius: 8px;
          background: none;
          color: #dc2626;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .logout-btn:hover {
          background: #fef2f2;
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
          margin-left: 260px;
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
