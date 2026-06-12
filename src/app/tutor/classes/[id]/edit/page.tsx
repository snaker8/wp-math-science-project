'use client';

// ============================================================================
// /tutor/classes/[id]/edit — 반 수정 페이지
// 실데이터 연결: GET /api/classes/[classId] 로드 → PUT 저장.
// (기존엔 MOCK 데이터 + alert 만 있던 스텁이라 "반 이름 수정이 안 되던" 문제)
// 등록 학생 목록도 실데이터 — 제외는 DELETE /api/enrollments/[enrollmentId].
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  FileText,
  Hash,
  Save,
  Sparkles,
  UserMinus,
  Mail,
  Loader2,
  AlertCircle,
  BookOpen,
  GraduationCap,
  Power,
} from 'lucide-react';

const SUBJECTS = [
  '수학I',
  '수학II',
  '미적분',
  '확률과 통계',
  '기하',
  '중등 수학',
  '초등 수학',
  '기타',
];

const GRADE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '학년 없음' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `초${n}` })),
  ...[7, 8, 9].map((n) => ({ value: String(n), label: `중${n - 6}` })),
  ...[10, 11, 12].map((n) => ({ value: String(n), label: `고${n - 9}` })),
];

interface EnrolledStudent {
  enrollmentId: string;
  name: string;
  email: string;
}

export default function EditClassPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const classId = params?.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [className, setClassName] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [maxStudents, setMaxStudents] = useState(30);
  const [isActive, setIsActive] = useState(true);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);

  const loadAll = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/classes/${classId}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const cls = d.class;
      setClassName(cls.name || '');
      setDescription(cls.description || '');
      setSubject(cls.subject || '');
      setGrade(cls.grade != null ? String(cls.grade) : '');
      setMaxStudents(cls.max_students || 30);
      setIsActive(cls.is_active !== false);
      const enrolled = (d.enrollments || [])
        .filter((e: { status: string }) => e.status === 'ACCEPTED')
        .map((e: { id: string; student: { full_name?: string; email?: string } | null }) => ({
          enrollmentId: e.id,
          name: e.student?.full_name || '(이름 없음)',
          email: e.student?.email || '',
        }));
      setStudents(enrolled);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSave = async () => {
    if (!className.trim()) {
      setSaveError('반 이름을 입력해주세요.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch(`/api/classes/${classId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: className.trim(),
          description: description.trim() || null,
          subject: subject || null,
          grade: grade || null,
          maxStudents,
          isActive,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `저장 실패 (HTTP ${r.status})`);
      router.push(`/tutor/classes/${classId}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveStudent = async (student: EnrolledStudent) => {
    if (!confirm(`${student.name} 학생을 이 반에서 제거하시겠습니까?\n(학생 계정은 삭제되지 않습니다)`)) return;
    try {
      const r = await fetch(`/api/enrollments/${student.enrollmentId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStudents((prev) => prev.filter((s) => s.enrollmentId !== student.enrollmentId));
    } catch {
      alert('학생 제거 중 오류가 발생했습니다');
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
  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
          <p className="mb-4">{loadError}</p>
          <Link href="/tutor/classes" className="text-cyan-400 hover:text-cyan-300">
            ← 반 목록으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-[800px] mx-auto p-8">
        {/* Header */}
        <header className="flex items-center gap-5 mb-8 p-6 bg-zinc-900/40 border border-white/5 rounded-2xl backdrop-blur-xl">
          <Link
            href={`/tutor/classes/${classId}`}
            className="flex items-center justify-center w-[38px] h-[38px] bg-zinc-800/60 border border-white/10 text-zinc-400 rounded-xl hover:bg-zinc-700/80 hover:text-white hover:-translate-x-0.5 transition-all"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">반 수정</h1>
            <p className="text-sm text-zinc-500">반 정보를 수정하고 학생을 관리하세요</p>
          </div>
        </header>

        {/* Form */}
        <div className="bg-zinc-950/60 border border-white/5 rounded-2xl overflow-hidden">
          {/* 기본 정보 */}
          <section className="p-6 border-b border-white/5">
            <div className="flex items-center gap-2.5 mb-6">
              <Sparkles size={16} className="text-indigo-400" />
              <h2 className="text-base font-bold">기본 정보</h2>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div className="col-span-2 flex flex-col gap-2">
                <label className="text-sm font-semibold text-zinc-400 flex items-center gap-1.5">
                  <FileText size={14} />
                  반 이름 *
                </label>
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="예: 중등 수학 A반"
                  className="w-full px-4 py-3 bg-zinc-900/80 border border-white/5 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:bg-zinc-800/90 focus:border-indigo-500/40 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.05)] transition-all"
                />
              </div>

              <div className="col-span-2 flex flex-col gap-2">
                <label className="text-sm font-semibold text-zinc-400 flex items-center gap-1.5">
                  <FileText size={14} />
                  설명
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="반의 특징이나 운영 방식을 간단히 적어주세요"
                  rows={3}
                  className="w-full px-4 py-3 bg-zinc-900/80 border border-white/5 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:bg-zinc-800/90 focus:border-indigo-500/40 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.05)] transition-all resize-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-zinc-400 flex items-center gap-1.5">
                  <BookOpen size={14} />
                  과목
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900/80 border border-white/5 rounded-xl text-sm text-white focus:outline-none focus:bg-zinc-800/90 focus:border-indigo-500/40 transition-all"
                >
                  <option value="">과목 없음</option>
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-zinc-400 flex items-center gap-1.5">
                  <GraduationCap size={14} />
                  학년
                </label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900/80 border border-white/5 rounded-xl text-sm text-white focus:outline-none focus:bg-zinc-800/90 focus:border-indigo-500/40 transition-all"
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-zinc-400 flex items-center gap-1.5">
                  <Hash size={14} />
                  최대 인원
                </label>
                <input
                  type="number"
                  value={maxStudents}
                  onChange={(e) => setMaxStudents(Number(e.target.value))}
                  min={1}
                  max={100}
                  className="w-full px-4 py-3 bg-zinc-900/80 border border-white/5 rounded-xl text-sm text-white focus:outline-none focus:bg-zinc-800/90 focus:border-indigo-500/40 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.05)] transition-all"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-zinc-400 flex items-center gap-1.5">
                  <Power size={14} />
                  상태
                </label>
                <button
                  type="button"
                  onClick={() => setIsActive((v) => !v)}
                  className={`w-full px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                    isActive
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-zinc-900/80 border-white/5 text-zinc-500'
                  }`}
                >
                  {isActive ? '활성 (운영 중)' : '비활성'}
                </button>
              </div>
            </div>
          </section>

          {/* 등록 학생 목록 */}
          <section className="p-6 border-b border-white/5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <Users size={16} className="text-indigo-400" />
                <h2 className="text-base font-bold">등록 학생</h2>
              </div>
              <span className="text-sm text-zinc-500">{students.length}명</span>
            </div>

            {students.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-zinc-600">
                <Users size={40} className="mb-3 text-zinc-700" />
                <p className="text-sm font-medium">등록된 학생이 없습니다</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {students.map((student) => (
                  <div
                    key={student.enrollmentId}
                    className="flex items-center justify-between p-4 bg-zinc-900/40 border border-white/5 rounded-xl hover:bg-zinc-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 bg-indigo-500/10 rounded-xl text-sm font-bold text-indigo-400">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{student.name}</p>
                        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <Mail size={11} />
                          {student.email}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStudent(student)}
                      className="flex items-center gap-2 px-3.5 py-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold rounded-lg hover:bg-red-500/20 transition-all"
                    >
                      <UserMinus size={14} />
                      학생 제거
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Footer */}
          <div className="flex justify-end items-center gap-4 p-6 bg-zinc-900/40 border-t border-white/5">
            {saveError && (
              <span className="mr-auto text-sm text-rose-400">{saveError}</span>
            )}
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !className.trim()}
              className="flex items-center gap-2 px-7 py-3 bg-white text-black text-[15px] font-extrabold rounded-[14px] hover:bg-zinc-100 hover:-translate-y-0.5 transition-all shadow-[0_8px_16px_-4px_rgba(255,255,255,0.1)] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>저장</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
