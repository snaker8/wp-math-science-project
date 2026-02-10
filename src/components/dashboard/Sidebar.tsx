'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  dashboardNavItems,
  tutorNavItems,
  systemNavItems,
  findActiveNavItem,
} from '@/config/navigation';

interface SidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed = false, onToggle }) => {
  const pathname = usePathname();
  const activeItem = findActiveNavItem(pathname);

  const renderNavSection = (
    items: typeof dashboardNavItems,
    title?: string
  ) => (
    <div className="space-y-1">
      {title && !isCollapsed && (
        <div className="px-3 py-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {title}
          </span>
        </div>
      )}
      {items.map((item) => {
        const isActive = activeItem?.href === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group
              ${isActive
                ? 'bg-primary-500/10 text-primary-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }
              ${isCollapsed ? 'justify-center' : ''}
            `}
            title={isCollapsed ? item.label : undefined}
          >
            <Icon
              size={20}
              className={`
                transition-colors flex-shrink-0
                ${isActive ? 'text-primary-500' : 'text-gray-500 group-hover:text-white'}
              `}
            />
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className={`font-medium text-sm truncate ${isActive ? 'text-primary-500' : ''}`}>
                  {item.label}
                </span>
                {item.description && (
                  <span className="text-xs text-gray-500 truncate">
                    {item.description}
                  </span>
                )}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <aside
      className={`
        fixed left-0 top-0 h-screen bg-[#111827] border-r border-gray-800
        text-white flex flex-col transition-all duration-300 z-50
        ${isCollapsed ? 'w-[72px]' : 'w-[260px]'}
      `}
    >
      {/* 로고 영역 */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-800">
        {!isCollapsed && (
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-lg shadow-primary-500/30">
              <span className="text-white text-sm font-bold">과</span>
            </div>
            <span className="font-bold text-lg text-white tracking-tight">과사람</span>
          </Link>
        )}
        <button
          onClick={onToggle}
          className={`
            p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors
            ${isCollapsed ? 'mx-auto' : ''}
          `}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 py-4 px-3 space-y-6 overflow-y-auto">
        {renderNavSection(dashboardNavItems, '문제 관리')}

        {!isCollapsed && <div className="border-t border-gray-800" />}

        {renderNavSection(tutorNavItems, '수업 / 분석')}

        {!isCollapsed && <div className="border-t border-gray-800" />}

        {renderNavSection(systemNavItems)}
      </nav>

      {/* 하단 정보 */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gray-800">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-400">현재 플랜</span>
              <span className="text-xs font-bold text-primary-400">Pro</span>
            </div>
            <p className="font-semibold text-sm text-white mb-3">과사람 완전학습</p>
            <div className="text-xs text-gray-500">
              3,569개 유형 · 무제한 문제
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
