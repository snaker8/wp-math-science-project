'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  FileText,
  Hash,
  Save,
  Sparkles,
  UserMinus,
  Mail,
} from 'lucide-react';

interface EnrolledStudent {
  id: string;
  name: string;
  email: string;
}

const MOCK_CLASS = {
  name: '중등 수학 A반',
  description: '중학교 1학년 기초반',
  maxStudents: 30,
};

const MOCK_STUDENTS: EnrolledStudent[] = [
  { id: 's1', name: '김민준', email: 'minjun.kim@example.com' },
  { id: 's2', name: '이서연', email: 'seoyeon.lee@example.com' },
  { id: 's3', name: '박지호', email: 'jiho.park@example.com' },
  { id: 's4', name: '최수아', email: 'sua.choi@example.com' },
  { id: 's5', name: '정예준', email: 'yejun.jung@example.com' },
];

export default function EditClassPage() {
  const router = useRouter();

  const [className, setClassName] = useState(MOCK_CLASS.name);
  const [description, setDescription] = useState(MOCK_CLASS.description);
  const [maxStudents, setMaxStudents] = useState(MOCK_CLASS.maxStudents);
  const [students, setStudents] = useState<EnrolledStudent[]>(MOCK_STUDENTS);

  const handleSave = () => {
    if (!className.trim()) {
      alert('반 이름을 입력해주세요.');
      return;
    }
    alert('반 정보가 저장되었습니다.');
  };

  const handleCancel = () => {
    router.back();
  };

  const handleRemoveStudent = (student: EnrolledStudent) => {
    if (confirm(`${student.name} 학생을 이 반에서 제거하시겠습니까?`)) {
      setStudents((prev) => prev.filter((s) => s.id !== student.id));
      alert(`${student.name} 학생이 제거되었습니다.`);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-[800px] mx-auto p-8">
        {/* Header */}
        <header className="flex items-center gap-5 mb-8 p-6 bg-zinc-900/40 border border-white/5 rounded-2xl backdrop-blur-xl">
          <Link
            href="/tutor/classes"
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
                    key={student.id}
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
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-3 text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 px-7 py-3 bg-white text-black text-[15px] font-extrabold rounded-[14px] hover:bg-zinc-100 hover:-translate-y-0.5 transition-all shadow-[0_8px_16px_-4px_rgba(255,255,255,0.1)]"
            >
              <Save size={16} />
              <span>저장</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
