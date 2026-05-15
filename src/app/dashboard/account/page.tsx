'use client';

// ============================================================================
// /dashboard/account — 강사·관리자용 계정 설정 (현재는 비밀번호 변경)
// 학생은 /student/profile 에서 같은 카드 사용.
// 후속: 이메일·전화번호 표시·변경, 알림 설정 등 추후 보강.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { User, Mail, Phone, Building2, Shield } from 'lucide-react';
import { ChangePasswordCard } from '@/components/account/ChangePasswordCard';
import { supabaseBrowser } from '@/lib/supabase/client';

interface MeInfo {
  email: string | null;
  fullName: string | null;
  role: string | null;
  isSuperAdmin: boolean;
  instituteName: string | null;
  organizationName: string | null;
}

export default function AccountPage() {
  const [me, setMe] = useState<MeInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabaseBrowser) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const { data: { user } } = await supabaseBrowser.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        const isSuperAdmin =
          user.app_metadata?.super_admin === true ||
          user.user_metadata?.super_admin === true;
        const { data: row } = await supabaseBrowser
          .from('users')
          .select('full_name, role, institute_id')
          .eq('id', user.id)
          .maybeSingle();
        const userRow = row as { full_name?: string; role?: string; institute_id?: string } | null;
        let instituteName: string | null = null;
        let organizationName: string | null = null;
        if (userRow?.institute_id) {
          const { data: inst } = await supabaseBrowser
            .from('institutes')
            .select('name, organization_id')
            .eq('id', userRow.institute_id)
            .maybeSingle();
          const instRow = inst as { name?: string; organization_id?: string } | null;
          instituteName = instRow?.name ?? null;
          if (instRow?.organization_id) {
            const { data: org } = await supabaseBrowser
              .from('organizations')
              .select('name')
              .eq('id', instRow.organization_id)
              .maybeSingle();
            organizationName = (org as { name?: string } | null)?.name ?? null;
          }
        }
        if (!cancelled) {
          setMe({
            email: user.email ?? null,
            fullName: userRow?.full_name ?? null,
            role: userRow?.role ?? null,
            isSuperAdmin,
            instituteName,
            organizationName,
          });
        }
      } catch (e) {
        console.warn('[account] load 실패:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-surface-base text-content-primary p-6 md:p-10 pb-24">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <User className="text-indigo-400" size={22} />
            내 계정
          </h1>
          <p className="text-content-tertiary text-sm mt-1">
            본인 계정 정보 확인 및 비밀번호 변경
          </p>
        </header>

        {/* 내 정보 카드 */}
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6 mb-6">
          {loading ? (
            <div className="text-zinc-500 text-sm">불러오는 중…</div>
          ) : me ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <User size={14} className="text-zinc-500" />
                <span className="text-zinc-500 w-20">이름</span>
                <span>{me.fullName || '—'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail size={14} className="text-zinc-500" />
                <span className="text-zinc-500 w-20">이메일</span>
                <span>{me.email || '—'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Shield size={14} className="text-zinc-500" />
                <span className="text-zinc-500 w-20">권한</span>
                <span className="flex items-center gap-1.5">
                  {me.role && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                      {me.role}
                    </span>
                  )}
                  {me.isSuperAdmin && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      ★ SUPER
                    </span>
                  )}
                </span>
              </div>
              {me.organizationName && (
                <div className="flex items-center gap-3">
                  <Building2 size={14} className="text-zinc-500" />
                  <span className="text-zinc-500 w-20">학원</span>
                  <span>{me.organizationName}{me.instituteName ? ` · ${me.instituteName}` : ''}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-zinc-500 text-sm">로그인 정보를 가져올 수 없습니다.</div>
          )}
        </div>

        {/* 비밀번호 변경 카드 */}
        <ChangePasswordCard variant="dark" />
      </div>
    </div>
  );
}
