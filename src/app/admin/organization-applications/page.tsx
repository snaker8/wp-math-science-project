// ============================================================================
// /admin/organization-applications — 가맹 학원 신청 승인/거부 (super_admin 만)
// 디자인: admin/users 와 동일 톤 (bg-black, zinc-800 카드)
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import {
  Building2, Loader2, AlertTriangle, Check, X, Mail, Phone, User,
  CheckCircle2, XCircle, Clock,
} from 'lucide-react';

interface Application {
  id: string;
  proposed_organization_name: string;
  proposed_institute_name: string | null;
  applicant_user_id: string;
  applicant_role: string | null;
  applicant_full_name: string | null;
  applicant_email: string | null;
  applicant_phone: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  assigned_organization_id: string | null;
  assigned_institute_id: string | null;
  created_at: string;
}

interface Organization {
  id: string;
  name: string;
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

const STATUS_LABEL: Record<Application['status'], string> = {
  pending: '승인 대기',
  approved: '승인됨',
  rejected: '거부됨',
};

const STATUS_BADGE: Record<Application['status'], string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  rejected: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

const STATUS_ICON = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
} as const;

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function OrganizationApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permError, setPermError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');

  // 승인 모달
  const [approving, setApproving] = useState<Application | null>(null);
  const [approveMode, setApproveMode] = useState<'new' | 'existing'>('new');
  const [newOrgName, setNewOrgName] = useState('');
  const [newInstituteName, setNewInstituteName] = useState('');
  const [existingOrgId, setExistingOrgId] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [busy, setBusy] = useState(false);

  // 거부 모달
  const [rejecting, setRejecting] = useState<Application | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [appRes, orgRes] = await Promise.all([
        fetch(`/api/organization-applications?status=${statusFilter}`),
        fetch('/api/admin/tenancy/organizations'),
      ]);
      if (appRes.status === 403) {
        setPermError(true);
        setLoading(false);
        return;
      }
      const appJson = await appRes.json();
      const orgJson = await orgRes.json();
      if (!appRes.ok) throw new Error(appJson.error || '신청 조회 실패');
      setApplications(appJson.applications || []);
      if (orgRes.ok) {
        setOrganizations(orgJson.organizations || []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const openApprove = (app: Application) => {
    setApproving(app);
    setApproveMode('new');
    setNewOrgName(app.proposed_organization_name);
    setNewInstituteName(app.proposed_institute_name || '본원');
    setExistingOrgId('');
    setDecisionNote('');
  };

  const submitApprove = async () => {
    if (!approving) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        action: 'approve',
        decision_note: decisionNote.trim() || undefined,
        new_institute_name: newInstituteName.trim() || undefined,
      };
      if (approveMode === 'existing') {
        if (!existingOrgId) {
          alert('학원을 선택해주세요');
          setBusy(false);
          return;
        }
        payload.assigned_organization_id = existingOrgId;
      } else {
        if (!newOrgName.trim()) {
          alert('새 학원 이름을 입력해주세요');
          setBusy(false);
          return;
        }
        payload.new_organization_name = newOrgName.trim();
      }
      const res = await fetch(`/api/organization-applications/${approving.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '승인 실패');
      setApproving(null);
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitReject = async () => {
    if (!rejecting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/organization-applications/${rejecting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          decision_note: rejectNote.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '거부 실패');
      setRejecting(null);
      setRejectNote('');
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (permError) {
    return (
      <div className="min-h-screen bg-black text-content-primary flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 mb-4">
            <AlertTriangle className="text-rose-400" size={28} />
          </div>
          <h1 className="text-xl font-bold text-content-primary mb-2">접근 권한 없음</h1>
          <p className="text-sm text-zinc-400">시스템 슈퍼관리자(super_admin)만 사용 가능합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-content-primary p-6 space-y-6">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-xl bg-white/[.06] border border-white/[.14] flex items-center justify-center">
            <Building2 className="text-content-secondary" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-content-primary">가맹 학원 신청 관리</h1>
            <p className="text-xs text-zinc-500 mt-0.5">새 학원 가맹 신청을 검토하고 승인/거부합니다 · 슈퍼관리자 전용</p>
          </div>
        </div>
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-1 bg-zinc-950 border border-zinc-800 rounded-xl p-1 w-fit">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === s
                ? 'bg-white/[.1] text-content-primary'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {s === 'pending' && '승인 대기'}
            {s === 'approved' && '승인됨'}
            {s === 'rejected' && '거부됨'}
            {s === 'all' && '전체'}
          </button>
        ))}
      </div>

      {/* 로딩 / 에러 */}
      {loading && (
        <div className="text-center py-16 text-zinc-500">
          <Loader2 className="mx-auto mb-2 animate-spin" size={28} />
          <div className="text-sm">불러오는 중…</div>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div>
      )}

      {/* 신청 목록 */}
      {!loading && !error && (
        <div className="space-y-3">
          {applications.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 text-sm">
              {statusFilter === 'pending' ? '대기 중인 신청이 없습니다.' : '해당 상태의 신청이 없습니다.'}
            </div>
          ) : (
            applications.map((app) => {
              const StatusIcon = STATUS_ICON[app.status];
              return (
                <div
                  key={app.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 p-5"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${STATUS_BADGE[app.status]} inline-flex items-center gap-1`}>
                          <StatusIcon size={10} /> {STATUS_LABEL[app.status]}
                        </span>
                        <span className="text-[11px] text-zinc-500">{fmtDate(app.created_at)}</span>
                      </div>
                      <div className="font-bold text-lg text-content-primary">
                        {app.proposed_organization_name}
                      </div>
                      {app.proposed_institute_name && (
                        <div className="text-xs text-zinc-400 mt-0.5">
                          센터: {app.proposed_institute_name}
                        </div>
                      )}
                    </div>
                    {app.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openApprove(app)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold flex items-center gap-1"
                        >
                          <Check size={12} /> 승인
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejecting(app)}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1"
                        >
                          <X size={12} /> 거부
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 신청자 정보 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-zinc-400 bg-zinc-900/50 rounded-lg p-3">
                    {app.applicant_full_name && (
                      <div className="flex items-center gap-2">
                        <User size={12} /> {app.applicant_full_name}
                        {app.applicant_role && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[.04] text-content-secondary border border-white/[.08]">
                            {app.applicant_role}
                          </span>
                        )}
                      </div>
                    )}
                    {app.applicant_email && (
                      <div className="flex items-center gap-2"><Mail size={12} /> {app.applicant_email}</div>
                    )}
                    {app.applicant_phone && (
                      <div className="flex items-center gap-2"><Phone size={12} /> {app.applicant_phone}</div>
                    )}
                  </div>

                  {/* 결정 메모 */}
                  {app.decision_note && (
                    <div className="mt-3 text-xs text-zinc-400">
                      <span className="text-zinc-500">결정 메모:</span> {app.decision_note}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 승인 모달 */}
      {approving && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={() => !busy && setApproving(null)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-content-primary mb-4">가맹 학원 승인</h2>

            <div className="text-xs text-zinc-400 mb-4 bg-zinc-900/50 rounded-lg p-3">
              신청자: <span className="text-content-primary">{approving.applicant_full_name || approving.applicant_email}</span><br />
              신청 학원: <span className="text-content-primary font-bold">{approving.proposed_organization_name}</span>
            </div>

            {/* 모드 선택 */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 mb-4">
              <button
                type="button"
                onClick={() => setApproveMode('new')}
                className={`flex-1 px-3 py-2 rounded text-xs font-semibold ${approveMode === 'new' ? 'bg-white/[.1] text-content-primary' : 'text-zinc-500'}`}
              >
                신규 학원 생성
              </button>
              <button
                type="button"
                onClick={() => setApproveMode('existing')}
                className={`flex-1 px-3 py-2 rounded text-xs font-semibold ${approveMode === 'existing' ? 'bg-white/[.1] text-content-primary' : 'text-zinc-500'}`}
              >
                기존 학원에 배정
              </button>
            </div>

            {approveMode === 'new' ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase font-semibold ml-1">학원 이름</label>
                  <input
                    type="text"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-content-primary focus:border-white/25 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase font-semibold ml-1">첫 센터 이름</label>
                  <input
                    type="text"
                    value={newInstituteName}
                    onChange={(e) => setNewInstituteName(e.target.value)}
                    placeholder="예: 본원, 동래본원, 동부산센터"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-content-primary focus:border-white/25 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase font-semibold ml-1">기존 학원 선택</label>
                  <select
                    value={existingOrgId}
                    onChange={(e) => setExistingOrgId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-content-primary focus:border-white/25 focus:outline-none"
                  >
                    <option value="">선택하세요</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase font-semibold ml-1">새 센터 이름 (옵션)</label>
                  <input
                    type="text"
                    value={newInstituteName}
                    onChange={(e) => setNewInstituteName(e.target.value)}
                    placeholder="신청자가 배정될 센터 (없으면 기본 '본원')"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-content-primary focus:border-white/25 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="mt-3">
              <label className="text-[11px] text-zinc-500 uppercase font-semibold ml-1">메모 (옵션)</label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="결정 사유·메모"
                rows={2}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-content-primary focus:border-white/25 focus:outline-none resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setApproving(null)}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-white/[.08] bg-white/[.04] text-sm text-content-secondary hover:bg-white/[.06] hover:text-content-primary"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitApprove}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold flex items-center gap-1"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                승인 + 학원/센터 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 거부 모달 */}
      {rejecting && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={() => !busy && setRejecting(null)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-content-primary mb-3">가맹 신청 거부</h2>
            <p className="text-xs text-zinc-400 mb-4">
              신청자에게 거부 사유를 메모로 남길 수 있습니다 (옵션). 신청자 계정은 institute 미배정 상태로 유지됩니다.
            </p>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="거부 사유 (옵션)"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-content-primary focus:border-white/25 focus:outline-none resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-white/[.08] bg-white/[.04] text-sm text-content-secondary hover:bg-white/[.06] hover:text-content-primary"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitReject}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-sm font-semibold flex items-center gap-1"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                거부
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
