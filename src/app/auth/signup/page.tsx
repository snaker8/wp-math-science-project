'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  User,
  Mail,
  Lock,
  Phone,
  GraduationCap,
  School,
  UserCog,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';

type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

interface RoleOption {
  value: UserRole;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: 'STUDENT',
    label: '학생',
    description: '문제를 풀고 학습 진도를 관리합니다',
    icon: <GraduationCap size={24} />,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    value: 'TEACHER',
    label: '강사',
    description: '반을 만들고 학생들을 관리합니다',
    icon: <School size={24} />,
    color: 'from-indigo-500 to-purple-500',
  },
  {
    value: 'ADMIN',
    label: '관리자',
    description: '학원 전체를 관리합니다',
    icon: <UserCog size={24} />,
    color: 'from-violet-500 to-pink-500',
  },
];

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
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

    // Supabase 미설정 시 Mock 모드
    if (!isSupabaseConfigured || !supabaseBrowser) {
      console.warn('[Auth] Supabase not configured, using mock signup');
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
        setStep(3); // 성공 화면
      }, 1500);
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
        // 한국어 에러 메시지 변환
        if (authError.message.includes('already registered')) {
          throw new Error('이미 가입된 이메일입니다. 로그인을 시도해주세요.');
        }
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
        // RLS 에러 등은 무시하고 진행 (auth trigger로 생성될 수 있음)
        if (!userError.message.includes('duplicate')) {
          console.warn('[Auth] User profile insert failed, but auth user was created');
        }
      }

      // 성공 화면 표시
      setStep(3);
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

  const navigateByRole = () => {
    if (!selectedRole) {
      router.push('/auth/login');
      return;
    }
    const redirectPath = {
      ADMIN: '/dashboard',
      TEACHER: '/dashboard',
      STUDENT: '/student',
    }[selectedRole];
    router.push(redirectPath);
  };

  const selectedRoleOption = ROLE_OPTIONS.find((r) => r.value === selectedRole);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.15),transparent_50%)]" />
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-violet-600/10 rounded-full blur-[128px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10 text-center"
      >
        <Link href="/" className="inline-block">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            과사람 <span className="text-indigo-500">With-People</span>
          </h1>
        </Link>
        <p className="text-zinc-500 text-sm">프리미엄 수학 교육 플랫폼</p>
      </motion.div>

      {/* Main Card */}
      <AnimatePresence mode="wait">
        {/* Step 1: 역할 선택 */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md bg-zinc-900/50 border border-white/10 rounded-2xl p-8 backdrop-blur-xl"
          >
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold text-white mb-2">회원가입</h2>
              <p className="text-zinc-500 text-sm">어떤 역할로 가입하시겠어요?</p>
            </div>

            {/* 진행 바 */}
            <div className="flex gap-2 mb-8">
              <div className="h-1 flex-1 rounded-full bg-indigo-500" />
              <div className="h-1 flex-1 rounded-full bg-zinc-800" />
            </div>

            <div className="space-y-3">
              {ROLE_OPTIONS.map((option) => (
                <motion.button
                  key={option.value}
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleRoleSelect(option.value)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-black/30 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group text-left"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${option.color} flex items-center justify-center text-white shadow-lg`}>
                    {option.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
                      {option.label}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{option.description}</div>
                  </div>
                  <ArrowRight size={18} className="text-zinc-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                </motion.button>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-white/10 text-center">
              <p className="text-sm text-zinc-500">
                이미 계정이 있으신가요?{' '}
                <Link href="/auth/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                  로그인
                </Link>
              </p>
            </div>
          </motion.div>
        )}

        {/* Step 2: 정보 입력 */}
        {step === 2 && selectedRole && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md bg-zinc-900/50 border border-white/10 rounded-2xl p-8 backdrop-blur-xl"
          >
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-white mb-2">정보 입력</h2>
              <p className="text-zinc-500 text-sm">아래 정보를 입력해주세요</p>
            </div>

            {/* 진행 바 */}
            <div className="flex gap-2 mb-6">
              <div className="h-1 flex-1 rounded-full bg-indigo-500" />
              <div className="h-1 flex-1 rounded-full bg-indigo-500" />
            </div>

            {/* 선택된 역할 뱃지 */}
            {selectedRoleOption && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mb-6">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${selectedRoleOption.color} flex items-center justify-center text-white text-sm`}>
                  {selectedRoleOption.icon}
                </div>
                <span className="text-sm font-medium text-indigo-300">{selectedRoleOption.label}로 가입</span>
                <button
                  type="button"
                  onClick={() => { setStep(1); setError(null); }}
                  className="ml-auto text-xs text-zinc-500 hover:text-indigo-400 transition-colors"
                >
                  변경
                </button>
              </div>
            )}

            {/* Error */}
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

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 이름 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1">이름</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    placeholder="홍길동"
                    required
                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* 이메일 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1">이메일</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="example@email.com"
                    required
                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* 비밀번호 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1">비밀번호</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="8자 이상 입력"
                    minLength={8}
                    required
                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* 비밀번호 확인 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1">비밀번호 확인</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder="비밀번호를 다시 입력"
                    minLength={8}
                    required
                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* 연락처 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1">연락처 <span className="text-zinc-700 normal-case">(선택)</span></label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="010-1234-5678"
                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* 학년 (학생만) */}
              {selectedRole === 'STUDENT' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase ml-1">학년</label>
                  <select
                    name="grade"
                    value={formData.grade}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                  >
                    <option value="" className="bg-zinc-900">학년을 선택하세요</option>
                    <option value="7" className="bg-zinc-900">중1</option>
                    <option value="8" className="bg-zinc-900">중2</option>
                    <option value="9" className="bg-zinc-900">중3</option>
                    <option value="10" className="bg-zinc-900">고1</option>
                    <option value="11" className="bg-zinc-900">고2</option>
                    <option value="12" className="bg-zinc-900">고3</option>
                  </select>
                </div>
              )}

              {/* 제출 버튼 */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 group mt-2"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <span>가입하기</span>
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* 뒤로가기 */}
            <button
              type="button"
              onClick={() => { setStep(1); setError(null); }}
              className="w-full mt-4 flex items-center justify-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors py-2"
            >
              <ArrowLeft size={16} />
              <span>역할 다시 선택</span>
            </button>

            <div className="mt-4 pt-4 border-t border-white/10 text-center">
              <p className="text-sm text-zinc-500">
                이미 계정이 있으신가요?{' '}
                <Link href="/auth/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                  로그인
                </Link>
              </p>
            </div>

            {!isSupabaseConfigured && (
              <p className="mt-3 text-center text-xs text-amber-500/70">
                ⚠️ Demo 모드 - Supabase 미연결
              </p>
            )}
          </motion.div>
        )}

        {/* Step 3: 가입 완료 */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, type: 'spring' }}
            className="w-full max-w-md bg-zinc-900/50 border border-white/10 rounded-2xl p-8 backdrop-blur-xl text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center"
            >
              <CheckCircle2 size={40} className="text-green-400" />
            </motion.div>

            <h2 className="text-2xl font-bold text-white mb-3">가입 완료!</h2>
            <p className="text-zinc-400 text-sm mb-2">
              환영합니다! <span className="text-indigo-400 font-medium">{formData.fullName}</span>님
            </p>
            <p className="text-zinc-500 text-xs mb-8">
              {isSupabaseConfigured
                ? '이메일 인증을 완료하면 모든 기능을 이용할 수 있습니다.'
                : 'Demo 모드에서는 바로 이용 가능합니다.'}
            </p>

            <div className="space-y-3">
              <button
                onClick={navigateByRole}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 group"
              >
                <span>시작하기</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <Link
                href="/auth/login"
                className="block w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors py-2"
              >
                로그인 페이지로 이동
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="absolute bottom-6 text-center">
        <p className="text-[10px] text-zinc-700">© 2026 Core Science & Math Institute. All Code Secure.</p>
      </footer>
    </div>
  );
}
