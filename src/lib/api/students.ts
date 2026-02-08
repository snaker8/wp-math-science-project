// ============================================================================
// Students API Service
// 학생 관리 CRUD
// ============================================================================

import { supabaseBrowser } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/client';

type User = Database['public']['Tables']['users']['Row'];
type UserInsert = Database['public']['Tables']['users']['Insert'];
type UserUpdate = Database['public']['Tables']['users']['Update'];

export interface Student {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  grade: number | null;
  avatarUrl: string | null;
  parentId: string | null;
  instituteId: string | null;
  createdAt: string;
  updatedAt: string;
}

// User Row를 Student로 변환
function toStudent(user: User): Student {
  return {
    id: user.id,
    name: user.full_name,
    email: user.email,
    phone: user.phone,
    grade: user.grade,
    avatarUrl: user.avatar_url,
    parentId: user.parent_id,
    instituteId: user.institute_id,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

/**
 * 학생 목록 조회
 */
export async function getStudents(options?: {
  instituteId?: string;
  grade?: number;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Student[]; count: number }> {
  if (!supabaseBrowser) {
    throw new Error('[API] Supabase not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  let query = supabaseBrowser
    .from('users')
    .select('*', { count: 'exact' })
    .eq('role', 'STUDENT')
    .is('deleted_at', null);

  if (options?.instituteId) {
    query = query.eq('institute_id', options.instituteId);
  }
  if (options?.grade) {
    query = query.eq('grade', options.grade);
  }
  if (options?.search) {
    query = query.or(`full_name.ilike.%${options.search}%,email.ilike.%${options.search}%`);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error, count } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('[API] getStudents error:', error);
    throw error;
  }

  return {
    data: (data || []).map(toStudent),
    count: count || 0,
  };
}

/**
 * 학생 상세 조회
 */
export async function getStudent(id: string): Promise<Student | null> {
  if (!supabaseBrowser) {
    throw new Error('[API] Supabase not configured');
  }

  const { data, error } = await supabaseBrowser
    .from('users')
    .select('*')
    .eq('id', id)
    .eq('role', 'STUDENT')
    .single();

  if (error) {
    console.error('[API] getStudent error:', error);
    return null;
  }

  return data ? toStudent(data) : null;
}

/**
 * 학생 생성
 */
export async function createStudent(student: {
  name: string;
  email: string;
  phone?: string;
  grade?: number;
  instituteId?: string;
}): Promise<Student | null> {
  if (!supabaseBrowser) {
    console.warn('[API] Supabase not configured');
    return null;
  }

  const { data, error } = await supabaseBrowser
    .from('users')
    .insert({
      id: crypto.randomUUID(),
      full_name: student.name,
      email: student.email,
      phone: student.phone || null,
      grade: student.grade || null,
      institute_id: student.instituteId || null,
      role: 'STUDENT',
      preferences: {},
      avatar_url: null,
      parent_id: null,
      last_login_at: null,
      deleted_at: null,
    })
    .select()
    .single();

  if (error) {
    console.error('[API] createStudent error:', error);
    return null;
  }

  return data ? toStudent(data) : null;
}

/**
 * 학생 수정
 */
export async function updateStudent(
  id: string,
  updates: {
    name?: string;
    phone?: string;
    grade?: number;
  }
): Promise<Student | null> {
  if (!supabaseBrowser) {
    console.warn('[API] Supabase not configured');
    return null;
  }

  const updateData: UserUpdate = {};
  if (updates.name) updateData.full_name = updates.name;
  if (updates.phone !== undefined) updateData.phone = updates.phone;
  if (updates.grade !== undefined) updateData.grade = updates.grade;

  const { data, error } = await supabaseBrowser
    .from('users')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[API] updateStudent error:', error);
    return null;
  }

  return data ? toStudent(data) : null;
}

/**
 * 학생 삭제 (소프트 삭제)
 */
export async function deleteStudent(id: string): Promise<boolean> {
  if (!supabaseBrowser) {
    console.warn('[API] Supabase not configured');
    return false;
  }

  const { error } = await supabaseBrowser
    .from('users')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[API] deleteStudent error:', error);
    return false;
  }

  return true;
}

// ============================================================================
// Mock Data (Supabase 미설정 시 사용)
// ============================================================================

function getMockStudents(): Student[] {
  return [
    { id: '1', name: '김민준', email: 'minjun@test.com', phone: '010-1234-5678', grade: 10, avatarUrl: null, parentId: null, instituteId: null, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: '2', name: '이서연', email: 'seoyeon@test.com', phone: '010-2345-6789', grade: 10, avatarUrl: null, parentId: null, instituteId: null, createdAt: '2024-01-02', updatedAt: '2024-01-02' },
    { id: '3', name: '박지호', email: 'jiho@test.com', phone: '010-3456-7890', grade: 11, avatarUrl: null, parentId: null, instituteId: null, createdAt: '2024-01-03', updatedAt: '2024-01-03' },
    { id: '4', name: '최수아', email: 'sua@test.com', phone: '010-4567-8901', grade: 11, avatarUrl: null, parentId: null, instituteId: null, createdAt: '2024-01-04', updatedAt: '2024-01-04' },
    { id: '5', name: '정예준', email: 'yejun@test.com', phone: '010-5678-9012', grade: 12, avatarUrl: null, parentId: null, instituteId: null, createdAt: '2024-01-05', updatedAt: '2024-01-05' },
    { id: '6', name: '한소희', email: 'sohee@test.com', phone: '010-6789-0123', grade: 10, avatarUrl: null, parentId: null, instituteId: null, createdAt: '2024-01-06', updatedAt: '2024-01-06' },
    { id: '7', name: '장동건', email: 'donggun@test.com', phone: '010-7890-1234', grade: 11, avatarUrl: null, parentId: null, instituteId: null, createdAt: '2024-01-07', updatedAt: '2024-01-07' },
    { id: '8', name: '강동원', email: 'dongwon@test.com', phone: '010-8901-2345', grade: 12, avatarUrl: null, parentId: null, instituteId: null, createdAt: '2024-01-08', updatedAt: '2024-01-08' },
  ];
}
