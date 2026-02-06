'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Mail, Lock, LogIn, Loader2 } from 'lucide-react';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!supabaseBrowser) {
      setError('Supabase가 설정되지 않았습니다');
      return;
    }

    setLoading(true);

    try {
      // 1. Supabase Auth로 로그인
      const { data: authData, error: authError } = await supabaseBrowser.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error('로그인 중 오류가 발생했습니다');
      }

      // 2. 사용자 역할 조회
      const { data: userData, error: userError } = await supabaseBrowser
        .from('users')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (userError || !userData) {
        throw new Error('사용자 정보를 찾을 수 없습니다');
      }

      // 3. last_login_at 업데이트
      await supabaseBrowser
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', authData.user.id);

      // 4. 역할에 따른 리다이렉트
      const dashboardPaths: Record<string, string> = {
        ADMIN: '/admin/dashboard',
        TEACHER: '/tutor/dashboard',
        TUTOR: '/tutor/dashboard',
        STUDENT: '/student/dashboard',
        PARENT: '/parent/dashboard',
      };

      let targetPath = '/dashboard';

      if (redirect && !redirect.startsWith('/auth')) {
        targetPath = redirect;
      } else if (userData.role && dashboardPaths[userData.role]) {
        targetPath = dashboardPaths[userData.role];
      }

      // 세션이 완전히 설정될 때까지 잠시 대기 후 리다이렉트
      await new Promise(resolve => setTimeout(resolve, 500));
      window.location.href = targetPath;
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('로그인 중 오류가 발생했습니다');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="logo-icon">
            <LogIn size={32} />
          </div>
          <h1>로그인</h1>
          <p>과사람 수학 문제은행에 오신 것을 환영합니다</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

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
                autoComplete="email"
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
                placeholder="비밀번호를 입력하세요"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="form-actions">
            <Link href="/auth/forgot-password" className="forgot-password">
              비밀번호를 잊으셨나요?
            </Link>
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            아직 계정이 없으신가요?{' '}
            <Link href="/auth/signup">회원가입</Link>
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
          max-width: 420px;
          background: white;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          padding: 40px;
        }

        .auth-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .logo-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          border-radius: 16px;
          color: white;
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

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
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

        .form-actions {
          display: flex;
          justify-content: flex-end;
        }

        .forgot-password {
          font-size: 13px;
          color: #6366f1;
          text-decoration: none;
        }

        .forgot-password:hover {
          text-decoration: underline;
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

function LoginLoading() {
  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="loading-state">
          <Loader2 className="animate-spin" size={32} />
          <p>로딩 중...</p>
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
          max-width: 420px;
          background: white;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          padding: 40px;
        }
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          color: #6b7280;
        }
        .loading-state :global(.animate-spin) {
          animation: spin 1s linear infinite;
          color: #4f46e5;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
