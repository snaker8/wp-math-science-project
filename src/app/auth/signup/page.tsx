'use client';

import { useState, useEffect } from 'react';
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
  Building2,
} from 'lucide-react';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';
import { BrandLogo } from '@/components/brand/Logo';

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
    instituteId: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── 학원 자유 입력 + 매칭 (B2B 가맹 모델) ──────────────────────────────
  // 사용자가 학원 이름 자유 입력 → /api/organizations/search 로 매칭 시도.
  // 매칭됨   : selectedOrgId 박힘 → 산하 센터 드롭다운 활성화 → 정상 가입
  // 매칭 안됨: applyMode=true → institute_id NULL 가입 + 가맹 신청 INSERT
  // ────────────────────────────────────────────────────────────────────
  const [orgQuery, setOrgQuery] = useState('');
  const [orgCandidates, setOrgCandidates] = useState<Array<{ id: string; name: string }>>([]);
  const [orgSearching, setOrgSearching] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<{ id: string; name: string } | null>(null);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);

  // 선택된 학원의 센터 목록
  const [institutes, setInstitutes] = useState<Array<{ id: string; name: string }>>([]);
  const [institutesLoading, setInstitutesLoading] = useState(false);

  // 가맹 신청 모드 — 학원 매칭 안 됐을 때 토글
  const [applyMode, setApplyMode] = useState(false);
  const [applyInstituteName, setApplyInstituteName] = useState('');

  // 가맹 신청 완료 (step 3 분기)
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);

  // ── 학원 검색 (debounced 300ms) ──
  useEffect(() => {
    let cancelled = false;
    if (selectedOrg) return; // 이미 선택된 상태면 검색 안 함
    const handle = setTimeout(async () => {
      setOrgSearching(true);
      try {
        const q = orgQuery.trim();
        const url = q ? `/api/organizations/search?q=${encodeURIComponent(q)}` : '/api/organizations/search';
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        const all: Array<{ id: string; name: string }> = [];
        if (data.exactMatch) all.push(data.exactMatch);
        if (Array.isArray(data.candidates)) all.push(...data.candidates);
        setOrgCandidates(all);
      } catch (e) {
        if (!cancelled) console.warn('[Signup] org search 실패:', e);
      } finally {
        if (!cancelled) setOrgSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [orgQuery, selectedOrg]);

  // ── 선택된 학원의 센터 fetch ──
  useEffect(() => {
    let cancelled = false;
    if (!selectedOrg) {
      setInstitutes([]);
      setFormData((f) => ({ ...f, instituteId: '' }));
      return;
    }
    setInstitutesLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/institutes/public?organization_id=${selectedOrg.id}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data.institutes)) {
          setInstitutes(data.institutes);
        }
      } catch (e) {
        if (!cancelled) console.warn('[Signup] institutes load 실패:', e);
      } finally {
        if (!cancelled) setInstitutesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedOrg]);

  // 학원 선택 (드롭다운 클릭 또는 정확 일치 자동 선택)
  const pickOrg = (org: { id: string; name: string }) => {
    setSelectedOrg(org);
    setOrgQuery(org.name);
    setOrgDropdownOpen(false);
    setApplyMode(false);
  };

  // 학원 입력 변경 — 선택 해제
  const handleOrgInputChange = (v: string) => {
    setOrgQuery(v);
    if (selectedOrg) {
      setSelectedOrg(null);
      setFormData((f) => ({ ...f, instituteId: '' }));
    }
    setOrgDropdownOpen(true);
    setApplyMode(false);
  };

  // 매칭 안됨 → 가맹 신청 모드 전환
  const enableApplyMode = () => {
    setApplyMode(true);
    setSelectedOrg(null);
    setOrgDropdownOpen(false);
    setFormData((f) => ({ ...f, instituteId: '' }));
  };

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

    // 학원 입력 검증 — 두 흐름 중 하나여야 함
    // (A) 기존 학원 매칭됨 → 정상 가입 (센터는 선택, 사용자 지시: "센터가 없는 학원도 있다")
    // (B) 매칭 안됨 → 가맹 신청 모드 (학원·센터 자유 입력)
    if (!applyMode) {
      if (!selectedOrg) {
        setError('학원을 입력하고 매칭된 학원을 선택해주세요. 매칭이 안 되면 [신규 학원 신청] 으로 진행하실 수 있습니다.');
        return;
      }
      // 센터는 선택 사항 — 단일 센터 운영 학원은 센터 미선택 허용.
    } else {
      if (!orgQuery.trim()) {
        setError('가맹 신청할 학원 이름을 입력해주세요');
        return;
      }
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
      // Supabase Auth로 회원가입
      // ★ public.users 테이블은 on_auth_user_created 트리거가 자동 생성
      //   (auth.users INSERT → handle_new_auth_user() → public.users INSERT)
      //   raw_user_meta_data의 role/full_name/phone/grade를 그대로 읽음
      // 매칭 모드: institute_id 박힘 / 신청 모드: institute_id NULL (가맹 승인 후 결정)
      const instituteIdForSignUp = applyMode ? null : (formData.instituteId || null);

      const { data: authData, error: authError } = await supabaseBrowser.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            role: selectedRole,
            phone: formData.phone || null,
            grade: selectedRole === 'STUDENT' && formData.grade ? parseInt(formData.grade) : null,
            institute_id: instituteIdForSignUp,
          },
        },
      });

      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes('already registered') || msg.includes('user already')) {
          throw new Error('이미 가입된 이메일입니다. 로그인을 시도해주세요.');
        }
        if (msg.includes('password')) {
          throw new Error('비밀번호 규칙을 확인해주세요 (최소 8자).');
        }
        if (msg.includes('email') && msg.includes('invalid')) {
          throw new Error('이메일 형식이 올바르지 않습니다.');
        }
        if (msg.includes('database') || msg.includes('saving')) {
          throw new Error('서버 저장 오류입니다. 잠시 후 다시 시도하거나 관리자에게 문의해주세요.');
        }
        // 원본 에러 메시지 그대로 노출 (디버깅 도움)
        throw new Error(`회원가입 실패: ${authError.message}`);
      }

      if (!authData.user) {
        throw new Error('회원가입 중 오류가 발생했습니다. 다시 시도해주세요.');
      }

      // ★ 안전 장치: 트리거가 실패했을 경우 대비 upsert로 한 번 더 시도
      //   트리거가 성공했으면 on conflict로 no-op, 실패했으면 이제라도 저장됨
      const instituteIdForUpsert = applyMode ? null : (formData.instituteId || null);
      const { error: upsertError } = await supabaseBrowser
        .from('users')
        .upsert(
          {
            id: authData.user.id,
            email: formData.email,
            full_name: formData.fullName,
            phone: formData.phone || null,
            role: selectedRole,
            grade: selectedRole === 'STUDENT' && formData.grade ? parseInt(formData.grade) : null,
            institute_id: instituteIdForUpsert,
            preferences: {},
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );

      if (upsertError) {
        console.warn('[Signup] users upsert 경고 (트리거가 이미 처리했을 가능성):', upsertError.message);
      }

      // ★ 가맹 신청 모드 — organization_applications 에 신청 행 INSERT (super_admin 승인 대기)
      if (applyMode) {
        try {
          const appRes = await fetch('/api/organization-applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              proposed_organization_name: orgQuery.trim(),
              proposed_institute_name: applyInstituteName.trim() || null,
              applicant_role: selectedRole,
              applicant_full_name: formData.fullName,
              applicant_email: formData.email,
              applicant_phone: formData.phone || null,
            }),
          });
          if (!appRes.ok) {
            const err = await appRes.json().catch(() => ({}));
            console.warn('[Signup] 가맹 신청 INSERT 경고:', err);
          }
          setApplicationSubmitted(true);
        } catch (e) {
          console.warn('[Signup] 가맹 신청 INSERT 예외:', e);
          setApplicationSubmitted(true); // 가입은 완료됐으므로 step3 진행
        }
      }

      // 성공 화면 표시
      setStep(3);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '회원가입 중 오류가 발생했습니다';
      console.error('[Signup] 실패:', err);
      setError(msg);
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
          <BrandLogo size="xl" showTagline />
        </Link>
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

              {/* 소속 학원 — 자유 입력 + 매칭 (B2B 가맹 모델) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase ml-1">
                  소속 학원
                </label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none z-10" size={18} />
                  <input
                    type="text"
                    value={orgQuery}
                    onChange={(e) => handleOrgInputChange(e.target.value)}
                    onFocus={() => setOrgDropdownOpen(true)}
                    placeholder="학원명 입력"
                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  {orgSearching && (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin" size={16} />
                  )}
                  {selectedOrg && !orgSearching && (
                    <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400" size={16} />
                  )}

                  {/* 매칭 후보 드롭다운 */}
                  {orgDropdownOpen && !selectedOrg && !applyMode && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-h-64 overflow-y-auto z-20">
                      {orgCandidates.length > 0 ? (
                        <>
                          {orgCandidates.map((org) => (
                            <button
                              key={org.id}
                              type="button"
                              onClick={() => pickOrg(org)}
                              className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-indigo-500/20 transition-colors flex items-center gap-2"
                            >
                              <Building2 size={14} className="text-zinc-500 flex-shrink-0" />
                              <span>{org.name}</span>
                            </button>
                          ))}
                          {orgQuery.trim() && !orgCandidates.some((o) => o.name.trim().toLowerCase() === orgQuery.trim().toLowerCase()) && (
                            <button
                              type="button"
                              onClick={enableApplyMode}
                              className="w-full text-left px-4 py-2.5 text-sm text-amber-400 hover:bg-amber-500/10 transition-colors border-t border-white/10 flex items-center gap-2"
                            >
                              <AlertCircle size={14} className="flex-shrink-0" />
                              <span>{`'${orgQuery.trim()}' (으)로 신규 학원 신청 →`}</span>
                            </button>
                          )}
                        </>
                      ) : orgQuery.trim() ? (
                        <button
                          type="button"
                          onClick={enableApplyMode}
                          className="w-full text-left px-4 py-3 text-sm text-amber-400 hover:bg-amber-500/10 transition-colors flex items-center gap-2"
                        >
                          <AlertCircle size={14} className="flex-shrink-0" />
                          <span>{`'${orgQuery.trim()}' 매칭 없음 — 신규 학원 신청 →`}</span>
                        </button>
                      ) : (
                        <div className="px-4 py-3 text-xs text-zinc-500">학원 이름을 입력하세요</div>
                      )}
                    </div>
                  )}
                </div>

                {/* 학원 선택 후 — 산하 센터 드롭다운 (선택, 사용자 지시: "센터가 없는 학원도 있다") */}
                {selectedOrg && (
                  <div className="space-y-1.5 mt-3">
                    <label className="text-xs font-bold text-zinc-500 uppercase ml-1">
                      센터 <span className="text-zinc-600 normal-case font-normal">(선택)</span>
                    </label>
                    <select
                      name="instituteId"
                      value={formData.instituteId}
                      onChange={handleInputChange}
                      className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                    >
                      <option value="" className="bg-zinc-900">
                        {institutesLoading
                          ? '로딩 중…'
                          : (institutes.length === 0 ? '센터 없이 가입' : '센터 선택 안 함')}
                      </option>
                      {institutes.map((inst) => (
                        <option key={inst.id} value={inst.id} className="bg-zinc-900">
                          {inst.name}
                        </option>
                      ))}
                    </select>
                    {!institutesLoading && institutes.length === 0 && (
                      <p className="text-[11px] text-zinc-500 ml-1">
                        등록된 센터가 없습니다. 센터 없이 그대로 가입 가능합니다.
                      </p>
                    )}
                  </div>
                )}

                {/* 가맹 신청 모드 — 학원·센터 자유 입력 */}
                {applyMode && (
                  <div className="mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                      <AlertCircle size={12} /> 신규 학원 가맹 신청
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      입력하신 학원 <span className="text-amber-300 font-semibold">&ldquo;{orgQuery}&rdquo;</span> 은 아직 시스템에 없습니다.
                      가입은 진행되지만 관리자 승인 후에 서비스를 이용하실 수 있습니다.
                    </p>
                    <input
                      type="text"
                      value={applyInstituteName}
                      onChange={(e) => setApplyInstituteName(e.target.value)}
                      placeholder="센터 이름 (선택)"
                      className="w-full bg-black/50 border border-amber-500/30 rounded-lg py-2 px-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => { setApplyMode(false); setOrgDropdownOpen(true); }}
                      className="text-[11px] text-zinc-500 hover:text-indigo-400 transition-colors"
                    >
                      ← 학원 다시 검색
                    </button>
                  </div>
                )}
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
              className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${
                applicationSubmitted
                  ? 'bg-amber-500/20 border border-amber-500/30'
                  : 'bg-green-500/20 border border-green-500/30'
              }`}
            >
              {applicationSubmitted ? (
                <AlertCircle size={40} className="text-amber-400" />
              ) : (
                <CheckCircle2 size={40} className="text-green-400" />
              )}
            </motion.div>

            {applicationSubmitted ? (
              <>
                <h2 className="text-2xl font-bold text-white mb-3">신청 완료 — 승인 대기</h2>
                <p className="text-zinc-400 text-sm mb-2">
                  <span className="text-indigo-400 font-medium">{formData.fullName}</span>님,
                  가입 신청을 접수했습니다.
                </p>
                <p className="text-zinc-500 text-xs mb-2 leading-relaxed">
                  입력하신 학원 <span className="text-amber-300 font-semibold">&ldquo;{orgQuery}&rdquo;</span> 은
                  본부 관리자 승인 후 활성화됩니다.
                </p>
                <p className="text-zinc-500 text-xs mb-8 leading-relaxed">
                  승인까지 1~2 영업일이 소요될 수 있으며, 승인 완료 시 등록하신 이메일로 안내드립니다.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white mb-3">가입 완료!</h2>
                <p className="text-zinc-400 text-sm mb-2">
                  환영합니다! <span className="text-indigo-400 font-medium">{formData.fullName}</span>님
                </p>
                <p className="text-zinc-500 text-xs mb-8">
                  {isSupabaseConfigured
                    ? '이메일 인증을 완료하면 모든 기능을 이용할 수 있습니다.'
                    : 'Demo 모드에서는 바로 이용 가능합니다.'}
                </p>
              </>
            )}

            <div className="space-y-3">
              {!applicationSubmitted && (
                <button
                  onClick={navigateByRole}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 group"
                >
                  <span>시작하기</span>
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              )}
              <Link
                href="/auth/login"
                className="block w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors py-2"
              >
                {applicationSubmitted ? '닫고 로그인 페이지로' : '로그인 페이지로 이동'}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="absolute bottom-6 text-center">
        <p className="text-[10px] text-zinc-700">© 2026 Math×Sci Bank. All rights reserved.</p>
      </footer>
    </div>
  );
}
