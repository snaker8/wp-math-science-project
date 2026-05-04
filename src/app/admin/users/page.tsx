// ============================================================================
// /admin/users — 사용자 institute / organization / role 배정 (super_admin 만)
// MVP: 목록 + 인라인 배정 폼
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { Users, Loader2, AlertTriangle, Save, Pencil, X } from 'lucide-react';

interface UserRow {
  id: string;
  email: string;
  fullName: string | null;
  role: string | null;
  instituteId: string | null;
  organizationId?: string | null;
}

interface Organization {
  id: string;
  name: string;
}

interface Institute {
  id: string;
  name: string;
  organization_id: string;
}

const ROLES = ['ADMIN', 'TEACHER', 'TUTOR', 'STUDENT', 'PARENT', 'ORG_ADMIN'] as const;

export default function UsersAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permError, setPermError] = useState(false);

  // 편집 중인 user
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editOrg, setEditOrg] = useState<string | null>(null);
  const [editInst, setEditInst] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [uRes, oRes, iRes] = await Promise.all([
        fetch('/api/admin/users?limit=500'),
        fetch('/api/admin/tenancy/organizations'),
        fetch('/api/admin/tenancy/institutes'),
      ]);
      if (oRes.status === 403 || iRes.status === 403) {
        setPermError(true);
        setLoading(false);
        return;
      }
      const uJson = await uRes.json();
      const oJson = await oRes.json();
      const iJson = await iRes.json();
      if (!uRes.ok) throw new Error(uJson.error || '사용자 조회 실패');
      if (!oRes.ok) throw new Error(oJson.error || '학원 조회 실패');
      if (!iRes.ok) throw new Error(iJson.error || '센터 조회 실패');

      // /api/admin/users 응답엔 organizationId 가 빠져있으니 별도 보강이 필요할 수도 있지만
      // MVP 에선 institute_id 만으로 간접 추정 가능. 추후 보강.
      setUsers(uJson.users || []);
      setOrgs(oJson.organizations || []);
      setInstitutes(iJson.institutes || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const startEdit = (u: UserRow) => {
    setEditingId(u.id);
    setEditRole(u.role || '');
    setEditOrg(u.organizationId || null);
    // institute 의 organization_id 로 추정
    const myInst = institutes.find((i) => i.id === u.instituteId);
    setEditInst(u.instituteId || null);
    if (myInst && !u.organizationId) setEditOrg(myInst.organization_id);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tenancy/users/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: editRole || undefined,
          institute_id: editInst,
          organization_id: editOrg,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '저장 실패');
      setEditingId(null);
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditRole('');
    setEditOrg(null);
    setEditInst(null);
  };

  const getOrgName = (orgId: string | null) => orgs.find((o) => o.id === orgId)?.name || '-';
  const getInstName = (instId: string | null) => institutes.find((i) => i.id === instId)?.name || '-';

  if (permError) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <AlertTriangle className="mx-auto mb-4 text-red-500" size={48} />
        <h1 className="text-xl font-bold text-zinc-800 mb-2">접근 권한 없음</h1>
        <p className="text-zinc-600">이 페이지는 시스템 슈퍼관리자(super_admin)만 사용 가능합니다.</p>
      </div>
    );
  }

  // 편집 중인 row 의 organization 에 속한 institute 만 dropdown
  const filteredInstitutes = editOrg
    ? institutes.filter((i) => i.organization_id === editOrg)
    : institutes;

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-800 flex items-center gap-2">
          <Users size={24} /> 사용자 관리
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          사용자의 학원·센터·역할 배정. 슈퍼관리자만 변경 가능.
        </p>
      </div>

      {loading && (
        <div className="text-center py-12 text-zinc-500">
          <Loader2 className="mx-auto mb-2 animate-spin" size={24} /> 불러오는 중…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">이메일</th>
                <th className="text-left px-4 py-3 font-semibold">이름</th>
                <th className="text-left px-4 py-3 font-semibold">역할</th>
                <th className="text-left px-4 py-3 font-semibold">학원</th>
                <th className="text-left px-4 py-3 font-semibold">센터</th>
                <th className="text-right px-4 py-3 font-semibold w-32">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map((u) => {
                const isEditing = editingId === u.id;
                const userOrg = u.organizationId || institutes.find((i) => i.id === u.instituteId)?.organization_id || null;
                return (
                  <tr key={u.id} className={isEditing ? 'bg-orange-50' : ''}>
                    <td className="px-4 py-3 text-zinc-700">{u.email}</td>
                    <td className="px-4 py-3 text-zinc-700">{u.fullName || '-'}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="rounded border border-zinc-300 px-2 py-1 text-sm"
                        >
                          <option value="">선택…</option>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium">
                          {u.role || '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editOrg || ''}
                          onChange={(e) => {
                            setEditOrg(e.target.value || null);
                            setEditInst(null); // 학원 바뀌면 센터 초기화
                          }}
                          className="rounded border border-zinc-300 px-2 py-1 text-sm"
                        >
                          <option value="">없음</option>
                          {orgs.map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-zinc-700">{getOrgName(userOrg)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editInst || ''}
                          onChange={(e) => setEditInst(e.target.value || null)}
                          className="rounded border border-zinc-300 px-2 py-1 text-sm"
                          disabled={!editOrg}
                        >
                          <option value="">없음</option>
                          {filteredInstitutes.map((i) => (
                            <option key={i.id} value={i.id}>{i.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-zinc-700">{getInstName(u.instituteId)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={saveEdit}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded bg-orange-600 px-2 py-1 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
                            저장
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                          >
                            <X size={12} /> 취소
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(u)}
                          className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          <Pencil size={12} /> 편집
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-zinc-400">사용자 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
