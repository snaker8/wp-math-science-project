'use client';

// ============================================================================
// /tutor/classes/[id]  — 반 상세 페이지
// 반 정보 + 등록 학생 리스트 + "학생 추가" 모달 (학원장 직접 등록 = option A).
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Edit2,
  UserPlus,
  Mail,
  Phone,
  GraduationCap,
  Trash2,
  Copy,
  Check,
  X,
  Users,
  Loader2,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { gradeIntToLabel } from '@/lib/students/grade-label';

interface ClassData {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  grade: number | null;
  maxStudents: number;
  isActive: boolean;
  createdAt: string;
}

interface Enrollment {
  id: string;
  status: 'ACCEPTED' | 'PENDING' | 'REJECTED';
  enrolledAt: string | null;
  invitedAt: string | null;
  invitationCode: string | null;
  notes: string | null;
  student: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    grade: string | null;
  } | null;
}

interface Credentials {
  email: string;
  password: string;
  emailGenerated: boolean;
  passwordGenerated: boolean;
}

const gradeLabel = (grade: number | null) => {
  if (!grade) return '';
  if (grade <= 6) return `초${grade}`;
  if (grade <= 9) return `중${grade - 6}`;
  return `고${grade - 9}`;
};

export default function ClassDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const classId = params?.id;

  const [classData, setClassData] = useState<ClassData | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExistingModal, setShowExistingModal] = useState(false);

  const loadAll = useCallback(async () => {
    if (!classId || !supabaseBrowser) return;
    setLoading(true);
    setError(null);
    try {
      const { data: cls } = await supabaseBrowser
        .from('classes')
        .select('id, name, description, subject, grade, max_students, is_active, created_at, deleted_at, tutor_id')
        .eq('id', classId)
        .maybeSingle();
      if (!cls || cls.deleted_at) {
        setError('반을 찾을 수 없습니다');
        setLoading(false);
        return;
      }
      setClassData({
        id: cls.id,
        name: cls.name,
        description: cls.description,
        subject: cls.subject,
        grade: cls.grade,
        maxStudents: cls.max_students,
        isActive: cls.is_active,
        createdAt: cls.created_at,
      });
      const r = await fetch(`/api/classes/${classId}/enrollments`, { cache: 'no-store' });
      const d = await r.json();
      setEnrollments(d.enrollments || []);
    } catch (e) {
      console.error('[ClassDetail] load error:', e);
      setError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRemoveEnrollment = async (enrollmentId: string, studentName: string) => {
    if (!confirm(`${studentName} 학생을 이 반에서 제외하시겠습니까?\n(학생 계정은 삭제되지 않습니다)`)) return;
    try {
      const r = await fetch(`/api/enrollments/${enrollmentId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await loadAll();
    } catch (e) {
      console.error('[ClassDetail] remove error:', e);
      alert('학생 제외 중 오류가 발생했습니다');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        반 정보를 불러오는 중...
      </div>
    );
  }
  if (error || !classData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
          <p className="mb-4">{error || '반을 찾을 수 없습니다'}</p>
          <Link href="/tutor/classes" className="text-cyan-400 hover:text-cyan-300">
            ← 반 목록으로
          </Link>
        </div>
      </div>
    );
  }

  const accepted = enrollments.filter((e) => e.status === 'ACCEPTED');
  const pending = enrollments.filter((e) => e.status === 'PENDING');

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => router.push('/tutor/classes')}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            title="반 목록으로"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{classData.name}</h1>
              {!classData.isActive && (
                <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-400">
                  비활성
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
              {classData.subject && <span>{classData.subject}</span>}
              {classData.grade != null && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>{gradeLabel(classData.grade)}</span>
                </>
              )}
              <span className="text-zinc-700">·</span>
              <span>
                {accepted.length} / {classData.maxStudents}명 등록
              </span>
            </div>
          </div>
          <Link
            href={`/tutor/classes/${classId}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            <Edit2 size={14} />
            반 수정
          </Link>
        </div>

        {classData.description && (
          <div className="mb-6 rounded-xl border border-white/5 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-300">
            {classData.description}
          </div>
        )}

        {/* 학생 리스트 헤더 */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-bold">
            <Users size={18} className="text-cyan-400" />
            등록 학생 ({accepted.length}명)
            {pending.length > 0 && (
              <span className="ml-2 text-xs font-normal text-amber-400">+ {pending.length}명 대기</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 가입(재원) 학생을 이 반에 배정 */}
            <button
              onClick={() => setShowExistingModal(true)}
              disabled={accepted.length >= classData.maxStudents}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm font-bold text-violet-300 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900/40 disabled:text-zinc-600"
              title={accepted.length >= classData.maxStudents ? '정원 초과' : '가입한 학생을 이 반에 추가'}
            >
              <Users size={14} />
              학생 추가
            </button>
            {/* 신규 학생 계정 발급 + 이 반 등록 */}
            <button
              onClick={() => setShowAddModal(true)}
              disabled={accepted.length >= classData.maxStudents}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-bold text-cyan-300 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900/40 disabled:text-zinc-600"
              title={accepted.length >= classData.maxStudents ? '정원 초과' : '신규 학생 계정 발급 + 등록'}
            >
              <UserPlus size={14} />
              등록
            </button>
          </div>
        </div>

        {/* 학생 카드 그리드 */}
        {accepted.length === 0 && pending.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-zinc-900/40 px-6 py-12 text-center text-zinc-500">
            <UserPlus className="mx-auto mb-3 h-10 w-10 text-zinc-700" />
            <p className="mb-1 text-base font-semibold text-zinc-300">아직 등록된 학생이 없습니다</p>
            <p className="text-sm">"학생 추가"(가입 학생 배정) 또는 "등록"(신규 발급) 버튼으로 학생을 추가하세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...accepted, ...pending].map((e) => {
              const s = e.student;
              if (!s) return null;
              return (
                <div
                  key={e.id}
                  className={`group relative rounded-xl border p-4 transition-colors ${
                    e.status === 'ACCEPTED'
                      ? 'border-white/10 bg-zinc-900/60 hover:border-cyan-500/40'
                      : 'border-amber-500/30 bg-amber-500/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-bold text-white">{s.full_name}</h3>
                        {e.status === 'PENDING' && (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            대기
                          </span>
                        )}
                      </div>
                      {gradeIntToLabel(s.grade) && <div className="mt-0.5 text-xs text-zinc-500">{gradeIntToLabel(s.grade)}</div>}
                    </div>
                    <button
                      onClick={() => handleRemoveEnrollment(e.id, s.full_name)}
                      className="rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-rose-400 group-hover:opacity-100"
                      title="이 반에서 제외"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-3 space-y-1 text-[12.5px] text-zinc-400">
                    <div className="flex items-center gap-2">
                      <Mail size={12} className="flex-shrink-0 text-zinc-600" />
                      <span className="truncate" title={s.email}>{s.email}</span>
                    </div>
                    {s.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={12} className="flex-shrink-0 text-zinc-600" />
                        <span>{s.phone}</span>
                      </div>
                    )}
                  </div>
                  {e.invitationCode && e.status === 'PENDING' && (
                    <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-300">
                      <KeyRound size={12} />
                      <span>초대 코드: <strong>{e.invitationCode}</strong></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddStudentModal
          classId={classData.id}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            loadAll();
          }}
        />
      )}

      {showExistingModal && (
        <AddExistingStudentModal
          classId={classData.id}
          enrolledIds={new Set(enrollments.map((e) => e.student?.id).filter((x): x is string => !!x))}
          onClose={() => setShowExistingModal(false)}
          onAdded={() => {
            setShowExistingModal(false);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

// ─── 가입(재원) 학생 추가 모달 — 기존 계정 학생을 이 반에 즉시 배정 ──────────
function AddExistingStudentModal({
  classId,
  enrolledIds,
  onClose,
  onAdded,
}: {
  classId: string;
  enrolledIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [students, setStudents] = useState<Array<{ id: string; name: string; grade: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/users/students', { cache: 'no-store' });
        const d = await r.json();
        if (cancelled) return;
        const list = (Array.isArray(d.students) ? d.students : [])
          .map((s: { id: string; name?: string; grade?: string }) => ({
            id: s.id,
            name: s.name || '(이름 없음)',
            grade: s.grade || '',
          }))
          .filter((s: { id: string }) => !enrolledIds.has(s.id));
        setStudents(list);
      } catch {
        if (!cancelled) setError('학생 목록을 불러오지 못했습니다');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // enrolledIds 는 모달 오픈 시점 고정 — 의도적으로 deps 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = search.trim()
    ? students.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
    : students;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    const failed: string[] = [];
    for (const sid of selected) {
      try {
        const r = await fetch(`/api/classes/${classId}/enrollments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: sid, direct: true }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          // 이미 등록된 학생(409)은 성공 취급
          if (r.status !== 409) {
            const name = students.find((s) => s.id === sid)?.name || sid;
            failed.push(`${name}: ${d.error || `HTTP ${r.status}`}`);
          }
        }
      } catch {
        const name = students.find((s) => s.id === sid)?.name || sid;
        failed.push(`${name}: 네트워크 오류`);
      }
    }
    setSubmitting(false);
    if (failed.length > 0) {
      setError(failed.join('\n'));
    } else {
      onAdded();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">학생 추가</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs text-zinc-400">
          가입되어 있는 학생을 선택해 이 반에 바로 추가합니다. (신규 학생은 "등록" 버튼 사용)
        </p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="학생 이름 검색"
          autoFocus
          className="mb-3 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
        />

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/5 bg-black/20">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
              <Loader2 size={15} className="animate-spin" /> 학생 목록 불러오는 중...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-500">
              {students.length === 0 ? '추가할 수 있는 학생이 없습니다 (모두 등록됨)' : '검색 결과가 없습니다'}
            </div>
          ) : (
            filtered.map((s) => {
              const checked = selected.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={`flex w-full items-center gap-3 border-b border-white/5 px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
                    checked ? 'bg-cyan-500/10 text-cyan-200' : 'text-zinc-300 hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-cyan-400 bg-cyan-500/30' : 'border-zinc-600'
                    }`}
                  >
                    {checked && <Check size={11} />}
                  </span>
                  <span className="flex-1 truncate font-medium">{s.name}</span>
                  {s.grade && <span className="text-xs text-zinc-500">{s.grade}</span>}
                </button>
              );
            })
          )}
        </div>

        {error && (
          <div className="mt-3 whitespace-pre-line rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selected.size === 0}
            className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-black hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            {submitting ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              `${selected.size}명 추가`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 학생 직접 등록 모달 ────────────────────────────────────────────
function AddStudentModal({
  classId,
  onClose,
  onAdded,
}: {
  classId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [studentName, setStudentName] = useState('');
  const [copied, setCopied] = useState<'email' | 'password' | 'all' | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('이름은 필수입니다');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/classes/${classId}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          grade: grade.trim() || undefined,
          email: email.trim() || undefined,
          password: password.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || `오류 (HTTP ${r.status})`);
        return;
      }
      setStudentName(fullName.trim());
      if (d.credentials) {
        // 신규 발급 → 자격증명 화면 표시
        setCredentials(d.credentials);
      } else {
        // 기존 학생 재등록 → 즉시 닫기
        onAdded();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string, kind: 'email' | 'password' | 'all') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt('복사할 텍스트', text);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {credentials ? (
          // ─── 등록 완료 + 자격증명 표시 화면 ───
          <>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <Check size={20} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white">{studentName} 학생 등록 완료</h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  아래 로그인 정보를 학생에게 전달하세요
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  이메일 (로그인 ID){credentials.emailGenerated && <span className="ml-1 text-cyan-400">자동 생성</span>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 truncate font-mono text-[13px] text-white">{credentials.email}</div>
                  <button
                    onClick={() => copyToClipboard(credentials.email, 'email')}
                    className="flex-shrink-0 rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  >
                    {copied === 'email' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  비밀번호{credentials.passwordGenerated && <span className="ml-1 text-cyan-400">자동 생성</span>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 truncate font-mono text-[13px] text-white">{credentials.password}</div>
                  <button
                    onClick={() => copyToClipboard(credentials.password, 'password')}
                    className="flex-shrink-0 rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  >
                    {copied === 'password' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `로그인 ID: ${credentials.email}\n비밀번호: ${credentials.password}`,
                    'all',
                  )
                }
                className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-bold text-cyan-300 hover:bg-cyan-500/20"
              >
                {copied === 'all' ? '✓ 모두 복사됨' : '둘 다 복사 (카톡 전달용)'}
              </button>
            </div>

            <div className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-[11.5px] text-amber-200">
              ⚠ 비밀번호는 이 화면을 닫으면 다시 볼 수 없습니다. 학생에게 전달 후 닫아주세요.
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={onAdded}
                className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-black hover:bg-zinc-100"
              >
                완료
              </button>
            </div>
          </>
        ) : (
          // ─── 입력 폼 ───
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">학생 직접 등록</h2>
              <button
                onClick={onClose}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-xs text-zinc-400">
              학생 이름만 입력해도 자동으로 계정이 발급됩니다. 이메일·비밀번호 비워두면 임시값 자동 생성.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <Field label="학생 이름" required>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="홍길동"
                  autoFocus
                  required
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="학년">
                  <input
                    type="text"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    placeholder="중3"
                    className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
                  />
                </Field>
                <Field label="연락처">
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010-0000-0000"
                    className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
                  />
                </Field>
              </div>
              <Field label="이메일 (선택)" hint="비워두면 자동 생성됩니다">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
                />
              </Field>
              <Field label="비밀번호 (선택)" hint="비워두면 자동 생성, 등록 후 학생에게 전달">
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="자동 생성됨"
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
                />
              </Field>
              <Field label="메모 (선택)">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 자모 김OO, 4월 등록"
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
                />
              </Field>

              {error && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-white/10 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-700"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting || !fullName.trim()}
                  className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-black hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
                >
                  {submitting ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <UserPlus size={14} /> 등록
                    </span>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-zinc-300">
          {label}
          {required && <span className="ml-0.5 text-rose-400">*</span>}
        </span>
        {hint && <span className="text-[10.5px] text-zinc-500">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
