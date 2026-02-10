'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight, User, Lock, Loader2, AlertCircle } from 'lucide-react';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginType, setLoginType] = useState<'student' | 'teacher' | 'parent'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
      // Supabase Auth로 로그인
      const { data, error: authError } = await supabaseBrowser.auth.signInWithPassword({
        email,
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

      // 한국어 에러 메시지 변환
      if (errorMessage.includes('Invalid login credentials')) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (errorMessage.includes('Email not confirmed')) {
        setError('이메일 인증이 필요합니다. 이메일을 확인해주세요.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const navigateByRole = (role: string) => {
    switch (role) {
      case 'student':
        router.push('/student');
        break;
      case 'parent':
        router.push('/parent');
        break;
      case 'teacher':
      case 'admin':
      default:
        router.push('/dashboard');
        break;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.15),transparent_50%)]" />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 text-center"
      >
        <h1 className="text-3xl font-bold tracking-tight mb-2">과사람 <span className="text-indigo-500">With-People</span></h1>
        <p className="text-zinc-500 text-sm">프리미엄 수학 교육 플랫폼</p>
      </motion.div>

      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-md bg-zinc-900/50 border border-white/10 rounded-2xl p-8 backdrop-blur-xl"
      >
        {/* Type Switcher */}
        <div className="flex bg-black/50 p-1 rounded-xl mb-8 border border-white/5">
          {[
            { id: 'student', label: '학생' },
            { id: 'parent', label: '학부모' },
            { id: 'teacher', label: '선생님' }
          ].map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setLoginType(type.id as 'student' | 'teacher' | 'parent')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${loginType === type.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'text-zinc-500 hover:text-zinc-300'
                }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm"
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </motion.div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase ml-1">Email</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일을 입력하세요"
                required
                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                required
                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 group"
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
          <a href="#" className="text-xs text-zinc-500 hover:text-indigo-400 transition-colors block">
            계정을 잊으셨나요?
          </a>
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
      </motion.div>

      <footer className="absolute bottom-6 text-center">
        <p className="text-[10px] text-zinc-700">© 2026 Core Science & Math Institute. All Code Secure.</p>
      </footer>
    </div>
  );
}
