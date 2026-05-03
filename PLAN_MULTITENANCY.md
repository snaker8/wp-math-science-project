# Multi-Tenancy 격리 강화 — Plan

> **상태**: 승인 대기 (v3 — 2026-05-04 계층 구조 채택, ORG_ADMIN 도입)
> **목표**: 매쓰플랫 모델 = **공통 문제풀 + 학원별 독립 운영** + 학원 산하 센터 다수 관리
> **트리거**: 과사람 학원(본부 + 자사관·고등관·초등관) + 외부 학원 1곳 운영 시작.
> **모델**: **계층(Hierarchical)** — 학원(organization) → 센터(institute) 2단계.
> **Phase 2(SaaS화)**: 외부 학원 가입 자동화·구독 등급별 데이터 노출량 차등 — 본 문서 범위 아님.

## 핵심 원칙 (v3)
- **공통 풀**: 문제은행, 분류, 학습 데이터 — 모든 institute 공유 (강점)
- **격리**: 시험지·학생·처방·시험기록 — 각 institute(센터) 독립
- **계층**: 학원(organization) 단위 묶음 — 학원 관리자(ORG_ADMIN)는 산하 모든 센터 통합 접근
- **자산화**: 단일 DB + super_admin 통합 뷰 (별도 복사 X)
- **외부 학원**: 별도 organization 으로 처리, 차이는 권한·구독뿐

## 구조도
```
auth.users.raw_app_meta_data.super_admin = true   ← 임세현(snaker) — 시스템 슈퍼관리자
                                                    cross-organization 모든 데이터 접근

organizations 테이블 (학원)
├─ "과사람"  ← icegimbab17 (ORG_ADMIN) — 산하 자사관/고등관/초등관 통합 접근
│   institutes (센터)
│   ├─ "본부"      (snaker default)
│   ├─ "자사관"    (센터장 ADMIN, 강사 TEACHER)
│   ├─ "고등관"
│   └─ "초등관"
└─ "외부학원 A"  ← 외부 학원 ORG_ADMIN
    institutes (센터)
    └─ "외부학원 A 본점"
```

---

## 결정 사항 요약 (v3)

| 항목 | 결정 |
|---|---|
| 슈퍼관리자 정의 | `auth.users.raw_app_meta_data.super_admin = true` (JWT 단계 격리) |
| ORG_ADMIN 정의 | `users.role = 'ORG_ADMIN'` + `users.organization_id` 기반 — 자기 학원 산하 모든 institute 접근 |
| 격리 강제 방식 | RLS (Postgres) + 앱 레벨 필터 — depth defense |
| 센터·학원 추가 | 슈퍼관리자가 어드민 UI에서 (organization → institute 순) |
| 단계 구조 | **계층** — organizations → institutes |
| UI 용어 | "학원"(organization), "센터"(institute) 명확히 구분 |

---

## Audit 결과 (현재 상태)

### institutes 데이터
| ID | 이름 |
|---|---|
| `b0e2a055-ce18-40be-b521-b4847ab57bc9` | "개인 사용자" (1곳) |

### users 현황
| 이메일 | role | institute_id |
|---|---|---|
| snaker@hanmail.net | ADMIN | `b0e2a055...` ✓ |
| icegimbab@naver.com | TEACHER | **NULL** ⚠️ |
| icegimbab17@gmail.com | TEACHER | **NULL** ⚠️ |

### 테이블 격리 분류

#### ✅ 이미 격리됨
- `exams` (58/58) — RLS 정책 ✓ + share_token·ai_analysis 컬럼 자연 격리
- `problems` (1971/2020) — NULL은 공통풀, RLS ✓
- `classes` (0) — RLS ✓
- `book_groups` (16, 모두 NULL이지만 RLS는 있음)
- `source_files`, `source_books` — RLS ✓
- `exam_problems`, `classifications` — FK 자연 격리

#### ⚠️ 보강 필요
- `users` — RLS 있으나 2명 미배정
- `class_enrollments` — institute_id 없음, classes.tutor_id 우회

#### 🚨 격리 0 (긴급 — diagnostics)
- `diagnostics.sessions` (0 rows)
- `diagnostics.items` (0 rows)
- `diagnostics.lesson_plans` (0 rows)
- `diagnostics.student_node_status` (0 rows)
- 모두 `qual: true` — 모든 authenticated 유저가 모든 데이터 접근
- 현재 row 0이라 누수 사고 X. 운영 시작 전 격리 필수.

#### 📦 공통 풀 (격리 불필요)
- `mathsecr_types`, `expanded_math_types`, `problem_types`, `science_curriculum_types`
- `pitfall_types`, `problem_pitfalls`
- `figure_corrections`, `latex_render_corrections`, `detection_annotations`, `diagram_images`

### 슈퍼관리자 인프라
- `auth.users.raw_app_meta_data` 활용 결정
- 현재 RLS 정책 어디에도 super_admin bypass 로직 **없음** (필요)
- 기존 helper 함수: `get_my_role()`, `get_my_institute_id()` — 확장 활용

---

## 작업 단계 (PR 단위 분리)

### PR-0: 계층 스키마 도입 (organizations + 권한 helper)
**목표**: 학원(organization) → 센터(institute) 계층 구조 확립 + 권한 helper 함수.

**변경**:
1. `organizations` 테이블 신설
   ```sql
   CREATE TABLE public.organizations (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     slug text UNIQUE NOT NULL,           -- URL/식별용 (예: 'gwasaram', 'external-a')
     subscription_tier text DEFAULT 'internal',  -- Phase 2 대비
     created_at timestamptz DEFAULT now()
   );
   ```
2. `institutes.organization_id uuid REFERENCES organizations(id)` 컬럼 추가 (NOT NULL, 마이그레이션 후)
3. `users.role` enum에 `'ORG_ADMIN'` 추가
4. `users.organization_id uuid REFERENCES organizations(id)` 컬럼 추가 (ORG_ADMIN 전용, NULL 허용)
5. 권한 helper SQL 함수:
   ```sql
   CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
   LANGUAGE sql STABLE AS $$
     SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'super_admin')::boolean, false);
   $$;

   CREATE OR REPLACE FUNCTION public.get_my_organization_id() RETURNS uuid
   LANGUAGE sql STABLE AS $$
     SELECT organization_id FROM public.users WHERE id = auth.uid();
   $$;

   CREATE OR REPLACE FUNCTION public.can_access_institute(target_institute_id uuid) RETURNS boolean
   LANGUAGE sql STABLE AS $$
     SELECT
       is_super_admin()                                                          -- 시스템 슈퍼
       OR target_institute_id = get_my_institute_id()                            -- 자기 센터
       OR (
         get_my_organization_id() IS NOT NULL                                    -- ORG_ADMIN
         AND target_institute_id IN (
           SELECT id FROM public.institutes WHERE organization_id = get_my_organization_id()
         )
       );
   $$;
   ```

**리스크**: 중. 스키마 변경 + helper 함수 신설. 기존 데이터 영향 0 (NULL 컬럼 추가만).

**롤백**: ALTER TABLE DROP COLUMN, DROP FUNCTION, DROP TABLE.

**검증**: helper 함수 로컬 테스트 (snaker → super_admin true, icegimbab17 → org_admin true 가정).

**시간**: 0.5일.

---

### PR-1: 기존 RLS 정책에 권한 helper 적용
**목표**: 모든 격리 정책이 super_admin / ORG_ADMIN 통과 허용.

**변경**:
기존 RLS 정책 6종 (`exams`, `problems`, `classes`, `book_groups`, `source_files`, `users`) 의 `qual` 에:
```
(institute_id = get_my_institute_id())
→ can_access_institute(institute_id)
```

**리스크**: 낮음. 정책 범위 확대만 — 기존 사용자 영향 없음 (ORG_ADMIN 외 일반 user 동작 변화 X).

**롤백**: 정책 ALTER 원상복구.

**검증**:
- 슈퍼관리자 → 모든 institute 데이터 조회 ✓
- ORG_ADMIN(icegimbab17) → 과사람 산하 institute만 조회 ✓
- 일반 TEACHER → 자기 institute만 조회 ✓

**시간**: 0.5일.

---

### PR-2: diagnostics 스키마 격리
**목표**: 처방학습 데이터를 센터별로 격리. 운영 시작 전 깔끔히.

**변경**:
- `diagnostics.sessions`, `items`, `lesson_plans`, `student_node_status` 4개 테이블에 `institute_id uuid NOT NULL` 컬럼 추가
- `student_id`(text) → 학생 entity 미존재로 institute_id를 별도 명시 필요
- 각 테이블 RLS 정책 재작성:
  - `qual: institute_id = get_my_institute_id() OR is_super_admin()`
- prerequisites는 공통 (마스터 데이터) → 변경 없음

**리스크**: 중. row 0이라 데이터 마이그레이션 영향 X, 다만 향후 INSERT 코드에서 institute_id 누락 시 RLS 차단 사고 가능.

**롤백**: institute_id 컬럼 DROP + 정책 원복.

**검증**: 두 테스트 계정(institute A, B)으로 sessions INSERT/SELECT — cross-tenant 차단 확인.

**시간**: 0.5일.

---

### PR-3: 보강 — users 배정 + class_enrollments
**목표**: 미배정 user들 institute 결정 + class_enrollments 격리 강화.

**변경**:
- `users` 미배정 2명 institute 결정 (운영 결정 필요 → "본부" 가상 institute 또는 첫 센터)
- `class_enrollments`에 `institute_id uuid NOT NULL` 추가 + RLS 강화
- INSERT 트리거로 `class.institute_id` 자동 복사

**리스크**: 낮음. row 0.

**롤백**: 컬럼 DROP, 트리거 삭제.

**검증**: enrollment 생성 시 institute_id 자동 채워지는지.

**시간**: 0.5일.

---

### PR-4: 어드민 UI — 센터 관리
**목표**: 슈퍼관리자가 센터 추가/수정/멤버 초대 가능.

**변경** (신규 라우트):
- `/dashboard/admin/centers` (목록 — 슈퍼관리자만)
- `/dashboard/admin/centers/new` (추가)
- `/dashboard/admin/centers/[id]` (수정 + 멤버 관리)
- `/api/admin/centers` (CRUD)
- `/api/admin/centers/[id]/members` (초대/제거)
- 슈퍼관리자 가드 (서버 컴포넌트에서 JWT check)

**UI 용어**: "센터", "센터장", "강사" — `학원` 표현 안 씀

**리스크**: 중. 슈퍼관리자 가드 누락 시 일반 사용자가 다른 센터 생성 가능. 서버·클라 양쪽 가드 필수.

**롤백**: 라우트 삭제.

**검증**:
- 일반 사용자 → 어드민 페이지 진입 시 403
- 슈퍼관리자 → 센터 추가 → SQL 직접 확인

**시간**: 2~3일.

---

### PR-5: API route 격리 audit
**목표**: 50개 API route에서 `supabaseAdmin` (RLS bypass) 사용 시 institute_id 필터 누락 점검.

**변경**:
- 코드 검색: `supabaseAdmin.from('<격리 대상 테이블>').{select|insert|update|delete}`
- 각 호출지에서 institute_id 명시 필터/세팅 확인
- 누락 지점에 `userInstituteId` 가드 추가

**리스크**: 높음. 잘못 손대면 운영 사고. 따라서 각 패치는 작은 PR로 분리 권장.

**롤백**: 코드 revert.

**검증**:
- E2E 테스트: 두 institute 계정으로 모든 핵심 페이지 순회 → cross-tenant 데이터 노출 0
- staging 에서 1~2일 운영 후 main 머지

**시간**: 1~2일.

---

### PR-6: 운영 데이터 마이그레이션
**목표**: 학원/센터 entity 생성 + 기존 데이터 귀속 (계층 + 매쓰플랫 모델 적용).

**변경** (SQL 직접 또는 어드민 UI 활용):
1. `organizations` INSERT
   - "과사람" (slug: gwasaram)
   - "[외부 학원명]" (운영 시작 시 추가, slug: external-a)
2. `institutes` INSERT (모두 organization_id 포함)
   - "본부" (organization=과사람) — snaker 작업 영역
   - "자사관" (organization=과사람)
   - "고등관" (organization=과사람)
   - "초등관" (organization=과사람)
   - "[외부학원 본점]" (organization=외부학원, 운영 시작 시)
3. `users` 배정
   - snaker → institute=본부 + auth metadata super_admin=true (cross-org)
   - icegimbab17 → role=ORG_ADMIN, organization_id=과사람, institute_id=본부 (산하 모든 센터 접근)
4. `exams` 58건 → 본부 귀속 (snaker 작업물)
5. **`problems` 1971건 institute_id → NULL** (공통 풀로 통합 — 매쓰플랫 모델)
   - `UPDATE problems SET institute_id = NULL WHERE institute_id IS NOT NULL`
   - 신규 INSERT 정책:
     - 본부에서 업로드 → NULL (공통풀 자동 자산화)
     - 학원에서 업로드 → 해당 institute_id (그 학원만 사용, Phase 2에서 본부 검수 후 공통풀 승격 가능)
6. `book_groups` 16건 → 본부 귀속

**리스크**: 중.
- 잘못 귀속하면 그 센터에서 다른 센터 데이터 보임 — 백업 후 진행.
- problems 1971건 NULL 변경 후 모든 institute에서 조회 가능해짐 (의도된 동작이지만 검증 필수).

**롤백**: 마이그레이션 SQL 백업 → 원복.

**검증**:
- snaker 로그인 → 모든 organization 데이터 보임
- icegimbab17 로그인 → 과사람 산하 자사관/고등관/초등관/본부 데이터 모두 보임, 외부학원 데이터 X
- (테스트) 자사관 강사 → 자사관 데이터만, 다른 센터 X

**시간**: 0.5일.

---

### PR-7: 격리 검증 + 문서화
**목표**: cross-tenant 누수 0 검증 + CLAUDE.md 가드 항목 추가.

**변경**:
- 테스트 계정 3개 (각 다른 institute) 생성
- 각 핵심 화면 순회 + cross-tenant 접근 시도 (직접 URL 입력, API 호출)
- 누수 발견 시 PR-5 회귀
- CLAUDE.md 안전 가드 #8로 "신규 테이블에 institute_id + RLS 빠뜨리지 말 것" 추가

**리스크**: 낮음 (검증 단계).

**시간**: 0.5일.

---

## 합계 추정 (v3)
**6~8일** (full-time 기준).
- PR-0, 1, 2, 3: 2일 (계층 스키마 + 권한 + diagnostics + class_enrollments)
- PR-4: 2~3일 (UI — 학원·센터·멤버 관리)
- PR-5: 1~2일 (API audit)
- PR-6, 7: 1일 (마이그레이션 + 검증)

**병렬 가능**: PR-4 (UI) 와 PR-5 (API audit) 는 다른 영역이라 병렬 작업 가능.

---

## 확정 결정 (v3)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 슈퍼관리자 | 임세현(snaker) — auth metadata `super_admin=true` |
| 2 | ORG_ADMIN | icegimbab17 — 과사람 organization 전체 (자사관/고등관/초등관 모두) |
| 3 | 본부 institute | 생성 ✓ snaker 작업 영역 |
| 4 | 기존 exams 58건 | 본부 귀속 |
| 5 | 기존 problems 1971건 | NULL (공통 풀로 통합) |
| 6 | icegimbab@naver.com | **삭제 완료** ✓ (created_by → icegimbab17 양도 후) |
| 7 | 외부 학원 추가 시점 | 운영 시작 시 어드민 UI에서 |

---

## 진행 순서 (확정)

**안전 우선**: PR-0 → PR-1 → PR-2 → PR-3 → PR-5 → PR-6 → PR-4 → PR-7
- 계층 스키마 → 권한 helper → 격리 강화 → API 누수 차단 → 마이그레이션 → UI → 검증

---

## 다음 액션
사용자가 PLAN v3 검토 완료하면 **PR-0 (계층 스키마 + 권한 helper)** 부터 작업 시작.

---

## 다음 액션
사용자 승인 + "결정 보류 사항" 답변 후 PR-1부터 순차 작업 시작.
