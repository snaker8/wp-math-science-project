'use client';

import { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Phone,
  Lock,
  Bell,
  Moon,
  Sun,
  Save,
  Camera,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface UserProfile {
  name: string;
  email: string;
  phone: string;
  avatar: string | null;
}

export default function TutorSettingsPage() {
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    email: '',
    phone: '',
    avatar: null,
  });
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    studentSubmission: true,
    weeklyReport: true,
  });
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    if (!supabaseBrowser) {
      setProfile({
        name: '홍길동 선생님',
        email: 'teacher@example.com',
        phone: '010-1234-5678',
        avatar: null,
      });
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) return;

      const { data } = await supabaseBrowser
        .from('users')
        .select('name, email, phone, avatar_url')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile({
          name: data.name || '',
          email: data.email || user.email || '',
          phone: data.phone || '',
          avatar: data.avatar_url,
        });
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (supabaseBrowser) {
        const { data: { user } } = await supabaseBrowser.auth.getUser();
        if (user) {
          await supabaseBrowser
            .from('users')
            .update({
              name: profile.name,
              phone: profile.phone,
            })
            .eq('id', user.id);
        }
      }
      alert('설정이 저장되었습니다.');
    } catch (error) {
      console.error('Failed to save:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>설정 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <header className="page-header">
        <h1>설정</h1>
        <p>계정 정보와 앱 설정을 관리하세요</p>
      </header>

      <div className="settings-grid">
        {/* Profile Section */}
        <section className="settings-section">
          <h2>
            <User size={20} />
            프로필 정보
          </h2>

          <div className="avatar-section">
            <div className="avatar">
              {profile.avatar ? (
                <img src={profile.avatar} alt="프로필" />
              ) : (
                <span>{profile.name.charAt(0) || 'T'}</span>
              )}
            </div>
            <button className="avatar-edit">
              <Camera size={16} />
              사진 변경
            </button>
          </div>

          <div className="form-group">
            <label>이름</label>
            <div className="input-with-icon">
              <User size={18} />
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="이름을 입력하세요"
              />
            </div>
          </div>

          <div className="form-group">
            <label>이메일</label>
            <div className="input-with-icon">
              <Mail size={18} />
              <input
                type="email"
                value={profile.email}
                disabled
                className="disabled"
              />
            </div>
            <span className="helper-text">이메일은 변경할 수 없습니다</span>
          </div>

          <div className="form-group">
            <label>연락처</label>
            <div className="input-with-icon">
              <Phone size={18} />
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="010-0000-0000"
              />
            </div>
          </div>
        </section>

        {/* Notifications Section */}
        <section className="settings-section">
          <h2>
            <Bell size={20} />
            알림 설정
          </h2>

          <div className="toggle-group">
            <div className="toggle-item">
              <div className="toggle-info">
                <span className="toggle-label">이메일 알림</span>
                <span className="toggle-desc">중요 알림을 이메일로 받습니다</span>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={notifications.email}
                  onChange={(e) =>
                    setNotifications({ ...notifications, email: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="toggle-item">
              <div className="toggle-info">
                <span className="toggle-label">푸시 알림</span>
                <span className="toggle-desc">브라우저 푸시 알림을 받습니다</span>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={notifications.push}
                  onChange={(e) =>
                    setNotifications({ ...notifications, push: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="toggle-item">
              <div className="toggle-info">
                <span className="toggle-label">학생 제출 알림</span>
                <span className="toggle-desc">학생이 시험을 제출하면 알립니다</span>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={notifications.studentSubmission}
                  onChange={(e) =>
                    setNotifications({ ...notifications, studentSubmission: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="toggle-item">
              <div className="toggle-info">
                <span className="toggle-label">주간 리포트</span>
                <span className="toggle-desc">매주 학습 현황 요약을 받습니다</span>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={notifications.weeklyReport}
                  onChange={(e) =>
                    setNotifications({ ...notifications, weeklyReport: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </section>

        {/* Appearance Section */}
        <section className="settings-section">
          <h2>
            <Moon size={20} />
            화면 설정
          </h2>

          <div className="theme-selector">
            <button
              className={`theme-option ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
            >
              <Sun size={20} />
              <span>라이트</span>
            </button>
            <button
              className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <Moon size={20} />
              <span>다크</span>
            </button>
            <button
              className={`theme-option ${theme === 'system' ? 'active' : ''}`}
              onClick={() => setTheme('system')}
            >
              <span className="system-icon">A</span>
              <span>시스템</span>
            </button>
          </div>
        </section>

        {/* Security Section */}
        <section className="settings-section">
          <h2>
            <Lock size={20} />
            보안
          </h2>

          <button className="security-btn">
            <Lock size={18} />
            비밀번호 변경
          </button>
        </section>
      </div>

      {/* Save Button */}
      <div className="save-section">
        <button className="btn-save" onClick={handleSave} disabled={saving}>
          <Save size={18} />
          {saving ? '저장 중...' : '변경사항 저장'}
        </button>
      </div>

      <style jsx>{`
        .settings-page {
          max-width: 800px;
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
          to { transform: rotate(360deg); }
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

        .settings-grid {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .settings-section {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px;
        }

        .settings-section h2 {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid #f3f4f6;
        }

        .avatar-section {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
        }

        .avatar {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 28px;
          font-weight: 600;
          overflow: hidden;
        }

        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-edit {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: #f3f4f6;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          color: #374151;
          cursor: pointer;
        }

        .avatar-edit:hover {
          background: #e5e7eb;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 6px;
        }

        .input-with-icon {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: white;
        }

        .input-with-icon svg {
          color: #9ca3af;
        }

        .input-with-icon input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 14px;
        }

        .input-with-icon input.disabled {
          background: #f9fafb;
          color: #9ca3af;
        }

        .helper-text {
          font-size: 12px;
          color: #9ca3af;
          margin-top: 4px;
        }

        .toggle-group {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .toggle-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #f3f4f6;
        }

        .toggle-item:last-child {
          border-bottom: none;
        }

        .toggle-info {
          display: flex;
          flex-direction: column;
        }

        .toggle-label {
          font-size: 14px;
          font-weight: 500;
          color: #1f2937;
        }

        .toggle-desc {
          font-size: 12px;
          color: #6b7280;
          margin-top: 2px;
        }

        .toggle {
          position: relative;
          width: 44px;
          height: 24px;
        }

        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          inset: 0;
          background: #e5e7eb;
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .toggle-slider::before {
          content: '';
          position: absolute;
          left: 2px;
          top: 2px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .toggle input:checked + .toggle-slider {
          background: #4f46e5;
        }

        .toggle input:checked + .toggle-slider::before {
          transform: translateX(20px);
        }

        .theme-selector {
          display: flex;
          gap: 12px;
        }

        .theme-option {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px;
          background: #f9fafb;
          border: 2px solid transparent;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .theme-option:hover {
          background: #f3f4f6;
        }

        .theme-option.active {
          background: #eef2ff;
          border-color: #4f46e5;
        }

        .theme-option span {
          font-size: 13px;
          font-weight: 500;
          color: #374151;
        }

        .system-icon {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 700;
        }

        .security-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: #f3f4f6;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
        }

        .security-btn:hover {
          background: #e5e7eb;
        }

        .save-section {
          position: fixed;
          bottom: 24px;
          right: 24px;
        }

        .btn-save {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 24px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          font-size: 14px;
          font-weight: 600;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
          transition: all 0.2s;
        }

        .btn-save:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
        }

        .btn-save:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .theme-selector {
            flex-direction: column;
          }

          .save-section {
            position: static;
            margin-top: 24px;
          }

          .btn-save {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
