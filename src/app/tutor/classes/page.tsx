'use client';

// ============================================================================
// /tutor/classes — 반 목록 (Tailwind 기반, /dashboard 톤 통일)
// ============================================================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Users,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  UserPlus,
  ArrowLeft,
  GraduationCap,
  ChevronRight,
  Loader2,
} from 'lucide-react';

interface ClassItem {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  grade: number | null;
  maxStudents: number;
  isActive: boolean;
  enrolledCount: number;
  pendingCount: number;
  createdAt: string;
}

export default function ClassesPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    try {
      // ★ 역할 인지 API — 관리자(원장/super_admin/ORG_ADMIN)는 학원 내 모든 반(다른 선생님 반 포함),
      //   강사는 자기 반만. 인원 카운트·활성학원 핀은 서버가 처리. (기존 supabaseBrowser 직접 쿼리는
      //   role 무시하고 tutor_id=본인 으로 고정돼 관리자도 자기 반만 보이던 문제.)
      const res = await fetch('/api/classes', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const rows = (data.classes || []) as Array<Record<string, unknown>>;
      setClasses(rows.map((cls) => ({
        id: cls.id as string,
        name: cls.name as string,
        description: (cls.description as string | null) ?? null,
        subject: (cls.subject as string | null) ?? null,
        grade: (cls.grade as number | null) ?? null,
        maxStudents: (cls.max_students as number) ?? 30,
        isActive: cls.is_active !== false,
        enrolledCount: (cls.enrolledCount as number) || 0,
        pendingCount: (cls.pendingCount as number) || 0,
        createdAt: cls.created_at as string,
      })));
    } catch (error) {
      console.error('Classes load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!confirm('정말 이 반을 삭제하시겠습니까?')) return;
    try {
      // ★ 역할 가드 있는 DELETE API — 관리자는 다른 선생님 반도 삭제 가능(RLS 직접 update 는 막힘).
      const res = await fetch(`/api/classes/${classId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      setClasses((prev) => prev.filter((c) => c.id !== classId));
      setMenuOpenId(null);
    } catch (error) {
      console.error('Delete class error:', error);
      alert('반 삭제 중 오류가 발생했습니다');
    }
  };

  const filteredClasses = classes.filter(
    (cls) =>
      cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.subject?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const gradeLabel = (grade: number | null) => {
    if (!grade) return '';
    if (grade <= 6) return `초${grade}`;
    if (grade <= 9) return `중${grade - 6}`;
    return `고${grade - 9}`;
  };

  return (
    <div className="min-h-screen bg-surface-base text-content-primary">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            title="뒤로"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">반 관리</h1>
            <p className="mt-0.5 text-xs text-zinc-500">수업을 개설하고 학생들을 체계적으로 관리하세요</p>
          </div>
          <Link
            href="/tutor/classes/new"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200"
          >
            <Plus size={16} />
            <span>새 반 만들기</span>
          </Link>
        </div>

        {/* Search */}
        <div className="mb-4 flex items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="반 이름 또는 과목 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none"
            />
          </div>
          {classes.length > 0 && (
            <span className="text-xs text-zinc-500">
              총 {classes.length}개 반 · 활성 {classes.filter((c) => c.isActive).length}
            </span>
          )}
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            반 정보를 불러오는 중...
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-zinc-900/30 px-8 py-14 text-center">
            <GraduationCap size={40} className="mb-3 text-zinc-700" />
            <h3 className="text-base font-semibold text-zinc-200">
              {searchQuery ? '검색 결과가 없습니다' : '관리 중인 반이 없습니다'}
            </h3>
            <p className="mt-1 max-w-xs text-xs text-zinc-500">
              {searchQuery
                ? '다른 검색어로 다시 시도해보세요'
                : '새 반을 만들고 학생들을 등록해 학습을 시작하세요'}
            </p>
            {!searchQuery && (
              <Link
                href="/tutor/classes/new"
                className="mt-4 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200"
              >
                <Plus size={16} />첫 번째 반 만들기
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClasses.map((cls) => (
              <div
                key={cls.id}
                className={`group relative flex flex-col rounded-xl border bg-zinc-900/60 p-4 transition-colors ${
                  cls.isActive
                    ? 'border-white/10 hover:border-white/[.14]'
                    : 'border-white/5 opacity-60'
                }`}
              >
                {/* Top: badges + menu */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {cls.subject && (
                      <span className="rounded-md border border-white/[.08] bg-white/[.04] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-zinc-300 whitespace-nowrap">
                        {cls.subject}
                      </span>
                    )}
                    {cls.grade != null && (
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10.5px] font-bold text-zinc-300">
                        {gradeLabel(cls.grade)}
                      </span>
                    )}
                    {!cls.isActive && (
                      <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[10.5px] font-bold text-rose-400">
                        비활성
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === cls.id ? null : cls.id);
                      }}
                      className="rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-white"
                      title="더 보기"
                    >
                      <MoreVertical size={14} />
                    </button>
                    {menuOpenId === cls.id && (
                      <div
                        className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-white/10 bg-zinc-900 p-1 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          href={`/tutor/classes/${cls.id}/edit`}
                          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white"
                        >
                          <Edit2 size={12} /> 수정
                        </Link>
                        <Link
                          href={`/tutor/classes/${cls.id}`}
                          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white"
                        >
                          <UserPlus size={12} /> 학생 추가
                        </Link>
                        <div className="my-1 h-px bg-white/5" />
                        <button
                          onClick={() => handleDeleteClass(cls.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 size={12} /> 삭제
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Body */}
                <Link href={`/tutor/classes/${cls.id}`} className="flex-1">
                  <h3 className="text-base font-bold text-white">{cls.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                    {cls.description || '반 설명이 없습니다.'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-zinc-300">
                      <Users size={12} className="text-zinc-500" />
                      <span className="font-semibold">
                        {cls.enrolledCount}
                      </span>
                      <span className="text-zinc-500">/ {cls.maxStudents}명</span>
                    </span>
                    {cls.pendingCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold text-amber-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                        대기 {cls.pendingCount}
                      </span>
                    )}
                  </div>
                </Link>

                {/* Footer */}
                <div className="mt-4 flex gap-2 border-t border-white/5 pt-3">
                  {/* ★ 반 허브 — 학생·과제·채점·숙달을 반 하나에서 본다 (2026-09-02).
                      기존 '상세보기'(등록 관리)는 옆에 남긴다 — 하는 일이 다르다. */}
                  <Link
                    href={`/dashboard/class/${cls.id}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-white/90"
                  >
                    반 열기
                    <ChevronRight size={12} />
                  </Link>
                  <Link
                    href={`/tutor/classes/${cls.id}`}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                  >
                    등록 관리
                  </Link>
                  <Link
                    href={`/tutor/classes/${cls.id}`}
                    className="flex h-7 w-9 items-center justify-center rounded-md border border-white/[.08] bg-white/[.04] text-zinc-300 hover:bg-white/[.06] hover:text-white"
                    title="학생 추가"
                  >
                    <UserPlus size={13} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {menuOpenId && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setMenuOpenId(null)}
        />
      )}
    </div>
  );
}
