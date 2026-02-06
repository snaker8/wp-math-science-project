'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { User, Mail, Lock, GraduationCap, School, UserCog } from 'lucide-react';

type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

interface RoleOption {
  value: UserRole;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: 'STUDENT',
    label: '학생',
    description: '문제를 풀고 학습 진도를 관리합니다',
    icon: <GraduationCap size={24} />,
  },
  {
    value: 'TEACHER',
    label: '강사',
    description: '반을 만들고 학생들을 관리합니다',
    icon: <School size={24} />,
  },
  {
    value: 'ADMIN',
    label: '관리자',
    description: '학원 전체를 관리합니다',
    icon: <UserCog size={24} />,
  },
];

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
    grade: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setStep(2);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedRole) {
      setError('역할을 선택해주세요');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다');
      return;
    }

    if (formData.password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다');
      return;
    }

    if (!supabaseBrowser) {
      setError('Supabase가 설정되지 않았습니다');
      return;
    }

    setLoading(true);

    try {
      // 1. Supabase Auth로 회원가입
      const { data: authData, error: authError } = await supabaseBrowser.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            role: selectedRole,
            phone: formData.phone || null,
            grade: selectedRole === 'STUDENT' && formData.grade ? parseInt(formData.grade) : null,
          },
        },
      });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error('회원가입 중 오류가 발생했습니다');
      }

      // 2. users 테이블에 직접 저장
      const { error: userError } = await supabaseBrowser.from('users').insert({
        id: authData.user.id,
        email: formData.email,
        full_name: formData.fullName,
        phone: formData.phone || null,
        role: selectedRole,
        grade: selectedRole === 'STUDENT' && formData.grade ? parseInt(formData.grade) : null,
        institute_id: null,
        avatar_url: null,
        parent_id: null,
        preferences: {},
        last_login_at: null,
        deleted_at: null,
      });

      if (userError) {
        console.error('User insert error:', userError);
        throw new Error(`사용자 정보 저장 오류: ${userError.message}`);
      }

      // 역할에 따른 대시보드로 리다이렉트
      const redirectPath = {
        ADMIN: '/admin/dashboard',
        TEACHER: '/tutor/dashboard',
        STUDENT: '/student/dashboard',
      }[selectedRole];

      router.push(redirectPath);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('회원가입 중 오류가 발생했습니다');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>회원가입</h1>
          <p>과사람 수학 문제은행에 가입하세요</p>
        </div>

        {step === 1 && (
          <div className="role-selection">
            <h2>역할을 선택하세요</h2>
            <div className="role-options">
              {ROLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="role-option"
                  onClick={() => handleRoleSelect(option.value)}
                >
                  <div className="role-icon">{option.icon}</div>
                  <div className="role-info">
                    <span className="role-label">{option.label}</span>
                    <span className="role-description">{option.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && selectedRole && (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="selected-role-badge">
              {ROLE_OPTIONS.find((r) => r.value === selectedRole)?.icon}
              <span>{ROLE_OPTIONS.find((r) => r.value === selectedRole)?.label}로 가입</span>
              <button type="button" onClick={() => setStep(1)} className="change-role">
                변경
              </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="fullName">이름</label>
              <div className="input-with-icon">
                <User size={18} />
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder="홍길동"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">이메일</label>
              <div className="input-with-icon">
                <Mail size={18} />
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="example@email.com"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">비밀번호</label>
              <div className="input-with-icon">
                <Lock size={18} />
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="8자 이상 입력"
                  minLength={8}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">비밀번호 확인</label>
              <div className="input-with-icon">
                <Lock size={18} />
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="비밀번호를 다시 입력"
                  minLength={8}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="phone">연락처 (선택)</label>
              <div className="input-with-icon">
                <User size={18} />
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="010-1234-5678"
                />
              </div>
            </div>

            {selectedRole === 'STUDENT' && (
              <div className="form-group">
                <label htmlFor="grade">학년</label>
                <select
                  id="grade"
                  name="grade"
                  value={formData.grade}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">학년을 선택하세요</option>
                  <option value="7">중1</option>
                  <option value="8">중2</option>
                  <option value="9">중3</option>
                  <option value="10">고1</option>
                  <option value="11">고2</option>
                  <option value="12">고3</option>
                </select>
              </div>
            )}

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? '가입 중...' : '가입하기'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>
            이미 계정이 있으신가요?{' '}
            <Link href="/auth/login">로그인</Link>
          </p>
        </div>
      </div>

      <style jsx>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          padding: 24px;
        }

        .auth-container {
          width: 100%;
          max-width: 480px;
          background: white;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          padding: 40px;
        }

        .auth-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .auth-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #1e1b4b;
          margin-bottom: 8px;
        }

        .auth-header p {
          color: #6b7280;
          font-size: 14px;
        }

        .role-selection h2 {
          font-size: 16px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 16px;
          text-align: center;
        }

        .role-options {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .role-option {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .role-option:hover {
          border-color: #4f46e5;
          background: #f5f3ff;
        }

        .role-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #eef2ff;
          border-radius: 12px;
          color: #4f46e5;
        }

        .role-info {
          display: flex;
          flex-direction: column;
        }

        .role-label {
          font-size: 16px;
          font-weight: 600;
          color: #1f2937;
        }

        .role-description {
          font-size: 13px;
          color: #6b7280;
          margin-top: 2px;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .selected-role-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: #f5f3ff;
          border-radius: 8px;
          color: #4f46e5;
          font-weight: 500;
        }

        .selected-role-badge .change-role {
          margin-left: auto;
          font-size: 13px;
          color: #6366f1;
          background: none;
          border: none;
          cursor: pointer;
          text-decoration: underline;
        }

        .error-message {
          padding: 12px 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          color: #dc2626;
          font-size: 14px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }

        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-with-icon :global(svg) {
          position: absolute;
          left: 12px;
          color: #9ca3af;
        }

        .input-with-icon input {
          width: 100%;
          padding: 12px 12px 12px 40px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          color: #1f2937;
          transition: border-color 0.2s;
        }

        .input-with-icon input:focus {
          outline: none;
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }

        .form-group select {
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          background: white;
        }

        .form-group select:focus {
          outline: none;
          border-color: #4f46e5;
        }

        .submit-btn {
          padding: 14px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          font-size: 16px;
          font-weight: 600;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .auth-footer {
          margin-top: 24px;
          text-align: center;
        }

        .auth-footer p {
          font-size: 14px;
          color: #6b7280;
        }

        .auth-footer :global(a) {
          color: #4f46e5;
          font-weight: 500;
          text-decoration: none;
        }

        .auth-footer :global(a):hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
