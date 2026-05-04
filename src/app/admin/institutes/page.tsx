// ============================================================================
// /admin/institutes — 학원(organizations) + 센터(institutes) 관리 (super_admin 만)
// MVP: CRUD 중 Create + Read. Update/Delete 는 Phase 2 에서.
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { Building2, Plus, Loader2, AlertTriangle, Users } from 'lucide-react';

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
  const [addInstFor, setAddInstFor] = useState<string | null>(null); // organization_id
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

  useEffect(() => {
    reload();
  }, []);

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
      setNewOrgName('');
      setNewOrgSlug('');
      setShowOrgForm(false);
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setOrgBusy(false);
    }
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
      setNewInstName('');
      setAddInstFor(null);
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setInstBusy(false);
    }
  };

  if (permError) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <AlertTriangle className="mx-auto mb-4 text-red-500" size={48} />
        <h1 className="text-xl font-bold text-zinc-800 mb-2">접근 권한 없음</h1>
        <p className="text-zinc-600">이 페이지는 시스템 슈퍼관리자(super_admin)만 접근 가능합니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-800 flex items-center gap-2">
            <Building2 size={24} /> 학원·센터 관리
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            학원(organization) → 센터(institute) 2단계 구조. 슈퍼관리자만 추가 가능.
          </p>
        </div>
        <button
          onClick={() => setShowOrgForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          <Plus size={16} /> 학원 추가
        </button>
      </div>

      {/* 학원 추가 폼 */}
      {showOrgForm && (
        <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <h3 className="font-semibold text-zinc-800 mb-3">새 학원 추가</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="학원명 (예: 외부학원 A)"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={newOrgSlug}
              onChange={(e) => setNewOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              placeholder="slug (영소문자/숫자/하이픈, 예: external-a)"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={createOrg}
              disabled={orgBusy || !newOrgName.trim() || !newOrgSlug.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {orgBusy ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
              추가
            </button>
            <button
              onClick={() => setShowOrgForm(false)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 로딩 / 에러 */}
      {loading && (
        <div className="text-center py-12 text-zinc-500">
          <Loader2 className="mx-auto mb-2 animate-spin" size={24} /> 불러오는 중…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 학원 + 센터 트리 */}
      {!loading && !error && (
        <div className="space-y-4">
          {orgs.length === 0 && <div className="text-zinc-500 text-sm">학원이 없습니다.</div>}
          {orgs.map((org) => {
            const orgInsts = institutes.filter((i) => i.organization_id === org.id);
            const isAdding = addInstFor === org.id;
            return (
              <div key={org.id} className="rounded-xl border border-zinc-200 bg-white">
                {/* 학원 헤더 */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-100">
                  <div>
                    <div className="font-bold text-zinc-800">{org.name}</div>
                    <div className="text-xs text-zinc-500 font-mono">slug: {org.slug}</div>
                    <div className="text-xs text-zinc-500 mt-1 flex items-center gap-3">
                      <span>등급: {org.subscription_tier}</span>
                      <span>센터 {org.instituteCount}개</span>
                      <span>멤버 {org.memberCount}명</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setAddInstFor(isAdding ? null : org.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    <Plus size={14} /> 센터 추가
                  </button>
                </div>

                {/* 센터 추가 폼 */}
                {isAdding && (
                  <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-100 flex gap-2">
                    <input
                      type="text"
                      value={newInstName}
                      onChange={(e) => setNewInstName(e.target.value)}
                      placeholder="센터명 (예: 자사관, 고등관)"
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => createInstitute(org.id)}
                      disabled={instBusy || !newInstName.trim()}
                      className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                    >
                      {instBusy ? <Loader2 className="animate-spin" size={14} /> : '추가'}
                    </button>
                    <button
                      onClick={() => { setAddInstFor(null); setNewInstName(''); }}
                      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
                    >
                      취소
                    </button>
                  </div>
                )}

                {/* 센터 목록 */}
                <div className="divide-y divide-zinc-100">
                  {orgInsts.length === 0 && (
                    <div className="px-4 py-3 text-sm text-zinc-400 italic">센터 없음</div>
                  )}
                  {orgInsts.map((inst) => (
                    <div key={inst.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="font-medium text-zinc-700">{inst.name}</div>
                      <div className="text-xs text-zinc-500 flex items-center gap-1">
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
