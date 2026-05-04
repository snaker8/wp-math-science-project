// ============================================================================
// /admin/users — 사용자 institute / organization / role 배정 (super_admin 만)
// 디자인: admin/staff 톤 (bg-black, zinc-800 카드, indigo accent)
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { Users, Loader2, AlertTriangle, Save, Pencil, X, Search, Shield } from 'lucide-react';

interface UserRow {
  id: string;
  email: string;
  fullName: string | null;
  role: string | null;
  instituteId: string | null;
  organizationId?: string | null;
}

interface Organization { id: string; name: string }
interface Institute { id: string; name: string; organization_id: string }

const ROLES = ['ADMIN', 'TEACHER', 'TUTOR', 'STUDENT', 'PARENT', 'ORG_ADMIN'] as const;

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  TEACHER: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  TUTOR: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  STUDENT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PARENT: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  ORG_ADMIN: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};

export default function UsersAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permError, setPermError] = useState(false);
  const [search, setSearch] = useState('');

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
        setPermError(true); setLoading(false); return;
      }
      const uJson = await uRes.json();
      const oJson = await oRes.json();
      const iJson = await iRes.json();
      if (!uRes.ok) throw new Error(uJson.error || '사용자 조회 실패');
      if (!oRes.ok) throw new Error(oJson.error || '학원 조회 실패');
      if (!iRes.ok) throw new Error(iJson.error || '센터 조회 실패');
      setUsers(uJson.users || []);
      setOrgs(oJson.organizations || []);
      setInstitutes(iJson.institutes || []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const startEdit = (u: UserRow) => {
    setEditingId(u.id);
    setEditRole(u.role || '');
    const myInst = institutes.find((i) => i.id === u.instituteId);
    setEditInst(u.instituteId || null);
    setEditOrg(u.organizationId || myInst?.organization_id || null);
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
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const cancelEdit = () => {
    setEditingId(null); setEditRole(''); setEditOrg(null); setEditInst(null);
  };

  const getOrgName = (orgId: string | null) => orgs.find((o) => o.id === orgId)?.name || '—';
  const getInstName = (instId: string | null) => institutes.find((i) => i.id === instId)?.name || '—';

  if (permError) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 mb-4">
            <AlertTriangle className="text-rose-400" size={28} />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">접근 권한 없음</h1>
          <p className="text-sm text-zinc-400">시스템 슈퍼관리자(super_admin)만 사용 가능합니다.</p>
        </div>
      </div>
    );
  }

  const filteredInstitutes = editOrg
    ? institutes.filter((i) => i.organization_id === editOrg)
    : institutes;

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.fullName || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Users className="text-indigo-400" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">사용자 배정</h1>
            <p className="text-xs text-zinc-500 mt-0.5">학원·센터·역할 배정 · 슈퍼관리자 전용</p>
          </div>
        </div>
      </div>

      {/* 검색 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이메일 또는 이름 검색…"
            className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
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

      {/* 사용자 테이블 */}
      {!loading && !error && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/50 border-b border-zinc-800">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-zinc-400 text-xs uppercase tracking-wider">이메일</th>
                  <th className="text-left px-4 py-3 font-semibold text-zinc-400 text-xs uppercase tracking-wider">이름</th>
                  <th className="text-left px-4 py-3 font-semibold text-zinc-400 text-xs uppercase tracking-wider">역할</th>
                  <th className="text-left px-4 py-3 font-semibold text-zinc-400 text-xs uppercase tracking-wider">학원</th>
                  <th className="text-left px-4 py-3 font-semibold text-zinc-400 text-xs uppercase tracking-wider">센터</th>
                  <th className="text-right px-4 py-3 font-semibold text-zinc-400 text-xs uppercase tracking-wider w-32">동작</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredUsers.map((u) => {
                  const isEditing = editingId === u.id;
                  const userOrg = u.organizationId
                    || institutes.find((i) => i.id === u.instituteId)?.organization_id
                    || null;
                  return (
                    <tr key={u.id} className={isEditing ? 'bg-indigo-500/5' : 'hover:bg-zinc-900/40 transition-colors'}>
                      <td className="px-4 py-3 text-zinc-200">{u.email}</td>
                      <td className="px-4 py-3 text-zinc-300">{u.fullName || '—'}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">선택…</option>
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : u.role ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${ROLE_BADGE[u.role] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                            {u.role}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editOrg || ''}
                            onChange={(e) => { setEditOrg(e.target.value || null); setEditInst(null); }}
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">없음</option>
                            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-zinc-300 text-xs">{getOrgName(userOrg)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editInst || ''}
                            onChange={(e) => setEditInst(e.target.value || null)}
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                            disabled={!editOrg}
                          >
                            <option value="">없음</option>
                            {filteredInstitutes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-zinc-300 text-xs">{getInstName(u.instituteId)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={saveEdit}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded bg-indigo-500 hover:bg-indigo-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                            >
                              {busy ? <Loader2 className="animate-spin" size={11} /> : <Save size={11} />} 저장
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="inline-flex items-center gap-1 rounded border border-zinc-700 hover:bg-zinc-800 px-2 py-1 text-xs text-zinc-300 transition-colors"
                            >
                              <X size={11} /> 취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(u)}
                            className="inline-flex items-center gap-1 rounded border border-zinc-700 hover:border-indigo-500/40 hover:bg-indigo-500/5 px-2 py-1 text-xs font-medium text-zinc-300 hover:text-indigo-400 transition-colors"
                          >
                            <Pencil size={11} /> 편집
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-zinc-600">
                      <Shield size={32} className="mx-auto mb-2 opacity-30" />
                      <div className="text-sm">{search ? '검색 결과 없음' : '사용자가 없습니다'}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
