// ============================================================================
// Supabase Browser Client (클라이언트 사이드 전용)
// ============================================================================

import { createBrowserClient } from '@supabase/ssr';

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Check if Supabase is properly configured
export const isSupabaseConfigured = supabaseUrl &&
  !supabaseUrl.includes('your-project') &&
  supabaseAnonKey &&
  !supabaseAnonKey.includes('your-');

/**
 * Browser client (클라이언트 사이드용)
 * @supabase/ssr 기본 설정 사용 (자동 쿠키 관리)
 * Returns null if Supabase is not configured
 */
export const supabaseBrowser = isSupabaseConfigured
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Database Types (generated from schema)
 */
export type Database = {
  public: {
    Tables: {
      institutes: {
        Row: {
          id: string;
          name: string;
          business_number: string | null;
          plan_tier: 'LITE' | 'CORE' | 'PRO';
          plan_started_at: string | null;
          plan_expires_at: string | null;
          address: string | null;
          phone: string | null;
          email: string | null;
          max_teachers: number;
          max_students: number;
          max_problems: number;
          max_storage_gb: number;
          settings: Record<string, unknown>;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['institutes']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['institutes']['Insert']>;
      };
      users: {
        Row: {
          id: string;
          institute_id: string | null;
          email: string;
          full_name: string;
          phone: string | null;
          role: 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';
          avatar_url: string | null;
          grade: number | null;
          parent_id: string | null;
          preferences: Record<string, unknown>;
          last_login_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      source_files: {
        Row: {
          id: string;
          institute_id: string;
          uploaded_by: string;
          file_name: string;
          file_type: 'PDF' | 'IMG' | 'HWP';
          file_size_bytes: number;
          storage_path: string;
          ocr_status: string;
          ocr_result: Record<string, unknown> | null;
          ocr_processed_at: string | null;
          page_count: number | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['source_files']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['source_files']['Insert']>;
      };
      problems: {
        Row: {
          id: string;
          institute_id: string | null;
          created_by: string | null;
          source_file_id: string | null;
          content_latex: string;
          content_html: string | null;
          solution_latex: string | null;
          solution_html: string | null;
          answer_json: Record<string, unknown>;
          images: unknown[];
          status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'ARCHIVED';
          source_name: string | null;
          source_year: number | null;
          source_month: number | null;
          source_number: number | null;
          ai_analysis: Record<string, unknown>;
          tags: string[] | null;
          view_count: number;
          usage_count: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['problems']['Row'], 'id' | 'created_at' | 'updated_at' | 'view_count' | 'usage_count'>;
        Update: Partial<Database['public']['Tables']['problems']['Insert']>;
      };
      classifications: {
        Row: {
          id: string;
          problem_id: string;
          type_code: string;
          type_id: string | null;
          expanded_type_code: string | null;
          difficulty: '1' | '2' | '3' | '4' | '5';
          cognitive_domain: 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';
          ai_confidence: number | null;
          is_verified: boolean;
          verified_by: string | null;
          verified_at: string | null;
          estimated_time_minutes: number | null;
          prerequisite_types: string[] | null;
          classification_source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['classifications']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['classifications']['Insert']>;
      };
      expanded_math_types: {
        Row: {
          id: string;
          type_code: string;
          type_name: string;
          description: string | null;
          solution_method: string | null;
          subject: string;
          area: string;
          standard_code: string;
          standard_content: string | null;
          cognitive: string;
          difficulty_min: number;
          difficulty_max: number;
          keywords: string[];
          school_level: string;
          level_code: string;
          domain_code: string;
          is_active: boolean;
          problem_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['expanded_math_types']['Row'], 'id' | 'created_at' | 'updated_at' | 'problem_count'>;
        Update: Partial<Database['public']['Tables']['expanded_math_types']['Insert']>;
      };
    };
  };
};
