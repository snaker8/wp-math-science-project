// ============================================================================
// Supabase Server Client (서버 사이드 전용)
// API Routes, Server Components에서만 사용
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSupabaseConfigured } from './client';

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Server client with cookies (서버 컴포넌트/API 라우트용)
 * Returns null if Supabase is not configured
 */
export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
          });
        } catch {
          // Server Component에서는 쿠키 설정 불가
        }
      },
    },
  });
}

/**
 * Admin client (Service Role - 서버 전용, RLS 우회)
 * Returns null if Supabase is not configured
 */
export const supabaseAdmin = isSupabaseConfigured && supabaseServiceKey && !supabaseServiceKey.includes('your-')
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;
