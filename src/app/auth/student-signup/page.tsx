'use client';

// /auth/student-signup — 학생 스스로 가입 (QR 을 찍었는데 계정이 없을 때).
//   2026-11-28 대표: 「이름 · 학원명 · 아이디 · 비번 · 학부모 전화번호, 매쓰홀릭과 같게」
//   학원에 접두어가 있으면 아이디 = 접두어+이름(동부산과사람 = EDG홍길동, 학생이 치지 않음),
//   없으면 학생 휴대폰 번호가 아이디. 가입하면 바로 로그인해서 ?redirect(QR 주소)로 돌아간다.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface Inst { id: string; label: string; prefix: string | null }

const QR_PATH = /^\/q\/[0-9a-fA-F-]{36}$/;
const digits = (v: string) => v.replace(/\D/g, '');

function readRedirect(): string | null {
  if (typeof window === 'undefined') return null;
  const r = new URLSearchParams(window.location.search).get('redirect');
  return r && QR_PATH.test(r) ? r : null;
}

export default function StudentSignupPage() {
  const [insts, setInsts] = useState<Inst[]>([]);
  const [name, setName] = useState('');
  const [instId, setInstId] = useState('');
  const [suffix, setSuffix] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirect, setRedirect] = useState<string | null>(null);

  useEffect(() => {
    setRedirect(readRedirect());
    fetch('/api/student-signup').then((r) => r.json()).then((d) => setInsts(d.institutes || [])).catch(() => setInsts([]));
  }, []);

  const inst = insts.find((i) => i.id === instId) || null;
  const cleanName = name.normalize('NFC').replace(/\s+/g, '');
  const loginIdPreview = useMemo(() => {
    if (!inst) return '';
    if (inst.prefix) return `${inst.prefix}${cleanName}${suffix}`;
    return digits(studentPhone);
  }, [inst, cleanName, suffix, studentPhone]);

  const loginHref = `/auth/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw !== pw2) { setError('비밀번호가 서로 다릅니다'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/student-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, instituteId: instId, suffix, studentPhone, password: pw, parentPhone }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.suggestSuffix && !suffix) setSuffix(String(d.suggestSuffix));
        throw new Error(d.error || '가입에 실패했습니다');
      }
      if (!supabaseBrowser) throw new Error('로그인 설정이 없습니다');
      const { error: signErr } = await supabaseBrowser.auth.signInWithPassword({ email: d.email, password: pw });
      if (signErr) throw new Error('가입은 됐지만 로그인에 실패했습니다. 로그인 화면에서 다시 해 주세요');
      window.location.href = redirect || '/student/assignments';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:border-gray-900';
  const labelCls = 'mb-1.5 block text-sm font-semibold text-gray-700';

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-5 py-8">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold text-gray-900">학생 가입</h1>
        <p className="mt-1 text-sm text-gray-500">가입하면 바로 학습지를 풀 수 있어요.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className={labelCls}>이름</label>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" autoComplete="name" required />
          </div>
          <div>
            <label className={labelCls}>학원</label>
            <select className={field} value={instId} onChange={(e) => { setInstId(e.target.value); setSuffix(''); }} required>
              <option value="">학원을 고르세요</option>
              {insts.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </div>

          {inst && !inst.prefix && (
            <div>
              <label className={labelCls}>아이디 (학생 휴대폰 번호)</label>
              <input className={field} value={studentPhone} onChange={(e) => setStudentPhone(e.target.value)} inputMode="numeric" placeholder="010-0000-0000" required />
            </div>
          )}

          {inst && (
            <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-gray-200">
              <p className="text-xs font-medium text-gray-500">내 아이디</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-bold text-gray-900">{loginIdPreview || '—'}</span>
                {inst.prefix && (
                  <input
                    className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    value={suffix}
                    onChange={(e) => setSuffix(digits(e.target.value).slice(0, 2))}
                    inputMode="numeric"
                    placeholder="숫자"
                    aria-label="같은 이름이 있을 때 붙일 숫자"
                  />
                )}
              </div>
              {inst.prefix && <p className="mt-1 text-xs text-gray-400">같은 이름의 학생이 이미 있으면 뒤에 숫자를 붙여요.</p>}
            </div>
          )}

          <div>
            <label className={labelCls}>비밀번호</label>
            <input className={field} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="4자 이상" required />
          </div>
          <div>
            <label className={labelCls}>비밀번호 확인</label>
            <input className={field} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
          </div>
          <div>
            <label className={labelCls}>학부모 전화번호</label>
            <input className={field} value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} inputMode="numeric" placeholder="010-0000-0000" required />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={busy || !inst}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3.5 text-base font-semibold text-white disabled:opacity-40">
            {busy && <Loader2 size={18} className="animate-spin" />}
            {redirect ? '가입하고 바로 풀기' : '가입하기'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          이미 아이디가 있나요? <Link href={loginHref} className="font-semibold text-gray-900 underline">로그인</Link>
        </p>
      </div>
    </main>
  );
}
