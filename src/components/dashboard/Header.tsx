'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, Bell, Search } from 'lucide-react';
import {
  quickNavItems,
  findActiveNavItem,
} from '@/config/navigation';

const Header: React.FC = () => {
  const pathname = usePathname();
  const activeItem = findActiveNavItem(pathname);

  return (
    <header className="z-40 border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0">
      <div className="flex h-16 w-full items-center justify-between gap-6 px-8">
        {/* Page Title */}
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-800">
            {activeItem?.label || '대시보드'}
          </h2>
          {activeItem?.description && (
            <span className="text-sm text-gray-500 hidden md:inline">
              · {activeItem.description}
            </span>
          )}
        </div>

        {/* Global Search & Actions */}
        <div className="flex flex-1 items-center justify-end gap-4">
          {/* Search Box */}
          <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="문제 검색..."
              className="bg-transparent border-none outline-none text-sm text-gray-700 w-48 placeholder:text-gray-400"
            />
            <kbd className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">⌘K</kbd>
          </div>

          {/* Quick Navigation */}
          <div className="flex items-center rounded-full border border-gray-200 bg-white p-1">
            {quickNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeItem?.href === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    p-2 rounded-full transition-all
                    ${isActive ? 'bg-gray-100 text-primary-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}
                  `}
                  title={item.label}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </div>

          <div className="h-6 w-px bg-gray-200 mx-2" />

          {/* Notifications */}
          <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {/* User Profile */}
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1.5 pl-1.5 pr-3 hover:bg-gray-50 transition-colors">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                <span className="text-xs font-bold text-white">T</span>
              </div>
              <span className="text-sm font-semibold text-gray-700">선생님</span>
            </button>
            <Link
              href="/dashboard/settings"
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
