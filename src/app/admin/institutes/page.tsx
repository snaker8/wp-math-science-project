// ============================================================================
// /admin/institutes — 학원(organizations) + 센터(institutes) 관리 (super_admin 만)
// MVP: CRUD 중 Create + Read. Update/Delete 는 Phase 2.
// 디자인: admin/staff 톤 (bg-black, zinc-800 카드, indigo accent)
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import {
  Building2, Plus, Loader2, AlertTriangle, Users, Layers,
} from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  slug: string;
  subscription_tier: string;
  created_at: string;
  instituteCount: number;
  memberCount: number;
}

interface Institute {
  id: string;
  name: string;
  organization_id: string;
  memberCount: number;
}

export default function InstitutesAdminPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permError, setPermError] = useState(false);

  // 학원 추가 form
  const [showOrgForm, setShowOrgForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [orgBusy, setOrgBusy] = useState(false);

  // 센터 추가 form
  const [addInstFor, setAddInstFor] = useState<string | null>(null);
  const [newInstName, setNewInstName] = useState('');
  const [instBusy, setInstBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRes, instRes] = await Promise.all([
        fetch('/api/admin/tenancy/organizations'),
        fetch('/api/admin/tenancy/institutes'),
      ]);
      if (orgRes.status === 403 || instRes.status === 403) {
        setPermError(true);
        setLoading(false);
        return;
      }
      const orgJson = await orgRes.json();
      const instJson = await instRes.json();
      if (!orgRes.ok) throw new Error(orgJson.error || '학원 조회 실패');
      if (!instRes.ok) throw new Error(instJson.error || '센터 조회 실패');
      setOrgs(orgJson.organizations || []);
      setInstitutes(instJson.institutes || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const createOrg = async () => {
    if (!newOrgName.trim() || !newOrgSlug.trim()) return;
    setOrgBusy(true);
    try {
      const res = await fetch('/api/admin/tenancy/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName.trim(), slug: newOrgSlug.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '생성 실패');
      setNewOrgName(''); setNewOrgSlug(''); setShowOrgForm(false);
      reload();
    } catch (e) { alert((e as Error).message); }
    finally { setOrgBusy(false); }
  };

  const createInstitute = async (organizationId: string) => {
    if (!newInstName.trim()) return;
    setInstBusy(true);
    try {
      const res = await fetch('/api/admin/tenancy/institutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newInstName.trim(), organization_id: organizationId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '생성 실패');
      setNewInstName(''); setAddInstFor(null);
      reload();
    } catch (e) { alert((e as Error).message); }
    finally { setInstBusy(false); }
  };

  if (permError) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 mb-4">
            <AlertTriangle className="text-rose-400" size={28} />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">접근 권한 없음</h1>
          <p className="text-sm text-zinc-400">시스템 슈퍼관리자(super_admin)만 접근 가능합니다.</p>
        </div>
      </div>
    );
  }

  // 통계
  const totalCenters = institutes.length;
  const totalMembers = institutes.reduce((s, i) => s + i.memberCount, 0);

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Building2 className="text-indigo-400" size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">학원·센터 관리</h1>
              <p className="text-xs text-zinc-500 mt-0.5">학원(organization) → 센터(institute) 2단계 구조 · 슈퍼관리자 전용</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowOrgForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          <Plus size={16} /> 학원 추가
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={<Building2 size={18} />} label="학원" value={orgs.length} accent="indigo" />
        <StatCard icon={<Layers size={18} />} label="센터" value={totalCenters} accent="emerald" />
        <StatCard icon={<Users size={18} />} label="총 멤버" value={totalMembers} accent="amber" />
      </div>

      {/* 학원 추가 폼 */}
      {showOrgForm && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Plus size={14} className="text-indigo-400" /> 새 학원 추가
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">학원명</label>
              <input
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="예: 외부학원 A"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">slug (URL 식별자)</label>
              <input
                type="text"
                value={newOrgSlug}
                onChange={(e) => setNewOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder="external-a (영소문자/숫자/하이픈)"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none font-mono"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createOrg}
              disabled={orgBusy || !newOrgName.trim() || !newOrgSlug.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {orgBusy ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />} 추가
            </button>
            <button
              onClick={() => setShowOrgForm(false)}
              className="rounded-lg border border-zinc-800 hover:bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 로딩 / 에러 */}
      {loading && (
        <div className="text-center py-16 text-zinc-500">
          <Loader2 className="mx-auto mb-2 animate-spin" size={28} />
          <div className="text-sm">불러오는 중…</div>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* 학원 + 센터 트리 */}
      {!loading && !error && (
        <div className="space-y-4">
          {orgs.length === 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-12 text-center text-zinc-500 text-sm">
              학원이 없습니다. 우측 상단 &quot;학원 추가&quot; 버튼으로 시작하세요.
            </div>
          )}
          {orgs.map((org) => {
            const orgInsts = institutes.filter((i) => i.organization_id === org.id);
            const isAdding = addInstFor === org.id;
            return (
              <div key={org.id} className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                {/* 학원 헤더 */}
                <div className="flex items-center justify-between p-5 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <Building2 className="text-indigo-400" size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-white">{org.name}</span>
                        <span className="text-[10px] font-mono text-zinc-500 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                          {org.slug}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                          {org.subscription_tier}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 flex items-center gap-3">
                        <span className="flex items-center gap-1"><Layers size={11} /> 센터 {org.instituteCount}개</span>
                        <span className="flex items-center gap-1"><Users size={11} /> 멤버 {org.memberCount}명</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setAddInstFor(isAdding ? null : org.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 hover:border-indigo-500/40 hover:bg-indigo-500/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-indigo-400 transition-colors"
                  >
                    <Plus size={12} /> 센터 추가
                  </button>
                </div>

                {/* 센터 추가 폼 */}
                {isAdding && (
                  <div className="px-5 py-3 bg-indigo-500/5 border-b border-indigo-500/20 flex gap-2">
                    <input
                      type="text"
                      value={newInstName}
                      onChange={(e) => setNewInstName(e.target.value)}
                      placeholder="센터명 (예: 자사관, 고등관, 초등관)"
                      className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => createInstitute(org.id)}
                      disabled={instBusy || !newInstName.trim()}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                    >
                      {instBusy ? <Loader2 className="animate-spin" size={14} /> : '추가'}
                    </button>
                    <button
                      onClick={() => { setAddInstFor(null); setNewInstName(''); }}
                      className="rounded-lg border border-zinc-800 hover:bg-zinc-900 px-3 py-2 text-sm text-zinc-400 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                )}

                {/* 센터 목록 */}
                <div className="divide-y divide-zinc-800/60">
                  {orgInsts.length === 0 && (
                    <div className="px-5 py-6 text-sm text-zinc-600 italic text-center">센터가 없습니다</div>
                  )}
                  {orgInsts.map((inst) => (
                    <div key={inst.id} className="px-5 py-3 flex items-center justify-between hover:bg-zinc-900/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <Layers size={14} className="text-emerald-400" />
                        </div>
                        <div className="text-sm font-medium text-zinc-100">{inst.name}</div>
                      </div>
                      <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                        <Users size={12} /> {inst.memberCount}명
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
function StatCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: number;
  accent: 'indigo' | 'emerald' | 'amber';
}) {
  const map = {
    indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  };
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${map[accent]}`}>
          {icon}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
    </div>
  );
}
