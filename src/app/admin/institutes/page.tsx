// ============================================================================
// /admin/institutes — 학원(organizations) + 센터(institutes) 관리 (super_admin 만)
// Create + Read + Delete(소프트).
// ★ 삭제는 실삭제가 아니다 — deleted_at 만 찍어 목록에서 감춘다.
//   institutes 를 가리키는 FK 상당수가 CASCADE 라 실제로 지우면
//   그 센터의 시험지·반·명단·성적이 함께 사라진다 (2026-09-02 실측).
// 디자인: admin/staff 톤 (bg-black, zinc-800 카드, indigo accent)
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import {
  Building2, Plus, Loader2, AlertTriangle, Users, Layers, Trash2,
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
  report_style?: 'legacy' | 'unified';
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

  // ── 삭제 (센터 / 학원) ──
  //   ★ 실제로 지우지 않는다. 서버가 deleted_at 만 찍어 목록에서 감춘다.
  //     시험지·명단·성적은 그대로 남는다 (institutes FK 상당수가 CASCADE 라 실삭제하면 날아간다).
  //   서버가 딸린 자료가 있으면 409 + 개수를 돌려준다 → 그걸 보여주고 한 번 더 확인받는다.
  const deleteEntity = async (kind: 'institutes' | 'organizations', id: string, name: string) => {
    const label = kind === 'institutes' ? '센터' : '학원';
    const call = (force: boolean) =>
      fetch(`/api/admin/tenancy/${kind}?id=${encodeURIComponent(id)}${force ? '&force=1' : ''}`,
        { method: 'DELETE' });

    // ★ 반드시 묻고 나서 지운다. force 없이 호출해도 딸린 게 없으면 서버가 바로 지우므로,
    //   첫 확인을 먼저 받아야 한다 (안 그러면 "확인 전에 이미 삭제됨").
    if (!confirm(`${label} "${name}" 을(를) 삭제할까요?`)) return;

    setInstBusy(true);
    try {
      let res = await call(false);
      let json = await res.json().catch(() => ({}));

      // 딸린 자료가 있으면 서버가 409 + 개수 → 무엇이 걸리는지 보여주고 한 번 더 확인
      if (res.status === 409 && json.needsConfirm) {
        const detail = json.attached
          ? Object.entries(json.attached as Record<string, number>)
              .filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(' · ')
          : (json.centers as string[] | undefined)?.join(', ') ?? '';
        const ok = confirm(
          `"${name}" 에 딸린 것이 있습니다.\n\n${detail}\n\n` +
          `자료는 지워지지 않고 함께 감춰집니다. 계속할까요?`
        );
        if (!ok) return;
        res = await call(true);
        json = await res.json().catch(() => ({}));
      }

      if (!res.ok) throw new Error(json.error || '삭제 실패');
      reload();
    } catch (e) { alert((e as Error).message); }
    finally { setInstBusy(false); }
  };

  // 센터별 리포트 스타일 변경 (legacy=기존 인디고 / unified=학부모공유 warm 톤)
  const updateReportStyle = async (instId: string, style: 'legacy' | 'unified') => {
    setInstitutes((prev) =>
      prev.map((i) => (i.id === instId ? { ...i, report_style: style } : i))
    );
    try {
      const res = await fetch('/api/admin/tenancy/institutes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: instId, report_style: style }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || '변경 실패');
      }
    } catch (e) {
      alert((e as Error).message);
      reload(); // 실패 시 서버 상태로 원복
    }
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
            <div className="w-10 h-10 rounded-xl bg-white/[.04] border border-white/[.08] flex items-center justify-center">
              <Building2 className="text-content-secondary" size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">학원·센터 관리</h1>
              <p className="text-xs text-zinc-500 mt-0.5">학원(organization) → 센터(institute) 2단계 구조 · 슈퍼관리자 전용</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowOrgForm((v) => !v)}
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-white hover:bg-zinc-200 px-4 py-2 text-sm font-semibold text-black transition-colors"
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
        <div className="rounded-xl border border-white/[.08] bg-white/[.03] p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Plus size={14} className="text-content-tertiary" /> 새 학원 추가
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">학원명</label>
              <input
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="예: 외부학원 A"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">slug (URL 식별자)</label>
              <input
                type="text"
                value={newOrgSlug}
                onChange={(e) => setNewOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder="external-a (영소문자/숫자/하이픈)"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none font-mono"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createOrg}
              disabled={orgBusy || !newOrgName.trim() || !newOrgSlug.trim()}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-white/[.14] bg-white/[.08] px-4 py-2 text-sm font-semibold text-content-primary hover:bg-white/[.12] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                    <div className="w-10 h-10 rounded-lg bg-white/[.04] border border-white/[.08] flex items-center justify-center">
                      <Building2 className="text-content-secondary" size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-white">{org.name}</span>
                        <span className="text-[10px] font-mono text-zinc-500 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                          {org.slug}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-content-secondary bg-white/[.04] border border-white/[.08] px-2 py-0.5 rounded">
                          {org.subscription_tier}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 flex items-center gap-3">
                        <span className="flex items-center gap-1"><Layers size={11} /> 센터 {org.instituteCount}개</span>
                        <span className="flex items-center gap-1"><Users size={11} /> 멤버 {org.memberCount}명</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAddInstFor(isAdding ? null : org.id)}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-800 hover:border-white/[.14] hover:bg-white/[.06] px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-content-primary transition-colors"
                    >
                      <Plus size={12} /> 센터 추가
                    </button>
                    <button
                      onClick={() => deleteEntity('organizations', org.id, org.name)}
                      disabled={instBusy}
                      title="학원 삭제 (산하 센터도 함께 감춰집니다. 자료는 남습니다)"
                      className="rounded-lg border border-zinc-800 p-1.5 text-zinc-500 transition-colors hover:border-white/[.14] hover:bg-white/[.06] hover:text-content-primary disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* 센터 추가 폼 */}
                {isAdding && (
                  <div className="px-5 py-3 bg-white/[.03] border-b border-white/[.08] flex gap-2">
                    <input
                      type="text"
                      value={newInstName}
                      onChange={(e) => setNewInstName(e.target.value)}
                      placeholder="센터명 (예: 자사관, 고등관, 초등관)"
                      className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => createInstitute(org.id)}
                      disabled={instBusy || !newInstName.trim()}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-white/[.14] bg-white/[.08] px-4 py-2 text-sm font-semibold text-content-primary hover:bg-white/[.12] disabled:opacity-50 transition-colors"
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
                        <div className="w-8 h-8 rounded-lg bg-white/[.04] border border-white/[.08] flex items-center justify-center">
                          <Layers size={14} className="text-content-secondary" />
                        </div>
                        <div className="text-sm font-medium text-zinc-100">{inst.name}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* 리포트 스타일 토글 */}
                        <div className="flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
                          {(['legacy', 'unified'] as const).map((st) => (
                            <button
                              key={st}
                              onClick={() => updateReportStyle(inst.id, st)}
                              className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors ${
                                (inst.report_style ?? 'legacy') === st
                                  ? 'bg-white/[.08] text-content-primary border border-white/[.14]'
                                  : 'text-zinc-500 hover:text-zinc-300'
                              }`}
                              title={
                                st === 'unified'
                                  ? '리포트를 학부모 공유 톤(warm)으로 통일'
                                  : '기존 인디고 리포트 유지 (동부산 등)'
                              }
                            >
                              {st === 'unified' ? '통일(warm)' : '기존'}
                            </button>
                          ))}
                        </div>
                        <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                          <Users size={12} /> {inst.memberCount}명
                        </div>
                        <button
                          onClick={() => deleteEntity('institutes', inst.id, inst.name)}
                          disabled={instBusy}
                          title="센터 삭제 (자료는 남고 목록에서만 감춰집니다)"
                          className="rounded-lg border border-zinc-800 p-1.5 text-zinc-500 transition-colors hover:border-white/[.14] hover:bg-white/[.06] hover:text-content-primary disabled:opacity-40"
                        >
                          <Trash2 size={13} />
                        </button>
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
    indigo: 'bg-white/[.04] border-white/[.08] text-content-secondary',
    emerald: 'bg-white/[.04] border-white/[.08] text-content-secondary',
    amber: 'bg-white/[.04] border-white/[.08] text-content-secondary',
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
