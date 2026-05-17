// ============================================================================
// API Input Validation Helpers (zod 기반)
//
// 목적: 보안 감사 F-1 — POST/PATCH 본문 검증 누락으로 임의 JSON·잘못된 enum
//   값·음수 등이 DB 까지 도달하던 사고 차단.
//
// 사용 패턴:
//   const result = parseBody(request, classCreateSchema);
//   if (!result.ok) return result.response;
//   const { name, subject, ... } = result.data;
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError, type ZodSchema, type infer as zInfer } from 'zod';

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * JSON body 파싱 + zod 스키마 검증.
 *
 * @example
 *   const parsed = await parseBody(request, classCreateSchema);
 *   if (!parsed.ok) return parsed.response;
 *   const body = parsed.data;
 */
export async function parseBody<Schema extends ZodSchema>(
  request: NextRequest,
  schema: Schema
): Promise<ParseResult<zInfer<Schema>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    // zod 에러 — 사용자 친화 메시지로 변환 (필드명·실패 사유)
    //   예: 'name: required', 'maxStudents: 양수여야 합니다'
    const issues = (result.error as ZodError).issues.map(
      (i) => `${i.path.join('.') || '<root>'}: ${i.message}`
    );
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Validation failed', details: issues },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: result.data };
}

// ============================================================================
// 공통 스키마 — 재사용 위한 building block
// ============================================================================

/** UUID v4 형식 */
export const uuidSchema = z.string().uuid();

/** 학년 (초1~고3 매핑 = 1~12) */
export const gradeSchema = z.number().int().min(1).max(12);

/** 한국 휴대전화 형식 (010-1234-5678) */
export const koreanPhoneSchema = z
  .string()
  .regex(/^01[0-9]-?\d{3,4}-?\d{4}$/, '전화번호 형식이 올바르지 않습니다');

/** Email */
export const emailSchema = z.string().email();

// ============================================================================
// 도메인 스키마
// ============================================================================

/**
 * Class POST 본문 — /api/classes
 *
 * 보안 감사 F-1: subject/grade/schedule/maxStudents 검증 부재로 임의 JSON
 *  삽입·음수 입력 가능했음. 명시 enum/range 로 차단.
 */
export const classCreateSchema = z.object({
  name: z.string().trim().min(1, '이름은 필수입니다').max(100),
  description: z.string().trim().max(500).optional().nullable(),
  // subject 는 학원/과목 enum 이 운영 변동성 있어 string + max length 만 검증
  subject: z.string().trim().max(50).optional().nullable(),
  // grade — 1~12 또는 빈/누락 허용
  grade: z
    .union([gradeSchema, z.string().regex(/^\d+$/).transform((s) => parseInt(s, 10))])
    .refine((n) => n >= 1 && n <= 12, '학년은 1~12 범위')
    .optional()
    .nullable(),
  maxStudents: z
    .union([z.number().int().positive().max(200), z.string().regex(/^\d+$/).transform((s) => parseInt(s, 10))])
    .refine((n) => n > 0 && n <= 200, '정원은 1~200')
    .optional(),
  // schedule — Object 만 허용 (저장소 확대 차단)
  schedule: z.record(z.string(), z.unknown()).optional(),
});

export type ClassCreateBody = zInfer<typeof classCreateSchema>;

/**
 * Class PUT 본문 — /api/classes/[classId]
 * 모두 optional (부분 업데이트)
 */
export const classUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  subject: z.string().trim().max(50).optional().nullable(),
  grade: z
    .union([gradeSchema, z.string().regex(/^\d+$/).transform((s) => parseInt(s, 10))])
    .refine((n) => n >= 1 && n <= 12)
    .optional()
    .nullable(),
  maxStudents: z
    .union([z.number().int().positive().max(200), z.string().regex(/^\d+$/).transform((s) => parseInt(s, 10))])
    .refine((n) => n > 0 && n <= 200)
    .optional(),
  schedule: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});
