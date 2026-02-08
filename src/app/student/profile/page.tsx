'use client';

import { useState } from 'react';
import { User, Mail, Phone, School, Calendar, Edit2, Save, X } from 'lucide-react';

export default function StudentProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    name: '홍길동',
    email: 'student@example.com',
    phone: '010-1234-5678',
    school: '서울고등학교',
    grade: '고등학교 2학년',
    joinDate: '2024-03-01',
  });

  const [editForm, setEditForm] = useState(profile);

  const handleSave = () => {
    setProfile(editForm);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditForm(profile);
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <User className="text-indigo-400" />
            내 정보
          </h1>
          <p className="text-zinc-400 mt-2">프로필 정보를 확인하고 수정하세요</p>
        </header>

        {/* Profile Card */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl overflow-hidden">
          {/* Header with Avatar */}
          <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 p-8 text-center">
            <div className="w-24 h-24 mx-auto bg-indigo-500/30 rounded-full flex items-center justify-center mb-4">
              <User size={48} className="text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold">{profile.name}</h2>
            <p className="text-zinc-400">{profile.grade}</p>
          </div>

          {/* Profile Details */}
          <div className="p-6 space-y-4">
            {isEditing ? (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">이름</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full bg-zinc-800 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">이메일</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full bg-zinc-800 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">전화번호</label>
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full bg-zinc-800 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">학교</label>
                    <input
                      type="text"
                      value={editForm.school}
                      onChange={(e) => setEditForm({ ...editForm, school: e.target.value })}
                      className="w-full bg-zinc-800 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleSave}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 py-2 rounded-lg transition-all"
                  >
                    <Save size={18} />
                    저장
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 py-2 rounded-lg transition-all"
                  >
                    <X size={18} />
                    취소
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-lg">
                  <Mail className="text-zinc-500" size={20} />
                  <div>
                    <div className="text-sm text-zinc-400">이메일</div>
                    <div>{profile.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-lg">
                  <Phone className="text-zinc-500" size={20} />
                  <div>
                    <div className="text-sm text-zinc-400">전화번호</div>
                    <div>{profile.phone}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-lg">
                  <School className="text-zinc-500" size={20} />
                  <div>
                    <div className="text-sm text-zinc-400">학교</div>
                    <div>{profile.school}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-lg">
                  <Calendar className="text-zinc-500" size={20} />
                  <div>
                    <div className="text-sm text-zinc-400">가입일</div>
                    <div>{profile.joinDate}</div>
                  </div>
                </div>

                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-lg transition-all mt-4"
                >
                  <Edit2 size={18} />
                  프로필 수정
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
