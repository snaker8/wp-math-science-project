'use client';

import { useState, useEffect } from 'react';
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
  Filter,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  grade: string | null;
  className: string | null;
  classId: string | null;
  status: 'ACCEPTED' | 'PENDING' | 'REJECTED';
  enrolledAt: string;
  lastActivity: string | null;
  totalProblems: number;
  correctRate: number;
}

export default function TutorStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('전체');
  const [filterStatus, setFilterStatus] = useState('전체');
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    if (!supabaseBrowser) {
      // Mock data
      setStudents([
        {
          id: '1',
          name: '김철수',
          email: 'student1@example.com',
          phone: '010-1234-5678',
          grade: '고1',
          className: 'A반',
          classId: 'class-1',
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
          className: 'A반',
          classId: 'class-1',
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
          className: 'B반',
          classId: 'class-2',
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
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) return;

      // Get all classes for this tutor
      const { data: classes } = await supabaseBrowser
        .from('classes')
        .select('id, name')
        .eq('tutor_id', user.id)
        .is('deleted_at', null);

      if (!classes || classes.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      // Get all enrollments for these classes
      const classIds = classes.map((c) => c.id);
      const { data: enrollments } = await supabaseBrowser
        .from('class_enrollments')
        .select(`
          id,
          status,
          enrolled_at,
          class_id,
          student:users!class_enrollments_student_id_fkey (
            id,
            name,
            email,
            phone
          )
        `)
        .in('class_id', classIds);

      const studentList: Student[] = (enrollments || []).map((e: any) => {
        const cls = classes.find((c) => c.id === e.class_id);
        return {
          id: e.student?.id || e.id,
          name: e.student?.name || '이름 없음',
          email: e.student?.email || '',
          phone: e.student?.phone || null,
          grade: null,
          className: cls?.name || null,
          classId: e.class_id,
          status: e.status,
          enrolledAt: e.enrolled_at,
          lastActivity: null,
          totalProblems: 0,
          correctRate: 0,
        };
      });

      setStudents(studentList);
    } catch (error) {
      console.error('Failed to load students:', error);
    } finally {
      setLoading(false);
    }
  };

  const classNames = ['전체', ...new Set(students.map((s) => s.className).filter(Boolean))];
  const statuses = ['전체', 'ACCEPTED', 'PENDING'];

  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = filterClass === '전체' || student.className === filterClass;
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
          <p>반에 등록된 학생들을 관리하세요</p>
        </div>
        <button className="btn-primary" onClick={() => setShowInviteModal(true)}>
          <UserPlus size={18} />
          학생 초대
        </button>
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
            placeholder="이름 또는 이메일로 검색..."
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
      {filteredStudents.length === 0 ? (
        <div className="empty-state">
          <GraduationCap size={48} />
          <h3>등록된 학생이 없습니다</h3>
          <p>학생을 초대하여 반에 등록하세요</p>
          <button className="btn-secondary" onClick={() => setShowInviteModal(true)}>
            <UserPlus size={18} />
            첫 학생 초대
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
                  <span
                    className={`status-badge ${student.status.toLowerCase()}`}
                  >
                    {student.status === 'ACCEPTED' ? '활성' : '대기중'}
                  </span>
                </div>
                <div className="student-details">
                  <span>
                    <Mail size={14} />
                    {student.email}
                  </span>
                  {student.phone && (
                    <span>
                      <Phone size={14} />
                      {student.phone}
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
                <div className="stat">
                  <span className="value">{student.totalProblems}</span>
                  <span className="label">풀이 문제</span>
                </div>
                <div className="stat">
                  <span className="value">{student.correctRate}%</span>
                  <span className="label">정답률</span>
                </div>
              </div>

              <Link href={`/tutor/analytics?student=${student.id}`} className="view-analytics">
                <BarChart3 size={16} />
                분석 보기
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>학생 초대</h2>
            <p>학생의 이메일 주소를 입력하여 반에 초대하세요</p>

            <form onSubmit={(e) => { e.preventDefault(); setShowInviteModal(false); }}>
              <div className="form-group">
                <label>이메일 주소</label>
                <input type="email" placeholder="student@example.com" required />
              </div>

              <div className="form-group">
                <label>반 선택</label>
                <select defaultValue="">
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
                <button type="submit" className="btn-submit">
                  초대 보내기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .students-page {
          max-width: 1200px;
          margin: 0 auto;
        }

        .loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 60vh;
          gap: 16px;
          color: #6b7280;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #e5e7eb;
          border-top-color: #4f46e5;
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
        }

        .page-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 4px;
        }

        .page-header p {
          color: #6b7280;
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
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
        }

        .stat-item svg {
          color: #4f46e5;
        }

        .stat-item.active svg {
          color: #22c55e;
        }

        .stat-item.pending svg {
          color: #f59e0b;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #1f2937;
        }

        .stat-label {
          font-size: 13px;
          color: #6b7280;
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
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          flex: 1;
          min-width: 250px;
        }

        .search-box svg {
          color: #9ca3af;
        }

        .search-box input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 14px;
        }

        .filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-group svg {
          color: #6b7280;
        }

        .filter-group select {
          padding: 10px 16px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
          color: #374151;
          background: white;
          cursor: pointer;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 24px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          color: #9ca3af;
        }

        .empty-state h3 {
          margin: 16px 0 8px;
          font-size: 18px;
          font-weight: 600;
          color: #374151;
        }

        .empty-state p {
          margin-bottom: 24px;
          font-size: 14px;
        }

        .btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: #f3f4f6;
          color: #374151;
          font-size: 14px;
          font-weight: 500;
          border: none;
          border-radius: 10px;
          cursor: pointer;
        }

        .btn-secondary:hover {
          background: #e5e7eb;
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
          background: white;
          border: 1px solid #e5e7eb;
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
          color: #1f2937;
        }

        .status-badge {
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 600;
          border-radius: 9999px;
        }

        .status-badge.accepted {
          background: #dcfce7;
          color: #16a34a;
        }

        .status-badge.pending {
          background: #fef3c7;
          color: #d97706;
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
          color: #6b7280;
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
          color: #1f2937;
        }

        .student-stats .label {
          font-size: 11px;
          color: #9ca3af;
        }

        .view-analytics {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          background: #eef2ff;
          color: #4f46e5;
          font-size: 13px;
          font-weight: 500;
          border-radius: 8px;
          text-decoration: none;
          transition: background 0.2s;
        }

        .view-analytics:hover {
          background: #e0e7ff;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          width: 100%;
          max-width: 420px;
          background: white;
          border-radius: 16px;
          padding: 24px;
        }

        .modal h2 {
          font-size: 20px;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 8px;
        }

        .modal p {
          font-size: 14px;
          color: #6b7280;
          margin-bottom: 24px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 6px;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #4f46e5;
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
          background: #f3f4f6;
          color: #374151;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
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
            border-top: 1px solid #f3f4f6;
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
