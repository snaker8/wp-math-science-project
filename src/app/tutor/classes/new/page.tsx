'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Users,
  BookOpen,
  Calendar,
  Clock,
  Check,
  ChevronRight,
  Sparkles,
  Info,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { GlowCard } from '@/components/shared/GlowCard';

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

      const { data: userData, error: userError } = await supabaseBrowser
        .from('users')
        .select('institute_id')
        .eq('id', user.id)
        .single();

      if (userError || !userData?.institute_id) {
        throw new Error('소속 학원 정보를 찾을 수 없습니다');
      }

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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="new-class-page"
    >
      <header className="page-header">
        <div className="header-left">
          <Link href="/tutor/classes" className="back-btn">
            <ArrowLeft size={18} />
          </Link>
          <div className="header-title-area">
            <h1>새 반 개설</h1>
            <p>새로운 학습 그룹을 만들고 수업 환경을 설정하세요</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="form-container">
        <GlowCard className="form-glow-card">
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="error-message"
            >
              <Info size={16} />
              <span>{error}</span>
            </motion.div>
          )}

          {/* 기본 정보 */}
          <section className="form-section">
            <div className="section-header">
              <Sparkles size={16} className="text-indigo-400" />
              <h2>기본 정보</h2>
            </div>

            <div className="inputs-grid">
              <div className="form-group full">
                <label htmlFor="name">반 이름 *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="예: 수학I 심화반, 중2-1 내신대비 A반"
                  required
                />
              </div>

              <div className="form-group full">
                <label htmlFor="description">반 설명 / 공지</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="반의 특징이나 운영 방식을 간단히 적어주세요"
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label htmlFor="subject">과목</label>
                <div className="select-wrapper">
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
              </div>

              <div className="form-group">
                <label htmlFor="grade">대상 학년</label>
                <div className="select-wrapper">
                  <select
                    id="grade"
                    name="grade"
                    value={formData.grade}
                    onChange={handleInputChange}
                  >
                    <option value="">학년 선택</option>
                    <optgroup label="초등">
                      {[1, 2, 3, 4, 5, 6].map((g) => (
                        <option key={g} value={g}>초등 {g}학년</option>
                      ))}
                    </optgroup>
                    <optgroup label="중등">
                      {[7, 8, 9].map((g) => (
                        <option key={g} value={g}>중등 {g - 6}학년</option>
                      ))}
                    </optgroup>
                    <optgroup label="고등">
                      {[10, 11, 12].map((g) => (
                        <option key={g} value={g}>고등 {g - 9}학년</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="maxStudents">
                  <Users size={14} />
                  정원 (최대 학생 수)
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
            </div>
          </section>

          {/* 수업 일정 */}
          <section className="form-section">
            <div className="section-header">
              <Calendar size={16} className="text-indigo-400" />
              <h2>수업 일정</h2>
            </div>

            <div className="inputs-grid">
              <div className="form-group full">
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
                      {formData.scheduleDays.includes(day.value) && (
                        <motion.div
                          layoutId="day-active"
                          className="day-active-dot"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="scheduleTime">
                  <Clock size={14} />
                  수업 시작 시간
                </label>
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
                <div className="select-wrapper">
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
            </div>
          </section>

          {/* Submit */}
          <div className="form-footer">
            <Link href="/tutor/classes" className="btn-secondary">
              취소
            </Link>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? (
                <div className="spinner-small" />
              ) : (
                <>
                  <span>반 개설하기</span>
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </div>
        </GlowCard>
      </form>

      <style jsx>{`
        .new-class-page {
          max-width: 800px;
          margin: 0 auto;
          padding: 32px;
          min-height: 100vh;
          background: #000000;
          color: #ffffff;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
          padding: 24px 32px;
          background: rgba(24, 24, 27, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          backdrop-filter: blur(12px);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          background: rgba(39, 39, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #a1a1aa;
          border-radius: 12px;
          transition: all 0.2s;
        }

        .back-btn:hover {
          background: rgba(63, 63, 70, 0.8);
          color: #ffffff;
          transform: translateX(-2px);
        }

        .header-title-area h1 {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.025em;
          margin-bottom: 2px;
        }

        .header-title-area p {
          font-size: 13px;
          color: #71717a;
        }

        .form-glow-card {
          padding: 12px !important;
          background: rgba(9, 9, 11, 0.6) !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.2);
          border-radius: 12px;
          color: #f87171;
          font-size: 14px;
          font-weight: 500;
          margin-top: -12px;
          margin-bottom: 24px;
        }

        .form-section {
          padding: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .form-section:last-of-type {
          border-bottom: none;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 24px;
        }

        .section-header h2 {
          font-size: 16px;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.01em;
        }

        .inputs-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group.full {
          grid-column: span 2;
        }

        .form-group label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #a1a1aa;
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
          width: 100%;
          padding: 12px 16px;
          background: rgba(24, 24, 27, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          font-size: 14px;
          color: #ffffff;
          transition: all 0.2s;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          outline: none;
          background: rgba(39, 39, 42, 0.9);
          border-color: rgba(99, 102, 241, 0.4);
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.05);
        }

        .form-group textarea {
          resize: none;
        }

        .select-wrapper {
          position: relative;
        }

        .day-selector {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .day-btn {
          position: relative;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(39, 39, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          color: #71717a;
          cursor: pointer;
          transition: all 0.2s;
        }

        .day-btn:hover {
          background: rgba(63, 63, 70, 0.6);
          color: #ffffff;
        }

        .day-btn.selected {
          background: rgba(99, 102, 241, 0.1);
          border-color: rgba(99, 102, 241, 0.3);
          color: #a5b4fc;
        }

        .day-active-dot {
          position: absolute;
          bottom: 6px;
          width: 4px;
          height: 4px;
          background: #818cf8;
          border-radius: 50%;
        }

        .form-footer {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 16px;
          padding: 24px;
          background: rgba(24, 24, 27, 0.4);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 0 0 20px 20px;
        }

        .btn-secondary {
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 600;
          color: #a1a1aa;
          text-decoration: none;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          color: #ffffff;
        }

        .btn-submit {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 28px;
          background: #ffffff;
          color: #000000;
          font-size: 15px;
          font-weight: 800;
          border: none;
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 8px 16px -4px rgba(255, 255, 255, 0.1);
        }

        .btn-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 20px -4px rgba(255, 255, 255, 0.2);
          background: #f4f4f5;
        }

        .btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          filter: grayscale(1);
        }

        .spinner-small {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(0, 0, 0, 0.1);
          border-top-color: #000000;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 640px) {
          .new-class-page {
            padding: 20px;
          }

          .inputs-grid {
            grid-template-columns: 1fr;
          }

          .form-group.full {
            grid-column: span 1;
          }
        }
      `}</style>
    </motion.div>
  );
}
