'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Cpu, Shield, Activity, Save, RefreshCw,
  Server, Database, MoreHorizontal, Users, UserCheck, UserPlus,
  BookOpen, FileText, Search as SearchIcon, AlertCircle,
} from 'lucide-react';

type Tab = 'general' | 'ai-engine' | 'permissions' | 'logs';

type Role = 'ADMIN' | 'TEACHER' | 'TUTOR' | 'STUDENT' | 'PARENT' | 'ORG_ADMIN';

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  instituteId: string | null;
  isAcademyAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface SystemStats {
  scope: 'platform' | 'institute';
  users: {
    total: number;
    teachers: number;
    students: number;
    parents: number;
    newThisWeek: number;
    activeLast24h: number;
  };
  content: { problems: number; exams: number };
  generatedAt: string;
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: '플랫폼 관리자',
  TEACHER: '강사',
  TUTOR: '보조강사',
  STUDENT: '학생',
  PARENT: '학부모',
  ORG_ADMIN: '학원 관리자',
};

const ROLE_COLOR: Record<Role, string> = {
  ADMIN: 'border border-white/[.14] bg-white/[.08] text-content-primary',
  TEACHER: 'border border-white/[.08] bg-white/[.04] text-content-secondary',
  TUTOR: 'border border-white/[.08] bg-white/[.04] text-content-secondary',
  STUDENT: 'border border-white/[.08] bg-white/[.04] text-content-secondary',
  PARENT: 'border border-white/[.08] bg-white/[.04] text-content-secondary',
  ORG_ADMIN: 'border border-white/[.14] bg-white/[.08] text-content-primary',
};

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('permissions');
  // ★ 해설 생성 PIN (2026-08-28) — 강사의 AI 해설 생성을 승인하는 관리자 PIN
  const [solutionPin, setSolutionPin] = useState('');
  const [solutionPinSaving, setSolutionPinSaving] = useState(false);
  const [solutionPinMsg, setSolutionPinMsg] = useState('');

  const saveSolutionPin = useCallback(async () => {
    if (!/^\d{4,8}$/.test(solutionPin.trim())) {
      setSolutionPinMsg('PIN은 숫자 4~8자리입니다.');
      return;
    }
    setSolutionPinSaving(true);
    setSolutionPinMsg('');
    try {
      const res = await fetch('/api/admin/solution-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: solutionPin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setSolutionPinMsg('저장됐습니다. 강사는 이 PIN 입력 후 해설 생성이 가능합니다.');
      setSolutionPin('');
    } catch (e) {
      setSolutionPinMsg(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSolutionPinSaving(false);
    }
  }, [solutionPin]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // AI Engine state (UI 프로토타입 — 아직 DB 미연동)
  const [variationStrength, setVariationStrength] = useState(50);
  const [difficultySensitivity, setDifficultySensitivity] = useState(75);
  const [ocrPrecision, setOcrPrecision] = useState(90);

  // Real data
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [searchQ, setSearchQ] = useState('');

  const [stats, setStats] = useState<SystemStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const params = new URLSearchParams();
      if (roleFilter !== 'ALL') params.set('role', roleFilter);
      if (searchQ.trim()) params.set('q', searchQ.trim());
      const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      setUsers(j.users ?? []);
      setUserTotal(j.total ?? 0);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : String(e));
    } finally {
      setUsersLoading(false);
    }
  }, [roleFilter, searchQ]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch('/api/admin/system-stats', { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setStats(await res.json());
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'permissions') fetchUsers();
    if (activeTab === 'logs') fetchStats();
  }, [activeTab, fetchUsers, fetchStats]);

  // 검색어 디바운스
  useEffect(() => {
    if (activeTab !== 'permissions') return;
    const t = setTimeout(fetchUsers, 300);
    return () => clearTimeout(t);
  }, [searchQ, roleFilter, activeTab, fetchUsers]);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setHasChanges(false);
    }, 1500);
  };

  const handleSettingChange = (setter: (val: number) => void, val: number) => {
    setter(val);
    setHasChanges(true);
  };

  return (
    <div className="min-h-screen bg-surface-base text-content-primary p-6 md:p-10 pb-24 relative overflow-hidden font-sans">
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />

      <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 relative">
        <div>
          <div className="flex items-center gap-2 text-content-tertiary mb-1">
            <Settings size={18} />
            <span className="text-xs font-bold tracking-widest uppercase">System Control</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">시스템 설정 및 AI 엔진 제어</h1>
          <p className="text-content-tertiary mt-1">플랫폼의 핵심 파라미터와 접근 권한을 관리하는 엔지니어링 워크스페이스입니다.</p>
        </div>

        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-3 rounded-full flex items-center gap-4 z-50 cursor-pointer hover:bg-zinc-200 transition-colors"
            onClick={handleSave}
          >
            <span className="font-semibold text-sm">변경 사항이 있습니다</span>
            <div className="h-4 w-[1px] bg-black/20" />
            <div className="flex items-center gap-2">
              {isSaving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
              <span className="text-sm font-bold uppercase">{isSaving ? '저장 중...' : '저장하기'}</span>
            </div>
          </motion.div>
        )}
      </header>

      <nav className="flex items-center gap-8 border-b border-white/10 mb-8 z-10 relative overflow-x-auto no-scrollbar">
        {[
          { id: 'general', label: 'General', icon: Settings },
          { id: 'ai-engine', label: 'AI Engine', icon: Cpu },
          { id: 'permissions', label: 'Permissions', icon: Shield },
          { id: 'logs', label: 'System Logs', icon: Activity },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`pb-4 flex items-center gap-2 relative transition-colors ${activeTab === tab.id ? 'text-content-primary' : 'text-content-tertiary hover:text-content-secondary'}`}
          >
            <tab.icon size={18} />
            <span className="font-semibold">{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-white"
              />
            )}
          </button>
        ))}
      </nav>

      <main className="z-10 relative min-h-[500px]">
        <AnimatePresence mode="wait">
          {/* --- AI Engine Tab (UI 프로토타입) --- */}
          {activeTab === 'ai-engine' && (
            <motion.div
              key="ai-engine"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              <div className="lg:col-span-12 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-200 flex gap-3 items-start">
                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">UI 프로토타입:</strong> 아래 슬라이더는 아직 실제 AI 파이프라인에 저장·적용되지 않습니다. (추후 <code className="bg-black/30 px-1 rounded">system_settings</code> 테이블 연동 예정)
                </div>
              </div>

              <div className="lg:col-span-4 space-y-8">
                <div className="bg-surface-card/50 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <Cpu size={20} className="text-content-tertiary" />
                    알고리즘 정밀 튜닝
                  </h3>

                  <div className="space-y-8">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-content-secondary">유사 문제 변형 강도</label>
                        <span className="text-xs font-mono tabular-nums text-content-secondary bg-white/[.06] px-2 py-1 rounded">{variationStrength}%</span>
                      </div>
                      <input
                        type="range" min="0" max="100"
                        value={variationStrength}
                        onChange={(e) => handleSettingChange(setVariationStrength, Number(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white"
                      />
                      <p className="text-xs text-content-tertiary leading-relaxed">값이 높을수록 원본 문제의 구조를 더 과감하게 변형합니다. (30~60% 권장)</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-content-secondary">난이도 자동 조절 민감도</label>
                        <span className="text-xs font-mono tabular-nums text-content-secondary bg-white/[.06] px-2 py-1 rounded">{difficultySensitivity}%</span>
                      </div>
                      <input
                        type="range" min="0" max="100"
                        value={difficultySensitivity}
                        onChange={(e) => handleSettingChange(setDifficultySensitivity, Number(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white"
                      />
                      <p className="text-xs text-content-tertiary leading-relaxed">학생의 오답률에 따라 난이도를 얼마나 빠르게 조정할지 결정합니다.</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-content-secondary">OCR 인식 정밀도 (Latency Trade-off)</label>
                        <span className="text-xs font-mono tabular-nums text-content-secondary bg-white/[.06] px-2 py-1 rounded">{ocrPrecision}%</span>
                      </div>
                      <input
                        type="range" min="50" max="100"
                        value={ocrPrecision}
                        onChange={(e) => handleSettingChange(setOcrPrecision, Number(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white"
                      />
                      <p className="text-xs text-content-tertiary leading-relaxed">정밀도를 높이면 처리 속도가 늦어질 수 있습니다. (서술형 문제 권장: 90%+)</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-8">
                <div className="bg-surface-card border border-white/[.08] rounded-2xl p-1 relative overflow-hidden h-full min-h-[400px]">
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
                  <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-content-secondary uppercase">Preview (Mock)</span>
                  </div>
                  <div className="h-full flex items-center justify-center p-8 relative z-10">
                    <div className="grid grid-cols-2 gap-8 w-full max-w-2xl">
                      <div className="bg-surface-base/50 border border-white/10 p-6 rounded-xl backdrop-blur-md">
                        <p className="text-xs text-content-tertiary mb-4 font-mono">INPUT_SOURCE</p>
                        <div className="font-serif text-content-secondary text-lg">f(x) = x² + 2x + 1</div>
                        <div className="mt-4 text-sm text-content-tertiary">Find the derivative f&apos;(x).</div>
                      </div>
                      <motion.div
                        className="bg-white/[.04] border border-white/[.10] p-6 rounded-xl backdrop-blur-md relative"
                        animate={{
                          borderColor: variationStrength > 70 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(99, 102, 241, 0.3)',
                          scale: [1, 1.02, 1],
                        }}
                        transition={{ duration: 0.5 }}
                      >
                        <div className="absolute -top-3 -right-3 border border-white/[.14] bg-surface-raised text-content-primary text-[10px] font-bold px-2 py-1 rounded-full">VARIATION: {variationStrength}%</div>
                        <p className="text-xs text-content-tertiary mb-4 font-mono">OUTPUT_TARGET</p>
                        <motion.div
                          key={variationStrength}
                          initial={{ opacity: 0.5, filter: 'blur(2px)' }}
                          animate={{ opacity: 1, filter: 'blur(0px)' }}
                          className="font-serif text-content-primary text-lg"
                        >
                          {variationStrength < 30 ? "g(t) = t² + 4t + 4" :
                            variationStrength < 70 ? "h(x) = 3x² + 6x + 5" :
                              "k(z) = ln(z² + 2z + 1)"}
                        </motion.div>
                        <div className="mt-4 text-sm text-content-tertiary">
                          {variationStrength < 50 ? "Find the derivative." : "Calculate the critical points."}
                        </div>
                      </motion.div>
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <div className="absolute top-0 right-10 w-[1px] h-full bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                </div>
              </div>
            </motion.div>
          )}

          {/* --- Permissions Tab (실제 데이터) --- */}
          {activeTab === 'permissions' && (
            <motion.div
              key="permissions"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* 필터 바 */}
              <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  {(['ALL', 'ADMIN', 'TEACHER', 'TUTOR', 'STUDENT', 'PARENT'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRoleFilter(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                        roleFilter === r
                          ? 'bg-white/[.08] border-white/[.14] text-content-primary'
                          : 'bg-white/5 border-white/10 text-content-tertiary hover:text-content-secondary'
                      }`}
                    >
                      {r === 'ALL' ? '전체' : ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 min-w-[260px]">
                  <SearchIcon size={16} className="text-content-tertiary" />
                  <input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="이름 또는 이메일로 검색..."
                    className="bg-transparent outline-none text-sm flex-1 placeholder:text-content-tertiary"
                  />
                  <button
                    onClick={fetchUsers}
                    className="text-content-tertiary hover:text-content-primary"
                    title="새로고침"
                  >
                    <RefreshCw size={14} className={usersLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {/* 해설 생성 PIN — 강사의 AI 해설 생성 승인용 (관리자 전용 설정) */}
              <div className="bg-surface-card/50 border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  해설 생성 PIN
                </h3>
                <p className="mt-1 mb-4 text-xs text-content-tertiary">
                  AI 해설 생성(비용 발생)은 관리자 승인 하에 실행됩니다. 관리자는 PIN 없이 생성할 수 있고,
                  강사는 이 PIN을 입력해야 생성할 수 있습니다.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="password"
                    inputMode="numeric"
                    value={solutionPin}
                    onChange={(e) => setSolutionPin(e.target.value)}
                    placeholder="숫자 4~8자리"
                    className="w-44 rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-content-primary placeholder-zinc-600 focus:border-white/[.25] focus:outline-none focus:ring-1 focus:ring-white/[.15]"
                  />
                  <button
                    onClick={saveSolutionPin}
                    disabled={solutionPinSaving}
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
                  >
                    {solutionPinSaving ? '저장 중…' : 'PIN 저장'}
                  </button>
                  {solutionPinMsg && (
                    <span className="text-xs text-content-tertiary">{solutionPinMsg}</span>
                  )}
                </div>
              </div>

              {/* 목록 카드 */}
              <div className="bg-surface-card/50 border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Shield size={20} className="text-content-tertiary" />
                    가입자 목록
                    <span className="text-sm font-normal text-content-tertiary">({userTotal}명)</span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  {usersError && (
                    <div className="p-4 bg-red-500/10 border-b border-red-500/30 text-red-300 text-sm flex items-center gap-2">
                      <AlertCircle size={16} /> {usersError}
                    </div>
                  )}
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 text-content-secondary uppercase text-xs font-bold tracking-wider">
                      <tr>
                        <th className="px-6 py-4">이름 / 이메일</th>
                        <th className="px-6 py-4">역할</th>
                        <th className="px-6 py-4">전화</th>
                        <th className="px-6 py-4">가입일</th>
                        <th className="px-6 py-4">최근 로그인</th>
                        <th className="px-6 py-4 text-right">액션</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {usersLoading && users.length === 0 ? (
                        <tr><td colSpan={6} className="px-6 py-10 text-center text-content-tertiary">로딩 중...</td></tr>
                      ) : users.length === 0 ? (
                        <tr><td colSpan={6} className="px-6 py-10 text-center text-content-tertiary">등록된 사용자가 없습니다.</td></tr>
                      ) : (
                        users.map((u) => (
                          <tr key={u.id} className="group hover:bg-white/[0.02] transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-medium text-content-primary flex items-center gap-2">
                                {u.fullName}
                                {u.isAcademyAdmin && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/[.08] bg-white/[.04] text-content-secondary">학원관리자</span>
                                )}
                              </div>
                              <div className="text-xs text-content-tertiary">{u.email}</div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${ROLE_COLOR[u.role]}`}>
                                {ROLE_LABEL[u.role]}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-content-tertiary text-xs">
                              {u.phone || '—'}
                            </td>
                            <td className="px-6 py-4 text-content-tertiary text-xs">
                              {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                            </td>
                            <td className="px-6 py-4 text-content-tertiary text-xs">
                              {formatRelative(u.lastLoginAt)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button className="text-content-tertiary hover:text-content-primary transition-colors">
                                <MoreHorizontal size={18} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* --- Logs / Stats Tab (실제 데이터) --- */}
          {activeTab === 'logs' && (
            <motion.div
              key="logs"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Activity size={20} className="text-content-tertiary" />
                  플랫폼 현황
                  {stats && (
                    <span className="text-xs font-normal text-content-tertiary">
                      ({stats.scope === 'platform' ? '전체 플랫폼' : '본인 학원'} · {new Date(stats.generatedAt).toLocaleTimeString('ko-KR')} 기준)
                    </span>
                  )}
                </h3>
                <button
                  onClick={fetchStats}
                  className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-lg flex items-center gap-2"
                >
                  <RefreshCw size={14} className={statsLoading ? 'animate-spin' : ''} /> 새로고침
                </button>
              </div>

              {statsError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-center gap-2">
                  <AlertCircle size={16} /> {statsError}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: Users, label: '전체 사용자', value: stats?.users.total, color: 'text-content-secondary', bg: 'bg-white/[.06]' },
                  { icon: UserCheck, label: '강사', value: stats?.users.teachers, color: 'text-content-secondary', bg: 'bg-white/[.06]' },
                  { icon: Users, label: '학생', value: stats?.users.students, color: 'text-content-secondary', bg: 'bg-white/[.06]' },
                  { icon: Users, label: '학부모', value: stats?.users.parents, color: 'text-content-secondary', bg: 'bg-white/[.06]' },
                  { icon: UserPlus, label: '신규 가입 (7일)', value: stats?.users.newThisWeek, color: 'text-content-secondary', bg: 'bg-white/[.06]' },
                  { icon: Activity, label: '활성 (24시간)', value: stats?.users.activeLast24h, color: 'text-content-secondary', bg: 'bg-white/[.06]' },
                  { icon: BookOpen, label: '문제 (문제은행)', value: stats?.content.problems, color: 'text-content-secondary', bg: 'bg-white/[.06]' },
                  { icon: FileText, label: '시험지', value: stats?.content.exams, color: 'text-content-secondary', bg: 'bg-white/[.06]' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-surface-card/50 border border-white/10 rounded-2xl p-5">
                    <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                      <stat.icon size={20} className={stat.color} />
                    </div>
                    <div className="text-2xl font-bold">
                      {statsLoading && stat.value === undefined ? '—' : (stat.value ?? 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-content-tertiary mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-surface-card/50 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Server size={18} className="text-content-tertiary" />
                    <h4 className="font-bold text-sm">API Server</h4>
                    <span className="text-emerald-400 text-xs font-bold ml-auto">● Operational</span>
                  </div>
                  <p className="text-xs text-content-tertiary leading-relaxed">
                    실시간 지표(레이턴시/요청수)는 Vercel 대시보드에서 확인하세요. 별도 메트릭 수집을 연동하면 이 영역에 차트가 표시됩니다.
                  </p>
                </div>
                <div className="bg-surface-card/50 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Database size={18} className="text-content-tertiary" />
                    <h4 className="font-bold text-sm">Database</h4>
                    <span className="text-emerald-400 text-xs font-bold ml-auto">● Supabase</span>
                  </div>
                  <p className="text-xs text-content-tertiary leading-relaxed">
                    Connection Pool 지표는 Supabase 프로젝트 → Database → Reports에서 확인할 수 있습니다.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* --- General Tab --- */}
          {activeTab === 'general' && (
            <motion.div
              key="general"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-[400px] text-content-tertiary"
            >
              <Settings size={48} className="mb-4 opacity-20" />
              <p>General Environment Settings</p>
              <p className="text-xs mt-2">Theme, Localization, and Organization Info (구현 예정)</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
