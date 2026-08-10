'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  Search,
  UserPlus,
  MoreVertical,
  Mail,
  Phone,
  Calendar,
  BarChart3,
  User,
  GraduationCap,
  School,
  Filter,
  X,
  Loader2,
  Copy,
  Check,
  Pencil,
  KeyRound,
  Trash2,
  ClipboardList,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { gradeIntToLabel } from '@/lib/students/grade-label';
import { MOCK_EXAM_TYPES, MOCK_EXAM_LABELS, type MockExamType } from '@/lib/students/mock-exam-types';

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  grade: string | null;
  school: string | null;
  className: string | null;
  classId: string | null;
  source: 'user' | 'roster'; // user=정식 등록, roster=채점 자동등록(promote 대상)
  status: 'ACCEPTED' | 'PENDING' | 'REJECTED';
  enrolledAt: string;
  lastActivity: string | null;
  totalProblems: number | null; // null = 집계 미구현 (거짓 0 대신 '—' 표시)
  correctRate: number | null; // null = 집계 미구현
}

// 모의고사 점수 입력 폼 (4종 × 점수/날짜/메모) — 자사관 플래너 연동
type ExamScoreRowForm = { score: string; date: string; note: string };
const emptyExamScoreForm = (): Record<MockExamType, ExamScoreRowForm> => ({
  mockFinal1: { score: '', date: '', note: '' },
  mockFinal2: { score: '', date: '', note: '' },
  mock1: { score: '', date: '', note: '' },
  mock2: { score: '', date: '', note: '' },
});

const examInputStyle: CSSProperties = {
  width: '100%',
  background: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: 6,
  padding: '6px 8px',
  color: '#fff',
  fontSize: 13,
};

export default function TutorStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('전체');
  const [filterStatus, setFilterStatus] = useState('전체');
  const [showInviteModal, setShowInviteModal] = useState(false);
  // 직접 등록 모달
  const [showDirectAdd, setShowDirectAdd] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addForm, setAddForm] = useState({
    fullName: '',
    grade: '',
    school: '',
    phone: '',
    email: '',
    password: '',
  });
  // 등록 시 반 배정 (옵션) — /api/students 가 classId 받으면 즉시 ACCEPTED enrollment
  const [addClassId, setAddClassId] = useState('');
  const [classOptions, setClassOptions] = useState<Array<{ id: string; name: string }> | null>(null);
  useEffect(() => {
    if (!showDirectAdd || classOptions !== null) return;
    fetch('/api/classes')
      .then((r) => r.json())
      .then((d) => {
        const list = ((d.classes || []) as Array<{ id: string; name: string; is_active?: boolean }>)
          .filter((c) => c.is_active !== false)
          .map((c) => ({ id: c.id, name: c.name }));
        setClassOptions(list);
      })
      .catch(() => setClassOptions([]));
  }, [showDirectAdd, classOptions]);
  // 등록 후 자격증명 표시
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // ── 학생 관리 액션 ────────────────────────────────────────────────
  // 수정 모달
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', grade: '', school: '', phone: '' });
  const [editBusy, setEditBusy] = useState(false);

  // 비밀번호 초기화 결과 (간이 alert 대신)
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);

  // 모의고사 점수 모달 — 자사관 플래너 연동 (student_exam_scores)
  const [examStudent, setExamStudent] = useState<Student | null>(null);
  const [examForm, setExamForm] = useState<Record<MockExamType, ExamScoreRowForm>>(emptyExamScoreForm());
  const [examLoading, setExamLoading] = useState(false);
  const [examBusy, setExamBusy] = useState(false);

  // 액션 핸들러들
  const openEditModal = (s: Student) => {
    setEditingStudent(s);
    setEditForm({
      fullName: s.name,
      grade: s.grade ? String(s.grade) : '',
      school: s.school || '',
      phone: s.email
        ? s.email.replace(/@local\.suzag\.com$/i, '')
        : (s.phone || ''),
    });
  };

  const handleEditSave = async () => {
    if (!editingStudent) return;
    setEditBusy(true);
    try {
      // ── 채점명단(roster) 학생 → 정식 등록(promote) ──
      //   roster id 는 users 에 없어 PATCH 가 404. 대신 POST /api/students 로
      //   user 를 만들고 rosterId 로 이 roster 를 콕 집어 머지(채점 이력 이전 + 중복 해소).
      //   전화번호 필수 — 학생 로그인 ID 가 되기 때문.
      if (editingStudent.source === 'roster') {
        const phone = editForm.phone.trim();
        if (!phone) {
          alert('정식 등록하려면 전화번호가 필요합니다 (학생 로그인 ID)');
          setEditBusy(false);
          return;
        }
        const res = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: editForm.fullName.trim(),
            grade: editForm.grade || null,
            school: editForm.school.trim() || null,
            phone,
            rosterId: editingStudent.id,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '정식 등록 실패');
        setEditingStudent(null);
        if (json.credentials) {
          alert(
            `정식 등록 완료 — 학생 로그인 정보\n전화번호: ${String(json.credentials.email).replace(/@local\.suzag\.com$/i, '')}\n초기 비밀번호: ${json.credentials.password}`,
          );
        } else {
          alert('정식 등록 완료 (기존 계정과 연결)');
        }
        loadStudents();
        return;
      }

      // ── 정식(user) 학생 — 일반 정보 수정 ──
      const res = await fetch(`/api/students/${editingStudent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editForm.fullName,
          grade: editForm.grade || null,
          school: editForm.school || null,
          phone: editForm.phone || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '수정 실패');
      setEditingStudent(null);
      loadStudents();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setEditBusy(false);
    }
  };

  const handleResetPassword = async (s: Student) => {
    if (!confirm(`${s.name} 학생의 비밀번호를 초기값(123456)으로 재설정하시겠어요?`)) return;
    try {
      const res = await fetch(`/api/students/${s.id}/reset-password`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '재설정 실패');
      setResetResult({ name: s.name, password: json.password || '123456' });
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleDelete = async (s: Student) => {
    if (!confirm(`${s.name} 학생을 삭제하시겠어요?\n학습 이력은 보존되며 학생 로그인은 차단됩니다.`)) return;
    try {
      const res = await fetch(`/api/students/${s.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '삭제 실패');
      loadStudents();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // ── 모의고사 점수 (자사관 플래너 연동) ──────────────────────────────
  const openExamModal = async (s: Student) => {
    setExamStudent(s);
    setExamForm(emptyExamScoreForm());
    setExamLoading(true);
    try {
      const res = await fetch(`/api/students/${s.id}/exam-scores`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '점수 조회 실패');
      // DB 저장값으로 폼 초기화 (UI 상태 저장/복원 패턴)
      const next = emptyExamScoreForm();
      for (const row of (json.scores || []) as Array<{ examType: string; score: number; examDate: string | null; note: string | null }>) {
        if ((MOCK_EXAM_TYPES as readonly string[]).includes(row.examType)) {
          next[row.examType as MockExamType] = {
            score: row.score != null ? String(row.score) : '',
            date: row.examDate || '',
            note: row.note || '',
          };
        }
      }
      setExamForm(next);
    } catch (e) {
      alert((e as Error).message);
      setExamStudent(null);
    } finally {
      setExamLoading(false);
    }
  };

  const handleExamSave = async () => {
    if (!examStudent) return;
    // 점수 검증 — 빈값은 "삭제", 값이 있으면 0~100
    for (const t of MOCK_EXAM_TYPES) {
      const v = examForm[t].score.trim();
      if (!v) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        alert(`${MOCK_EXAM_LABELS[t]} 점수는 0~100 사이여야 합니다`);
        return;
      }
    }
    setExamBusy(true);
    try {
      const scores = MOCK_EXAM_TYPES.map((t) => ({
        examType: t,
        score: examForm[t].score.trim() === '' ? null : Number(examForm[t].score.trim()),
        examDate: examForm[t].date || null,
        note: examForm[t].note.trim() || null,
      }));
      const res = await fetch(`/api/students/${examStudent.id}/exam-scores`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '저장 실패');
      setExamStudent(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setExamBusy(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setError(null);
    if (!supabaseBrowser) {
      // Mock data
      setStudents([
        {
          id: '1',
          name: '김철수',
          email: 'student1@example.com',
          phone: '010-1234-5678',
          grade: '고1',
          school: '예시고등학교',
          className: 'A반',
          classId: 'class-1',
          source: 'user',
          status: 'ACCEPTED',
          enrolledAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          totalProblems: 150,
          correctRate: 78,
        },
        {
          id: '2',
          name: '이영희',
          email: 'student2@example.com',
          phone: '010-2345-6789',
          grade: '고1',
          school: '예시고등학교',
          className: 'A반',
          classId: 'class-1',
          source: 'user',
          status: 'ACCEPTED',
          enrolledAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          totalProblems: 200,
          correctRate: 85,
        },
        {
          id: '3',
          name: '박민수',
          email: 'student3@example.com',
          phone: null,
          grade: '고2',
          school: '예시중학교',
          className: 'B반',
          classId: 'class-2',
          source: 'user',
          status: 'PENDING',
          enrolledAt: new Date().toISOString(),
          lastActivity: null,
          totalProblems: 0,
          correctRate: 0,
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      // ★ institute_id 기반 학생 목록 — /api/users/students 가 같은 institute 의
      //   STUDENT role 사용자 전체 반환. 반(class) 배정 여부와 무관.
      //   기존엔 class_enrollments 기반이라 반 미배정 학생 (직접 등록) 이 목록에
      //   안 나오던 사고 차단 (2026-05-15).
      const res = await fetch('/api/users/students');
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error('[students] API error:', errBody.error || res.statusText);
        // 빈 상태("등록된 학생이 없습니다")로 위장하지 않고 에러 배너 + 재시도 노출
        setError(errBody.error || '서버 오류가 발생했습니다. 다시 시도해주세요.');
        return;
      }
      const { students: apiStudents = [] } = await res.json();

      // (옵션) 반 배정 정보 — 본 강사의 classes·enrollments 추가 조회해서 className 채움.
      //   학생 목록 노출에는 영향 X. 실패해도 학생 목록은 그대로.
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      const enrollmentMap = new Map<string, { className: string; classId: string; status: string; enrolledAt: string }>();
      if (user) {
        try {
          const { data: classes } = await supabaseBrowser
            .from('classes')
            .select('id, name')
            .eq('tutor_id', user.id)
            .is('deleted_at', null);
          if (classes && classes.length > 0) {
            const classIds = classes.map((c) => c.id);
            const { data: enrollments } = await supabaseBrowser
              .from('class_enrollments')
              .select('class_id, student_id, status, enrolled_at')
              .in('class_id', classIds);
            for (const e of (enrollments || []) as Array<{ class_id: string; student_id: string; status: string; enrolled_at: string }>) {
              const cls = classes.find((c) => c.id === e.class_id);
              if (cls) {
                enrollmentMap.set(e.student_id, {
                  className: cls.name,
                  classId: e.class_id,
                  status: e.status,
                  enrolledAt: e.enrolled_at,
                });
              }
            }
          }
        } catch (e) {
          console.warn('[students] enrollment 보조 로드 실패:', e);
        }
      }

      const studentList: Student[] = (apiStudents as Array<{ id: string; name: string; email: string; phone: string | null; grade: string; school?: string | null; source?: 'user' | 'roster' }>).map((s) => {
        const enrollment = enrollmentMap.get(s.id);
        return {
          id: s.id,
          name: s.name,
          email: s.email,
          phone: s.phone,
          grade: s.grade || null,
          school: s.school || null,
          className: enrollment?.className || null,
          classId: enrollment?.classId || null,
          source: s.source || 'user',
          status: (enrollment?.status as 'ACCEPTED' | 'PENDING' | 'REJECTED') || 'ACCEPTED',
          enrolledAt: enrollment?.enrolledAt || '',
          // 학습 지표 집계 미구현 — 거짓 0 대신 null 로 두고 UI 에서 '—' 표시
          lastActivity: null,
          totalProblems: null,
          correctRate: null,
        };
      });

      setStudents(studentList);
    } catch (error) {
      console.error('Failed to load students:', error);
      setError('네트워크 상태를 확인한 뒤 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  // ★ 반 없는 학생(className null/빈값 = 미배정)도 모아볼 수 있게 '미배정' 칩 추가.
  const hasUnassigned = students.some((s) => !s.className);
  const classNames = ['전체', ...(hasUnassigned ? ['미배정'] : []), ...new Set(students.map((s) => s.className).filter(Boolean))];
  const statuses = ['전체', 'ACCEPTED', 'PENDING'];

  const filteredStudents = students.filter((student) => {
    // ★ name/email 이 null 일 수 있음(명단 학생은 email 없음) → null 가드 (검색 시 toLowerCase 크래시 차단)
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (student.name || '').toLowerCase().includes(q) ||
      (student.email || '').toLowerCase().includes(q);
    const matchesClass =
      filterClass === '전체' ||
      (filterClass === '미배정' ? !student.className : student.className === filterClass);
    const matchesStatus = filterStatus === '전체' || student.status === filterStatus;

    return matchesSearch && matchesClass && matchesStatus;
  });

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>학생 목록 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="students-page">
      <header className="page-header">
        <div>
          <h1>학생 관리</h1>
          <p>학생을 직접 등록하거나 초대하세요</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => { setShowDirectAdd(true); setCredentials(null); }}>
            <UserPlus size={18} />
            학생 직접 등록
          </button>
          <button className="btn-secondary" onClick={() => setShowInviteModal(true)}>
            <Mail size={18} />
            이메일 초대
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-item">
          <GraduationCap size={20} />
          <span className="stat-value">{students.length}</span>
          <span className="stat-label">전체 학생</span>
        </div>
        <div className="stat-item active">
          <User size={20} />
          <span className="stat-value">
            {students.filter((s) => s.status === 'ACCEPTED').length}
          </span>
          <span className="stat-label">활성 학생</span>
        </div>
        <div className="stat-item pending">
          <Mail size={20} />
          <span className="stat-value">
            {students.filter((s) => s.status === 'PENDING').length}
          </span>
          <span className="stat-label">대기 중</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="이름 또는 전화번호로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <Filter size={16} />
          <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
            {classNames.map((c) => (
              <option key={c} value={c as string}>
                {c}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="전체">상태</option>
            <option value="ACCEPTED">활성</option>
            <option value="PENDING">대기중</option>
          </select>
        </div>
      </div>

      {/* Student List */}
      {error ? (
        <div className="error-state">
          <AlertTriangle size={40} />
          <h3>학생 목록을 불러오지 못했습니다</h3>
          <p>{error}</p>
          <button
            className="retry-btn"
            onClick={() => {
              setLoading(true);
              loadStudents();
            }}
          >
            <RefreshCw size={16} />
            다시 시도
          </button>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="empty-state">
          <GraduationCap size={48} />
          <h3>등록된 학생이 없습니다</h3>
          <p>학생을 직접 등록하여 시작하세요</p>
          <button className="btn-secondary" onClick={() => { setShowDirectAdd(true); setCredentials(null); }}>
            <UserPlus size={18} />
            첫 학생 등록
          </button>
        </div>
      ) : (
        <div className="student-list">
          {filteredStudents.map((student) => (
            <div key={student.id} className="student-card">
              <div className="student-avatar">
                {student.name.charAt(0)}
              </div>

              <div className="student-info">
                <div className="student-name">
                  <span>{student.name}</span>
                  {student.source === 'roster' ? (
                    <span
                      title="채점으로 자동 등록된 명단 학생 — 정식 등록(전화번호 입력) 전"
                      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}
                    >
                      채점명단
                    </span>
                  ) : (
                    <span className={`status-badge ${student.status.toLowerCase()}`}>
                      {student.status === 'ACCEPTED' ? '활성' : '대기중'}
                    </span>
                  )}
                </div>
                <div className="student-details">
                  {/* 학생 ID 표시 — '@local.suzag.com' 도메인 제거하고 전화번호만 노출 */}
                  <span>
                    <Phone size={14} />
                    {student.email
                      ? student.email.replace(/@local\.suzag\.com$/i, '')
                      : (student.phone || '—')}
                  </span>
                  {/* 학년 라벨 — integer(7) → "중1" 변환 */}
                  {gradeIntToLabel(student.grade) && (
                    <span>
                      <Calendar size={14} />
                      {gradeIntToLabel(student.grade)}
                    </span>
                  )}
                  {student.school && (
                    <span>
                      <School size={14} />
                      {student.school}
                    </span>
                  )}
                  {student.className && (
                    <span>
                      <GraduationCap size={14} />
                      {student.className}
                    </span>
                  )}
                </div>
              </div>

              <div className="student-stats">
                {/* 집계 미구현(null) 이면 거짓 0/0% 대신 '—' */}
                <div className="stat">
                  <span className="value">{student.totalProblems ?? '—'}</span>
                  <span className="label">풀이 문제</span>
                </div>
                <div className="stat">
                  <span className="value">{student.correctRate != null ? `${student.correctRate}%` : '—'}</span>
                  <span className="label">정답률</span>
                </div>
              </div>

              <Link href={`/tutor/students/${student.id}`} className="view-analytics">
                <BarChart3 size={16} />
                상세 보기
              </Link>

              {/* 학생 관리 액션 — 수정/비번초기화/삭제 */}
              <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                <button
                  type="button"
                  onClick={() => openEditModal(student)}
                  title={student.source === 'roster' ? '정식 등록 (전화번호 입력→연결)' : '정보 수정'}
                  style={{
                    padding: '6px 8px',
                    background: student.source === 'roster' ? 'rgba(99,102,241,0.15)' : 'transparent',
                    border: student.source === 'roster' ? '1px solid rgba(99,102,241,0.5)' : '1px solid #3f3f46',
                    borderRadius: 6,
                    color: student.source === 'roster' ? '#a5b4fc' : '#a1a1aa',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {student.source === 'roster' ? <UserPlus size={14} /> : <Pencil size={14} />}
                </button>
                {/* 모의고사 점수·비번 초기화·삭제는 정식(user) 학생만 — roster 는 계정이 없어 404. 먼저 정식 등록 필요. */}
                {student.source !== 'roster' && (
                  <>
                    <button
                      type="button"
                      onClick={() => openExamModal(student)}
                      title="모의고사 점수 입력 (자사관 플래너 연동)"
                      style={{
                        padding: '6px 8px',
                        background: 'transparent',
                        border: '1px solid #3f3f46',
                        borderRadius: 6,
                        color: '#34d399',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <ClipboardList size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetPassword(student)}
                      title="비밀번호 초기화 (→ 123456)"
                      style={{
                        padding: '6px 8px',
                        background: 'transparent',
                        border: '1px solid #3f3f46',
                        borderRadius: 6,
                        color: '#fbbf24',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <KeyRound size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(student)}
                      title="학생 삭제 (학습 이력 보존)"
                      style={{
                        padding: '6px 8px',
                        background: 'transparent',
                        border: '1px solid #7f1d1d',
                        borderRadius: 6,
                        color: '#f87171',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 학생 정보 수정 모달 */}
      {editingStudent && (
        <div className="modal-overlay" onClick={() => !editBusy && setEditingStudent(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>
                {editingStudent.source === 'roster' ? '정식 등록' : '학생 정보 수정'} — {editingStudent.name}
              </h2>
              <button type="button" onClick={() => !editBusy && setEditingStudent(null)} className="modal-close">
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 16 }}>
              {editingStudent.source === 'roster' && (
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#a5b4fc', lineHeight: 1.5 }}>
                  채점으로 자동 등록된 명단 학생입니다. <strong>전화번호를 입력해 저장하면 정식 학생으로 등록</strong>되고, 기존 채점 이력이 자동 연결됩니다.
                </div>
              )}
              <div className="form-group">
                <label>이름 *</label>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>학년</label>
                <select
                  value={editForm.grade}
                  onChange={(e) => setEditForm((f) => ({ ...f, grade: e.target.value }))}
                >
                  <option value="">선택 안함</option>
                  <option value="7">중1</option>
                  <option value="8">중2</option>
                  <option value="9">중3</option>
                  <option value="10">고1</option>
                  <option value="11">고2</option>
                  <option value="12">고3</option>
                </select>
              </div>
              <div className="form-group">
                <label>학교</label>
                <input
                  type="text"
                  value={editForm.school}
                  onChange={(e) => setEditForm((f) => ({ ...f, school: e.target.value }))}
                  placeholder="예: 엄궁중학교"
                />
              </div>
              <div className="form-group">
                <label>전화번호 (학생 로그인 ID){editingStudent.source === 'roster' ? ' *' : ''}</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="01012345678"
                  required={editingStudent.source === 'roster'}
                />
                <p style={{ fontSize: 11, color: '#a78bfa', marginTop: 4 }}>
                  {editingStudent.source === 'roster'
                    ? '전화번호를 입력해야 정식 등록(로그인 계정 생성)됩니다. 초기 비밀번호는 123456.'
                    : '전화번호를 변경하면 학생이 새 번호로 로그인해야 합니다.'}
                </p>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setEditingStudent(null)}
                  disabled={editBusy}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn-submit"
                  onClick={handleEditSave}
                  disabled={
                    editBusy ||
                    !editForm.fullName.trim() ||
                    (editingStudent.source === 'roster' && !editForm.phone.trim())
                  }
                >
                  {editBusy
                    ? <Loader2 size={14} className="spinner" />
                    : (editingStudent.source === 'roster' ? '정식 등록' : '저장')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 모의고사 점수 모달 — 자사관 플래너 연동 */}
      {examStudent && (
        <div className="modal-overlay" onClick={() => !examBusy && setExamStudent(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>모의고사 점수 — {examStudent.name}</h2>
              <button type="button" onClick={() => !examBusy && setExamStudent(null)} className="modal-close">
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#6ee7b7', lineHeight: 1.5 }}>
                자사관 내신 플래너가 이 점수를 동기화합니다. <strong>점수를 비우고 저장하면 해당 회차가 삭제</strong>됩니다.
              </div>
              {examLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0' }}>
                  <Loader2 size={22} className="spinner" />
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '128px 76px 140px 1fr', gap: 8, fontSize: 11, color: '#a1a1aa', marginBottom: 6, padding: '0 2px' }}>
                    <span />
                    <span>점수</span>
                    <span>날짜</span>
                    <span>메모</span>
                  </div>
                  {MOCK_EXAM_TYPES.map((t) => (
                    <div key={t} style={{ display: 'grid', gridTemplateColumns: '128px 76px 140px 1fr', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: '#e4e4e7' }}>{MOCK_EXAM_LABELS[t]}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={examForm[t].score}
                        onChange={(e) => setExamForm((f) => ({ ...f, [t]: { ...f[t], score: e.target.value } }))}
                        placeholder="—"
                        style={examInputStyle}
                      />
                      <input
                        type="date"
                        value={examForm[t].date}
                        onChange={(e) => setExamForm((f) => ({ ...f, [t]: { ...f[t], date: e.target.value } }))}
                        style={examInputStyle}
                      />
                      <input
                        type="text"
                        value={examForm[t].note}
                        onChange={(e) => setExamForm((f) => ({ ...f, [t]: { ...f[t], note: e.target.value } }))}
                        placeholder="메모"
                        style={examInputStyle}
                      />
                    </div>
                  ))}
                </>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setExamStudent(null)}
                  disabled={examBusy}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn-submit"
                  onClick={handleExamSave}
                  disabled={examBusy || examLoading}
                >
                  {examBusy ? <Loader2 size={14} className="spinner" /> : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 재설정 결과 모달 */}
      {resetResult && (
        <div className="modal-overlay" onClick={() => setResetResult(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>✓ 비밀번호 재설정 완료</h2>
              <button type="button" onClick={() => setResetResult(null)} className="modal-close">
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 12 }}>
                <strong>{resetResult.name}</strong> 학생의 비밀번호가 초기값으로 재설정되었습니다.
                학생에게 직접 전달해주세요.
              </p>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 12,
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 12, color: '#a1a1aa' }}>초기 비밀번호</span>
                <code style={{ flex: 1, fontSize: 16, color: '#fbbf24', fontWeight: 'bold', textAlign: 'center' }}>
                  {resetResult.password}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(resetResult.password);
                  }}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    border: '1px solid #52525b',
                    borderRadius: 4,
                    color: '#a1a1aa',
                    cursor: 'pointer',
                  }}
                >
                  <Copy size={14} />
                </button>
              </div>
              <p style={{ fontSize: 11, color: '#71717a', marginTop: 12 }}>
                학생이 로그인 후 본인이 직접 비밀번호를 변경하도록 안내해주세요.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal — 이메일 발송 백엔드 미구현. 전송되는 것처럼 속이지 않고 '준비 중' 으로 정직하게 표시 */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>학생 초대</h2>
            <p>학생의 이메일 주소를 입력하여 반에 초대하세요</p>

            <div style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: '#fbbf24', lineHeight: 1.5 }}>
              이메일 초대는 <strong>준비 중인 기능입니다.</strong> 아직 초대 메일이 발송되지 않습니다.
              지금은 <strong>학생 직접 등록</strong>을 이용해주세요.
            </div>

            <form onSubmit={(e) => e.preventDefault()}>
              <div className="form-group">
                <label>이메일 주소</label>
                <input name="inviteEmail" type="email" placeholder="student@example.com" />
              </div>

              <div className="form-group">
                <label>반 선택</label>
                <select name="inviteClass" defaultValue="">
                  <option value="" disabled>반을 선택하세요</option>
                  {classNames.filter(c => c !== '전체').map((c) => (
                    <option key={c} value={c as string}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowInviteModal(false)}>
                  취소
                </button>
                <button type="submit" className="btn-submit" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="준비 중인 기능입니다">
                  준비 중
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Add Modal — 학생 직접 등록 (반 없이도 가능) */}
      {showDirectAdd && (
        <div className="modal-overlay" onClick={() => setShowDirectAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>학생 직접 등록</h2>
              <button onClick={() => setShowDirectAdd(false)} style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <p>이름과 전화번호만 입력하면 등록 완료. 학생 ID = 전화번호, 초기 비밀번호 = 123456.</p>

            {credentials ? (
              <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 8, padding: 16, marginTop: 12 }}>
                <h3 style={{ margin: 0, marginBottom: 8, fontSize: 14, color: '#a5b4fc' }}>✓ 등록 완료 — 학생 로그인 정보</h3>
                <p style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 12 }}>학생에게 직접 전달하세요.</p>
                {/* email = "<phone>@local.suzag.com" 또는 "student-XXX@local.suzag.com".
                    학생 입장에서 보일 ID 는 도메인 제거한 전화번호(또는 코드). */}
                {(['email', 'password'] as const).map((field) => {
                  const label = field === 'email' ? '전화번호' : '비밀번호';
                  const value = field === 'email'
                    ? credentials.email.replace(/@local\.suzag\.com$/i, '')
                    : credentials.password;
                  return (
                    <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <label style={{ width: 70, fontSize: 12, color: '#a1a1aa' }}>{label}</label>
                      <code style={{ flex: 1, padding: '6px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, fontSize: 13, color: '#fff' }}>{value}</code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(value);
                          setCopiedField(field);
                          setTimeout(() => setCopiedField(null), 1500);
                        }}
                        style={{ background: 'transparent', border: '1px solid #52525b', borderRadius: 4, padding: '4px 8px', color: '#a1a1aa', cursor: 'pointer' }}
                      >
                        {copiedField === field ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn-submit"
                    onClick={() => {
                      setCredentials(null);
                      setAddForm({ fullName: '', grade: '', school: '', phone: '', email: '', password: '' });
                    }}
                  >
                    다른 학생 등록
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => {
                      setShowDirectAdd(false);
                      setCredentials(null);
                      setAddForm({ fullName: '', grade: '', school: '', phone: '', email: '', password: '' });
                      setAddClassId('');
                    }}
                  >
                    닫기
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!addForm.fullName.trim()) return;
                  if (!addForm.phone.trim()) {
                    alert('전화번호는 필수입니다 (학생 로그인 ID)');
                    return;
                  }
                  setAddBusy(true);
                  try {
                    const res = await fetch('/api/students', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        fullName: addForm.fullName.trim(),
                        grade: addForm.grade || null,
                        school: addForm.school.trim() || null,
                        phone: addForm.phone || null,
                        classId: addClassId || undefined, // 반 배정 (옵션) — 즉시 ACCEPTED
                        // 학생 ID = 전화번호 (서버에서 자동 변환).
                        // 이메일·비밀번호는 명시 안 함 — 서버가 phone→email + 초기비번 '123456' 자동 처리.
                      }),
                    });
                    const json = await res.json();
                    if (!res.ok) {
                      alert(json.error || '등록 실패');
                      return;
                    }
                    if (json.credentials) {
                      setCredentials({ email: json.credentials.email, password: json.credentials.password });
                    } else {
                      alert('학생 등록 완료 (기존 계정 활용)');
                      setShowDirectAdd(false);
                      setAddForm({ fullName: '', grade: '', school: '', phone: '', email: '', password: '' });
                      setAddClassId('');
                    }
                    loadStudents();
                  } catch (err) {
                    alert((err as Error).message);
                  } finally {
                    setAddBusy(false);
                  }
                }}
              >
                <div className="form-group">
                  <label>이름 *</label>
                  <input
                    type="text"
                    value={addForm.fullName}
                    onChange={(e) => setAddForm((f) => ({ ...f, fullName: e.target.value }))}
                    placeholder="홍길동"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>학년</label>
                  <select
                    value={addForm.grade}
                    onChange={(e) => setAddForm((f) => ({ ...f, grade: e.target.value }))}
                  >
                    <option value="">선택하세요</option>
                    <option value="7">중1</option>
                    <option value="8">중2</option>
                    <option value="9">중3</option>
                    <option value="10">고1</option>
                    <option value="11">고2</option>
                    <option value="12">고3</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>학교</label>
                  <input
                    type="text"
                    value={addForm.school}
                    onChange={(e) => setAddForm((f) => ({ ...f, school: e.target.value }))}
                    placeholder="학교명"
                  />
                </div>
                <div className="form-group">
                  <label>전화번호 * (학생 로그인 ID)</label>
                  <input
                    type="tel"
                    value={addForm.phone}
                    onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="010-1234-5678 또는 01012345678"
                    required
                  />
                  <p style={{ fontSize: 11, color: '#a78bfa', marginTop: 4 }}>
                    학생은 이 전화번호로 로그인합니다 (하이픈 자동 처리).
                    초기 비밀번호는 <strong>123456</strong> — 로그인 후 학생이 직접 변경.
                  </p>
                </div>
                <div className="form-group">
                  <label>반 배정 (선택)</label>
                  <select value={addClassId} onChange={(e) => setAddClassId(e.target.value)}>
                    <option value="">배정 안 함</option>
                    {(classOptions || []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>
                    선택하면 등록과 동시에 해당 반에 배정됩니다.
                  </p>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowDirectAdd(false)}>
                    취소
                  </button>
                  <button type="submit" className="btn-submit" disabled={addBusy || !addForm.fullName.trim() || !addForm.phone.trim()}>
                    {addBusy ? <Loader2 size={14} className="spinner" /> : '등록'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .students-page {
          max-width: 1200px;
          margin: 0 auto;
          min-height: 100vh;
          background: #000000;
          color: #ffffff;
        }

        .loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 60vh;
          gap: 16px;
          color: #a1a1aa;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding: 24px;
          background: rgba(24, 24, 27, 0.8);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .page-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 4px;
        }

        .page-header p {
          color: #a1a1aa;
          font-size: 14px;
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          font-size: 14px;
          font-weight: 600;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .stats-row {
          display: flex;
          gap: 24px;
          margin-bottom: 24px;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 24px;
          background: rgba(24, 24, 27, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
        }

        .stat-item svg {
          color: #a5b4fc;
        }

        .stat-item.active svg {
          color: #34d399;
        }

        .stat-item.pending svg {
          color: #fbbf24;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #ffffff;
        }

        .stat-label {
          font-size: 13px;
          color: #a1a1aa;
        }

        .filters {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(39, 39, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          flex: 1;
          min-width: 250px;
        }

        .search-box svg {
          color: #71717a;
        }

        .search-box input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 14px;
          background: transparent;
          color: #ffffff;
        }

        .search-box input::placeholder {
          color: #71717a;
        }

        .filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-group svg {
          color: #71717a;
        }

        .filter-group select {
          padding: 10px 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 14px;
          color: #ffffff;
          background: rgba(39, 39, 42, 0.8);
          cursor: pointer;
        }

        .filter-group select option {
          background: #27272a;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 24px;
          background: rgba(24, 24, 27, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          color: #71717a;
        }

        .empty-state h3 {
          margin: 16px 0 8px;
          font-size: 18px;
          font-weight: 600;
          color: #ffffff;
        }

        .empty-state p {
          margin-bottom: 24px;
          font-size: 14px;
        }

        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          background: rgba(127, 29, 29, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.35);
          border-radius: 16px;
          color: #fca5a5;
        }

        .error-state h3 {
          margin: 12px 0 4px;
          font-size: 18px;
          font-weight: 600;
          color: #ffffff;
        }

        .error-state p {
          margin-bottom: 20px;
          font-size: 14px;
          color: #a1a1aa;
        }

        .retry-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
          font-size: 14px;
          font-weight: 500;
          border: 1px solid rgba(239, 68, 68, 0.35);
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .retry-btn:hover {
          background: rgba(239, 68, 68, 0.25);
        }

        .btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: rgba(63, 63, 70, 0.5);
          color: #d4d4d8;
          font-size: 14px;
          font-weight: 500;
          border: none;
          border-radius: 10px;
          cursor: pointer;
        }

        .btn-secondary:hover {
          background: rgba(63, 63, 70, 0.8);
        }

        .student-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .student-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: rgba(24, 24, 27, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
        }

        .student-avatar {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          border-radius: 12px;
          color: white;
          font-size: 18px;
          font-weight: 600;
        }

        .student-info {
          flex: 1;
        }

        .student-name {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .student-name span:first-child {
          font-size: 16px;
          font-weight: 600;
          color: #ffffff;
        }

        .status-badge {
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 600;
          border-radius: 9999px;
        }

        .status-badge.accepted {
          background: rgba(5, 150, 105, 0.2);
          color: #34d399;
        }

        .status-badge.pending {
          background: rgba(217, 119, 6, 0.2);
          color: #fbbf24;
        }

        .student-details {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }

        .student-details span {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 13px;
          color: #a1a1aa;
        }

        .student-stats {
          display: flex;
          gap: 24px;
        }

        .student-stats .stat {
          text-align: center;
        }

        .student-stats .value {
          display: block;
          font-size: 18px;
          font-weight: 700;
          color: #ffffff;
        }

        .student-stats .label {
          font-size: 11px;
          color: #71717a;
        }

        .view-analytics {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          background: rgba(79, 70, 229, 0.15);
          color: #a5b4fc;
          font-size: 13px;
          font-weight: 500;
          border-radius: 8px;
          text-decoration: none;
          transition: background 0.2s;
        }

        .view-analytics:hover {
          background: rgba(79, 70, 229, 0.25);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          width: 100%;
          max-width: 420px;
          background: rgba(24, 24, 27, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 24px;
        }

        .modal h2 {
          font-size: 20px;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 8px;
        }

        .modal p {
          font-size: 14px;
          color: #a1a1aa;
          margin-bottom: 24px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #d4d4d8;
          margin-bottom: 6px;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 14px;
          background: rgba(39, 39, 42, 0.8);
          color: #ffffff;
        }

        .form-group input::placeholder {
          color: #71717a;
        }

        .form-group select option {
          background: #27272a;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: rgba(99, 102, 241, 0.5);
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }

        .btn-cancel {
          flex: 1;
          padding: 12px;
          background: rgba(63, 63, 70, 0.5);
          color: #d4d4d8;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-cancel:hover {
          background: rgba(63, 63, 70, 0.8);
        }

        .btn-submit {
          flex: 1;
          padding: 12px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        @media (max-width: 768px) {
          .page-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }

          .stats-row {
            flex-direction: column;
          }

          .student-card {
            flex-direction: column;
            align-items: flex-start;
          }

          .student-stats {
            width: 100%;
            justify-content: space-around;
            padding: 16px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            margin-top: 12px;
          }

          .view-analytics {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
