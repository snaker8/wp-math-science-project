// ============================================================================
// /admin/notices — 시스템 공지 관리 (super_admin 만, 레이아웃에서 가드)
// 목록 + 작성/수정/삭제 + 게시/긴급 토글. 대시보드 공지 섹션에 노출.
// 디자인: admin 톤 (bg-black, zinc-800 카드, indigo accent)
// ============================================================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell, Plus, Loader2, AlertTriangle, Trash2, Pencil, Eye, EyeOff, X } from 'lucide-react';

interface Notice {
  id: string;
  title: string;
  body: string | null;
  is_urgent: boolean;
  is_published: boolean;
  created_at: string;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export default function NoticesAdminPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 작성/수정 form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isPublished, setIsPublished] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/notices', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      setNotices(data.notices || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitle('');
    setBody('');
    setIsUrgent(false);
    setIsPublished(true);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (n: Notice) => {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body || '');
    setIsUrgent(n.is_urgent);
    setIsPublished(n.is_published);
    setShowForm(true);
  };

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { title: title.trim(), body: body.trim() || null, is_urgent: isUrgent, is_published: isPublished };
      const res = await fetch(editingId ? `/api/admin/notices/${editingId}` : '/api/admin/notices', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (n: Notice) => {
    try {
      const res = await fetch(`/api/admin/notices/${n.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !n.is_published }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || '실패'); }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '변경 실패');
    }
  };

  const remove = async (n: Notice) => {
    if (!confirm(`"${n.title}" 공지를 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/admin/notices/${n.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || '실패'); }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 p-6">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[.08] bg-white/[.04]">
              <Bell className="h-5 w-5 text-content-tertiary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">공지 관리</h1>
              <p className="text-xs text-zinc-500">대시보드에 노출되는 시스템 공지를 관리합니다.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-full bg-white hover:bg-zinc-200 px-4 py-2 text-sm font-semibold text-black whitespace-nowrap transition-colors"
          >
            <Plus className="h-4 w-4" /> 새 공지
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* 작성/수정 폼 */}
        {showForm && (
          <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold">{editingId ? '공지 수정' : '새 공지 작성'}</h2>
              <button type="button" onClick={resetForm} className="text-zinc-500 hover:text-zinc-200" aria-label="닫기">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목 (필수)"
              className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="상세 내용 (선택 — 입력 시 대시보드에서 클릭하면 모달로 표시)"
              rows={4}
              className="mb-3 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
            <div className="flex items-center gap-4 mb-3 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} className="accent-rose-500" />
                <span className="text-zinc-300">긴급</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="accent-emerald-500" />
                <span className="text-zinc-300">게시(노출)</span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={resetForm} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">취소</button>
              <button
                type="button"
                onClick={save}
                disabled={!title.trim() || saving}
                className="flex items-center gap-1.5 rounded-lg border border-white/[.14] bg-white/[.08] text-content-primary hover:bg-white/[.12] disabled:opacity-50 px-4 py-2 text-sm font-medium"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} 저장
              </button>
            </div>
          </div>
        )}

        {/* 목록 */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
          </div>
        ) : notices.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-500">등록된 공지가 없습니다. “새 공지”로 추가하세요.</div>
        ) : (
          <div className="space-y-2">
            {notices.map((n) => (
              <div
                key={n.id}
                className={`rounded-xl border bg-zinc-900/40 p-4 ${n.is_published ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {n.is_urgent && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">긴급</span>
                      )}
                      {!n.is_published && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-700/40 text-zinc-400 border border-zinc-600/40">미게시</span>
                      )}
                      <span className="text-sm font-medium text-zinc-100">{n.title}</span>
                    </div>
                    {n.body && <p className="mt-1 text-xs text-zinc-500 line-clamp-2 whitespace-pre-wrap">{n.body}</p>}
                    <p className="mt-1 text-[10px] text-zinc-600">{fmt(n.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => togglePublished(n)} title={n.is_published ? '미게시로' : '게시로'} className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                      {n.is_published ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" onClick={() => openEdit(n)} title="수정" className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => remove(n)} title="삭제" className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-rose-900/30 hover:text-rose-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
