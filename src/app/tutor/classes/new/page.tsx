'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

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

const DAYS = [
  { value: 'MON', label: '월' },
  { value: 'TUE', label: '화' },
  { value: 'WED', label: '수' },
  { value: 'THU', label: '목' },
  { value: 'FRI', label: '금' },
  { value: 'SAT', label: '토' },
  { value: 'SUN', label: '일' },
];

export default function NewClassPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subject: '',
    grade: '',
    maxStudents: '30',
    scheduleDays: [] as string[],
    scheduleTime: '',
    scheduleDuration: '90',
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleDayToggle = (day: string) => {
    setFormData((prev) => ({
      ...prev,
      scheduleDays: prev.scheduleDays.includes(day)
        ? prev.scheduleDays.filter((d) => d !== day)
        : [...prev.scheduleDays, day],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('반 이름을 입력해주세요');
      return;
    }

    if (!supabaseBrowser) {
      setError('Supabase가 설정되지 않았습니다');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) {
        throw new Error('로그인이 필요합니다');
      }

      // 사용자 정보 조회 (institute_id 가져오기)
      const { data: userData, error: userError } = await supabaseBrowser
        .from('users')
        .select('institute_id')
        .eq('id', user.id)
        .single();

      if (userError || !userData?.institute_id) {
        throw new Error('소속 학원 정보를 찾을 수 없습니다');
      }

      // 반 생성
      const schedule = formData.scheduleDays.length > 0 || formData.scheduleTime
        ? {
            days: formData.scheduleDays,
            time: formData.scheduleTime || null,
            duration_minutes: parseInt(formData.scheduleDuration) || 90,
          }
        : {};

      const { data: newClass, error: insertError } = await supabaseBrowser
        .from('classes')
        .insert({
          institute_id: userData.institute_id,
          tutor_id: user.id,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          subject: formData.subject || null,
          grade: formData.grade ? parseInt(formData.grade) : null,
          max_students: parseInt(formData.maxStudents) || 30,
          schedule,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('이미 같은 이름의 반이 존재합니다');
        }
        throw insertError;
      }

      // 성공 -> 반 상세 페이지로 이동
      router.push(`/tutor/classes/${newClass.id}`);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('반 생성 중 오류가 발생했습니다');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-class-page">
      <header className="page-header">
        <Link href="/tutor/classes" className="back-btn">
          <ArrowLeft size={20} />
          뒤로
        </Link>
        <h1>새 반 만들기</h1>
      </header>

      <form onSubmit={handleSubmit} className="form-card">
        {error && <div className="error-message">{error}</div>}

        {/* 기본 정보 */}
        <section className="form-section">
          <h2>기본 정보</h2>

          <div className="form-group">
            <label htmlFor="name">반 이름 *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="예: 수학I A반, 미적분 심화반"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">설명</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="반에 대한 간단한 설명을 입력하세요"
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="subject">과목</label>
              <select
                id="subject"
                name="subject"
                value={formData.subject}
                onChange={handleInputChange}
              >
                <option value="">과목 선택</option>
                {SUBJECTS.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="grade">대상 학년</label>
              <select
                id="grade"
                name="grade"
                value={formData.grade}
                onChange={handleInputChange}
              >
                <option value="">학년 선택</option>
                <optgroup label="초등">
                  {[1, 2, 3, 4, 5, 6].map((g) => (
                    <option key={g} value={g}>
                      초{g}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="중등">
                  {[7, 8, 9].map((g) => (
                    <option key={g} value={g}>
                      중{g - 6}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="고등">
                  {[10, 11, 12].map((g) => (
                    <option key={g} value={g}>
                      고{g - 9}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="maxStudents">
              <Users size={16} />
              최대 학생 수
            </label>
            <input
              type="number"
              id="maxStudents"
              name="maxStudents"
              value={formData.maxStudents}
              onChange={handleInputChange}
              min="1"
              max="100"
            />
          </div>
        </section>

        {/* 수업 일정 */}
        <section className="form-section">
          <h2>수업 일정 (선택)</h2>

          <div className="form-group">
            <label>수업 요일</label>
            <div className="day-selector">
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  className={`day-btn ${formData.scheduleDays.includes(day.value) ? 'selected' : ''}`}
                  onClick={() => handleDayToggle(day.value)}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="scheduleTime">수업 시간</label>
              <input
                type="time"
                id="scheduleTime"
                name="scheduleTime"
                value={formData.scheduleTime}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="scheduleDuration">수업 시간(분)</label>
              <select
                id="scheduleDuration"
                name="scheduleDuration"
                value={formData.scheduleDuration}
                onChange={handleInputChange}
              >
                <option value="60">60분</option>
                <option value="90">90분</option>
                <option value="120">120분</option>
                <option value="150">150분</option>
                <option value="180">180분</option>
              </select>
            </div>
          </div>
        </section>

        {/* Submit */}
        <div className="form-actions">
          <Link href="/tutor/classes" className="btn-cancel">
            취소
          </Link>
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? '생성 중...' : '반 만들기'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .new-class-page {
          max-width: 700px;
          margin: 0 auto;
          min-height: 100vh;
          background: #000000;
          color: #ffffff;
        }

        .page-header {
          margin-bottom: 24px;
        }

        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #a1a1aa;
          font-size: 14px;
          text-decoration: none;
          margin-bottom: 12px;
        }

        .back-btn:hover {
          color: #e4e4e7;
        }

        .page-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #ffffff;
        }

        .form-card {
          background: rgba(24, 24, 27, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 32px;
        }

        .error-message {
          padding: 12px 16px;
          background: rgba(220, 38, 38, 0.15);
          border: 1px solid rgba(248, 113, 113, 0.3);
          border-radius: 8px;
          color: #f87171;
          font-size: 14px;
          margin-bottom: 24px;
        }

        .form-section {
          margin-bottom: 32px;
        }

        .form-section:last-of-type {
          margin-bottom: 0;
        }

        .form-section h2 {
          font-size: 16px;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          font-weight: 500;
          color: #d4d4d8;
          margin-bottom: 6px;
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
          width: 100%;
          padding: 12px 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s;
          background: rgba(39, 39, 42, 0.8);
          color: #ffffff;
        }

        .form-group input::placeholder,
        .form-group textarea::placeholder {
          color: #71717a;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          outline: none;
          border-color: rgba(99, 102, 241, 0.5);
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }

        .form-group select option {
          background: #27272a;
          color: #ffffff;
        }

        .form-group textarea {
          resize: vertical;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .day-selector {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .day-btn {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          background: rgba(39, 39, 42, 0.5);
          font-size: 14px;
          font-weight: 500;
          color: #a1a1aa;
          cursor: pointer;
          transition: all 0.2s;
        }

        .day-btn:hover {
          border-color: rgba(99, 102, 241, 0.3);
        }

        .day-btn.selected {
          border-color: rgba(99, 102, 241, 0.5);
          background: rgba(79, 70, 229, 0.15);
          color: #a5b4fc;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .btn-cancel {
          padding: 12px 24px;
          background: rgba(63, 63, 70, 0.5);
          color: #d4d4d8;
          font-size: 14px;
          font-weight: 500;
          border-radius: 8px;
          text-decoration: none;
          transition: background 0.2s;
        }

        .btn-cancel:hover {
          background: rgba(63, 63, 70, 0.8);
        }

        .btn-submit {
          padding: 12px 24px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          font-size: 14px;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .btn-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 640px) {
          .form-card {
            padding: 24px;
          }

          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
