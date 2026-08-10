'use client';

import React, { useState } from 'react';
import Link from 'next/link';

import { useRouter } from 'next/navigation';
import { ArrowRight, User, Lock, Loader2, AlertCircle, Building2 } from 'lucide-react';
import { BrandLogo } from '@/components/brand/Logo';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();

  // ★ 개발 중 로그인 비활성화
  React.useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEV_SKIP_AUTH === 'true') {
      router.replace('/dashboard');
    }
  }, [router]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginType, setLoginType] = useState<'student' | 'teacher' | 'parent'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // ★ URL ?org=<id> 학원 표시 — 학원이 자기 사용자들에게 전용 로그인 URL 공유.
  //   useSearchParams 대신 window.location.search 사용해 Suspense boundary 회피.
  const [orgInfo, setOrgInfo] = useState<{ id: string; name: string } | null>(null);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const orgId = params.get('org');
    if (!orgId) return;
    (async () => {
      try {
        const res = await fetch(`/api/organizations/${orgId}/public`);
        const data = await res.json();
        if (res.ok && data.organization) {
          setOrgInfo(data.organization);
        }
      } catch (e) {
        console.warn('[Login] organization fetch 실패:', e);
      }
    })();
  }, []);

  // 학생 탭: 전화번호 입력 → 숫자만 추출 → `<digits>@local.suzag.com` 로그인 ID 변환.
  // 강사·학부모: 이메일 그대로 사용.
  const resolveLoginEmail = (rawInput: string, type: typeof loginType): string => {
    if (type !== 'student') return rawInput.trim();
    const digits = rawInput.replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 11) {
      return `${digits}@local.suzag.com`;
    }
    // 학생 탭이지만 이메일 형식으로 입력한 경우엔 그대로 시도 (역호환)
    return rawInput.trim();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Supabase가 설정되지 않은 경우 Mock 모드
    if (!isSupabaseConfigured || !supabaseBrowser) {
      console.warn('[Auth] Supabase not configured, using mock login');
      setTimeout(() => {
        setIsLoading(false);
        navigateByRole(loginType);
      }, 1000);
      return;
    }

    try {
      // 학생 탭일 때 전화번호 → 이메일 변환
      const loginEmail = resolveLoginEmail(email, loginType);

      // Supabase Auth로 로그인
      const { data, error: authError } = await supabaseBrowser.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (authError) {
        throw authError;
      }

      if (!data.user) {
        throw new Error('로그인에 실패했습니다.');
      }

      // 사용자 역할 조회 (users 테이블에서)
      const { data: userData, error: userError } = await supabaseBrowser
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (userError) {
        console.error('[Auth] Failed to fetch user role:', userError);
        // 역할을 찾지 못해도 선택된 타입으로 이동
        navigateByRole(loginType);
        return;
      }

      // 역할에 따라 라우팅
      const role = userData?.role?.toLowerCase() || loginType;
      navigateByRole(role as typeof loginType);

    } catch (err: unknown) {
      console.error('[Auth] Login error:', err);
      const errorMessage = err instanceof Error ? err.message : '로그인에 실패했습니다.';

      // 한국어 에러 메시지 변환 — 학생 탭이면 '전화번호' 표현 사용
      const idLabel = loginType === 'student' ? '전화번호' : '이메일';
      if (errorMessage.includes('Invalid login credentials')) {
        setError(`${idLabel} 또는 비밀번호가 올바르지 않습니다.`);
      } else if (errorMessage.includes('Email not confirmed')) {
        setError(loginType === 'student'
          ? '계정 활성화가 필요합니다. 학원 관리자에게 문의하세요.'
          : '이메일 인증이 필요합니다. 이메일을 확인해주세요.');
      } else if (errorMessage.toLowerCase().includes('already')) {
        setError(`이미 등록된 ${idLabel} 입니다.`);
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const navigateByRole = (role: string) => {
    let path = '/dashboard';
    switch (role) {
      case 'student':
        // /student 목업 랜딩 대신 실데이터 대시보드로 직행 (P0)
        path = '/student/dashboard';
        break;
      case 'parent':
        path = '/parent';
        break;
      case 'teacher':
      case 'admin':
      default:
        path = '/dashboard';
        break;
    }
    // 전체 페이지 이동으로 쿠키가 미들웨어에 제대로 전달되도록
    window.location.href = path;
  };

  return (
    // ★ min-h-[100dvh] — min-h-screen 은 iOS 사파리 주소창 때문에 첫 화면이 튄다.
    // ★ 배경은 zinc-950. 순수 검정(#000)이면 카드와 배경의 깊이 차가 사라진다.
    //   인디고 방사형 글로우는 제거 — 브랜드 색은 버튼에서만 쓴다.
    <div className="min-h-[100dvh] bg-zinc-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Logo */}
      <div
        className="mb-8 text-center"
      >
        <BrandLogo size="xl" showTagline />

        {/* 학원 표시 — URL ?org=<id> 로 진입 시 */}
        {orgInfo && (
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
            <Building2 size={14} className="text-indigo-400" />
            <span className="text-[11px] uppercase tracking-wider text-zinc-500">학원</span>
            <span className="text-sm font-bold text-indigo-300">{orgInfo.name}</span>
          </div>
        )}
      </div>

      {/* Login Card */}
      <div
        className="w-full max-w-md bg-zinc-900/60 border border-white/10 rounded-2xl p-8"
      >
        {/* Type Switcher — 반경 규칙: 카드 2xl(16px) / 그 안의 조작요소 전부 lg(8px) */}
        <div className="flex bg-zinc-950/60 p-1 rounded-lg mb-8 border border-white/5">
          {[
            { id: 'student', label: '학생' },
            { id: 'parent', label: '학부모' },
            { id: 'teacher', label: '선생님' }
          ].map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setLoginType(type.id as 'student' | 'teacher' | 'parent')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${loginType === type.id
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
                }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm"
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            {/* ★ 학생 탭은 실제로 전화번호를 받는데 라벨이 'Email' 이라 어긋났었다 */}
            <label className="text-xs font-bold text-zinc-400 ml-1">
              {loginType === 'student' ? '전화번호' : '이메일'}
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type={loginType === 'student' ? 'tel' : 'email'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={loginType === 'student' ? '010-1234-5678 또는 01012345678' : '이메일을 입력하세요'}
                required
                className="w-full bg-zinc-950/60 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-colors"
              />
            </div>
            {loginType === 'student' && (
              <p className="text-[11px] text-zinc-500 ml-1">
                하이픈 입력해도 OK. 초기 비밀번호 <strong className="text-indigo-400">123456</strong> → 로그인 후 변경 권장.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 ml-1">비밀번호</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                required
                className="w-full bg-zinc-950/60 border border-white/10 rounded-lg py-3 pl-12 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-zinc-900 flex items-center justify-center gap-2 group"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                <span>로그인</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center space-y-3">
          {/* ★ 예전엔 href="#" 죽은 링크였다 — 눌러도 아무 일이 없어 사용자가 헤맴.
              비밀번호 재설정은 학원이 처리하는 구조(학생 초기 비번 발급)라, 링크 대신
              실제 해결 경로를 안내한다. 셀프 재설정 페이지가 생기면 그때 링크로 되돌린다. */}
          <p className="text-xs text-zinc-500">
            비밀번호를 잊으셨다면 학원으로 문의해 주세요.
          </p>
          <div className="pt-4 border-t border-white/10">
            <p className="text-sm text-zinc-500">
              아직 계정이 없으신가요?{' '}
              <Link href="/auth/signup" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                회원가입
              </Link>
            </p>
          </div>
          {!isSupabaseConfigured && (
            <p className="text-xs text-amber-500/70">
              ⚠️ Demo 모드 - Supabase 미연결
            </p>
          )}
        </div>
      </div>

      <footer className="absolute bottom-6 text-center">
        <p className="text-[10px] text-zinc-700">© 2026 Math×Sci Bank. All rights reserved.</p>
      </footer>
    </div>
  );
}
