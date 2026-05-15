'use client';

// ============================================================================
// ChangePasswordCard — 본인 비밀번호 변경 카드 (학생/강사/관리자 공통).
// 사용처: /student/profile, /dashboard/settings 등.
// ============================================================================

import React, { useState } from 'react';
import { Lock, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

export function ChangePasswordCard({
  variant = 'dark',
}: {
  /** dark: 학생/플랫폼 다크 톤 / light: 어드민 화이트 톤 (사용처별 선택) */
  variant?: 'dark' | 'light';
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    if (!current) {
      setResult({ kind: 'err', msg: '현재 비밀번호를 입력해주세요' });
      return;
    }
    if (next.length < 6) {
      setResult({ kind: 'err', msg: '새 비밀번호는 6자 이상이어야 합니다' });
      return;
    }
    if (next !== confirm) {
      setResult({ kind: 'err', msg: '새 비밀번호와 확인이 일치하지 않습니다' });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '비밀번호 변경 실패');
      setResult({ kind: 'ok', msg: '비밀번호가 변경되었습니다.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      setResult({ kind: 'err', msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const cardCls = variant === 'dark'
    ? 'bg-zinc-900/50 border-white/10 text-white'
    : 'bg-white border-zinc-200 text-zinc-900';
  const labelCls = variant === 'dark' ? 'text-zinc-400' : 'text-zinc-600';
  const inputCls = variant === 'dark'
    ? 'bg-black/30 border-white/10 text-white placeholder-zinc-600 focus:border-indigo-500'
    : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-indigo-500';

  return (
    <div className={`rounded-2xl border p-6 ${cardCls}`}>
      <div className="flex items-center gap-2 mb-4">
        <Lock size={18} className="text-indigo-400" />
        <h3 className="text-base font-bold">비밀번호 변경</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {[
          { key: 'current' as const, label: '현재 비밀번호', value: current, set: setCurrent, placeholder: '현재 비밀번호 입력' },
          { key: 'next' as const, label: '새 비밀번호', value: next, set: setNext, placeholder: '6자 이상' },
          { key: 'confirm' as const, label: '새 비밀번호 확인', value: confirm, set: setConfirm, placeholder: '동일하게 한 번 더' },
        ].map((f) => (
          <div key={f.key} className="space-y-1">
            <label className={`text-[11px] font-semibold uppercase tracking-wider ${labelCls}`}>
              {f.label}
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.placeholder}
                className={`w-full px-3 py-2 pr-10 rounded-lg border text-sm focus:outline-none ${inputCls}`}
                autoComplete={f.key === 'current' ? 'current-password' : 'new-password'}
              />
              {f.key === 'current' && (
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
          </div>
        ))}

        {result && (
          <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
            result.kind === 'ok'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}>
            {result.kind === 'ok'
              ? <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
              : <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />}
            <span>{result.msg}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !current || !next || !confirm}
          className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
          비밀번호 변경
        </button>
      </form>
    </div>
  );
}
