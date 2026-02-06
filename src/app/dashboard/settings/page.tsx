'use client';

import React, { useState } from 'react';
import {
  User,
  Bell,
  Shield,
  Palette,
  Database,
  Key,
  Mail,
  Smartphone,
  Globe,
  Save,
  Check,
} from 'lucide-react';

interface SettingSection {
  id: string;
  title: string;
  icon: React.ElementType;
}

const settingSections: SettingSection[] = [
  { id: 'profile', title: '프로필', icon: User },
  { id: 'notifications', title: '알림', icon: Bell },
  { id: 'security', title: '보안', icon: Shield },
  { id: 'appearance', title: '화면', icon: Palette },
  { id: 'data', title: '데이터', icon: Database },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile');
  const [saved, setSaved] = useState(false);

  // Form states
  const [profile, setProfile] = useState({
    name: '김선생',
    email: 'teacher@academy.com',
    phone: '010-1234-5678',
    academy: '과사람 수학학원',
  });

  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    sms: false,
    gradingComplete: true,
    newStudent: true,
    weeklyReport: true,
  });

  const [appearance, setAppearance] = useState({
    theme: 'light',
    fontSize: 'medium',
    compactMode: false,
  });

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const renderProfileSection = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">기본 정보</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">학원명</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={profile.academy}
                onChange={(e) => setProfile({ ...profile, academy: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">프로필 사진</h3>
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">김</span>
          </div>
          <div>
            <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">
              사진 변경
            </button>
            <p className="text-xs text-gray-500 mt-2">JPG, PNG 파일 (최대 2MB)</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderNotificationsSection = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">알림 채널</h3>
        <div className="space-y-4">
          {[
            { key: 'email', label: '이메일 알림', desc: '중요한 알림을 이메일로 받습니다' },
            { key: 'push', label: '푸시 알림', desc: '브라우저 푸시 알림을 받습니다' },
            { key: 'sms', label: 'SMS 알림', desc: '긴급한 알림을 문자로 받습니다' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-800">{item.label}</p>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
              <button
                onClick={() =>
                  setNotifications({
                    ...notifications,
                    [item.key]: !notifications[item.key as keyof typeof notifications],
                  })
                }
                className={`
                  w-12 h-6 rounded-full transition-colors relative
                  ${notifications[item.key as keyof typeof notifications] ? 'bg-primary-500' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                    absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                    ${notifications[item.key as keyof typeof notifications] ? 'left-7' : 'left-1'}
                  `}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">알림 종류</h3>
        <div className="space-y-4">
          {[
            { key: 'gradingComplete', label: '채점 완료', desc: '학생 채점이 완료되면 알림' },
            { key: 'newStudent', label: '신규 학생', desc: '새 학생이 등록되면 알림' },
            { key: 'weeklyReport', label: '주간 리포트', desc: '매주 성적 분석 리포트' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-800">{item.label}</p>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
              <button
                onClick={() =>
                  setNotifications({
                    ...notifications,
                    [item.key]: !notifications[item.key as keyof typeof notifications],
                  })
                }
                className={`
                  w-12 h-6 rounded-full transition-colors relative
                  ${notifications[item.key as keyof typeof notifications] ? 'bg-primary-500' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                    absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                    ${notifications[item.key as keyof typeof notifications] ? 'left-7' : 'left-1'}
                  `}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSecuritySection = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">비밀번호</h3>
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Key className="h-5 w-5 text-gray-400" />
              <div>
                <p className="font-medium text-gray-800">비밀번호 변경</p>
                <p className="text-sm text-gray-500">마지막 변경: 30일 전</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors">
              변경하기
            </button>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">2단계 인증</h3>
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-gray-400" />
              <div>
                <p className="font-medium text-gray-800">2단계 인증 (2FA)</p>
                <p className="text-sm text-gray-500">계정 보안을 강화합니다</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
              미설정
            </span>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">로그인 기록</h3>
        <div className="space-y-3">
          {[
            { device: 'Chrome on Windows', location: '서울, 대한민국', time: '방금 전', current: true },
            { device: 'Safari on iPhone', location: '서울, 대한민국', time: '2시간 전', current: false },
            { device: 'Chrome on MacOS', location: '부산, 대한민국', time: '3일 전', current: false },
          ].map((session, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-800">{session.device}</p>
                  {session.current && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                      현재 세션
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{session.location} · {session.time}</p>
              </div>
              {!session.current && (
                <button className="text-sm text-red-500 hover:text-red-600 font-medium">
                  로그아웃
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAppearanceSection = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">테마</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: 'light', label: '라이트', bg: 'bg-white border-2' },
            { value: 'dark', label: '다크', bg: 'bg-gray-900 border-2' },
            { value: 'system', label: '시스템', bg: 'bg-gradient-to-r from-white to-gray-900 border-2' },
          ].map((theme) => (
            <button
              key={theme.value}
              onClick={() => setAppearance({ ...appearance, theme: theme.value })}
              className={`
                p-4 rounded-xl transition-all
                ${appearance.theme === theme.value ? 'ring-2 ring-primary-500' : 'hover:bg-gray-50'}
              `}
            >
              <div className={`w-full h-20 rounded-lg mb-3 ${theme.bg} border-gray-200`} />
              <p className="text-sm font-medium text-gray-800">{theme.label}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">글꼴 크기</h3>
        <div className="flex gap-4">
          {[
            { value: 'small', label: '작게' },
            { value: 'medium', label: '보통' },
            { value: 'large', label: '크게' },
          ].map((size) => (
            <button
              key={size.value}
              onClick={() => setAppearance({ ...appearance, fontSize: size.value })}
              className={`
                flex-1 py-3 rounded-lg text-sm font-medium transition-all
                ${appearance.fontSize === size.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
              `}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t pt-6">
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="font-medium text-gray-800">컴팩트 모드</p>
            <p className="text-sm text-gray-500">더 많은 정보를 화면에 표시합니다</p>
          </div>
          <button
            onClick={() => setAppearance({ ...appearance, compactMode: !appearance.compactMode })}
            className={`
              w-12 h-6 rounded-full transition-colors relative
              ${appearance.compactMode ? 'bg-primary-500' : 'bg-gray-300'}
            `}
          >
            <span
              className={`
                absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                ${appearance.compactMode ? 'left-7' : 'left-1'}
              `}
            />
          </button>
        </div>
      </div>
    </div>
  );

  const renderDataSection = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">데이터 내보내기</h3>
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">학생 데이터</p>
                <p className="text-sm text-gray-500">학생 목록, 성적, 분석 결과</p>
              </div>
              <button className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors">
                CSV 다운로드
              </button>
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">문제 데이터</p>
                <p className="text-sm text-gray-500">등록된 문제, 유형 분류</p>
              </div>
              <button className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors">
                JSON 다운로드
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">데이터 삭제</h3>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-red-800">계정 삭제</p>
              <p className="text-sm text-red-600">모든 데이터가 영구적으로 삭제됩니다</p>
            </div>
            <button className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors">
              계정 삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'profile':
        return renderProfileSection();
      case 'notifications':
        return renderNotificationsSection();
      case 'security':
        return renderSecuritySection();
      case 'appearance':
        return renderAppearanceSection();
      case 'data':
        return renderDataSection();
      default:
        return renderProfileSection();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">설정</h1>
          <p className="text-gray-500 mt-1">계정 및 환경 설정을 관리합니다</p>
        </div>

        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-56 flex-shrink-0">
            <nav className="space-y-1">
              {settingSections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left
                      ${isActive
                        ? 'bg-primary-500/10 text-primary-600'
                        : 'text-gray-600 hover:bg-gray-100'}
                    `}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? 'text-primary-500' : 'text-gray-400'}`} />
                    <span className="font-medium">{section.title}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              {renderSection()}

              {/* Save Button */}
              <div className="mt-8 pt-6 border-t flex justify-end">
                <button
                  onClick={handleSave}
                  className={`
                    flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all
                    ${saved
                      ? 'bg-green-500 text-white'
                      : 'bg-primary-500 hover:bg-primary-600 text-white'}
                  `}
                >
                  {saved ? (
                    <>
                      <Check className="h-4 w-4" />
                      저장됨
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      저장하기
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
