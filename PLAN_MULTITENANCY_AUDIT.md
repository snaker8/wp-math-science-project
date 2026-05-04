# Multi-Tenancy API Audit 결과

> 2026-05-04 작성. PR-5 (API route 격리 audit) 의 read-only 산물.
> Read-only audit (Explore agent 위임 결과). 코드 패치는 별도 PR로.

## 현재 위험 수준
- **현재 leak 0** — institutes 1개("개인 사용자")만 존재, snaker만 사용
- **leak 현실화 시점**: 자사관/고등관/초등관/외부학원 신규 institute 추가 시 (PR-6)
- → **PR-5 패치는 PR-6 보다 무조건 먼저 끝내야 함**

## 위험 분포 (55개 파일 중)
- ✅ SAFE: 6개 (자연 격리 OR institute_id 필터 명시)
- ⚠️ PARTIAL: 2개
- ❌ MISSING: 25+개 ← 패치 대상
- 🔍 NEEDS_REVIEW: 1개

---

## ❌ MISSING — 즉시 패치 (우선순위 1)

### A. Admin 경로 (5개)
| 파일 | 위험 라인 | 설명 |
|---|---|---|
| `src/app/api/admin/fix-exam-titles/route.ts` | L42 | exams 조회 institute_id 필터 없음 |
| `src/app/api/admin/restore-all-points/route.ts` | L58-61 | problems 전체 로드 |
| `src/app/api/admin/reocr-points/route.ts` | L215-218 | exams 조회 |
| `src/app/api/admin/objective-answer-fix/route.ts` | L44-48 | problems 정답 수정 |
| `src/app/api/admin/objective-answer-broken/route.ts` | L54, L87 | problems 조회 |

### B. Exam 핵심 경로 (12개)
| 파일 | 위험 |
|---|---|
| `src/app/api/exams/route.ts` | 리스트 조회 institute_id 필터 없음 |
| `src/app/api/exams/[examId]/route.ts` | 단일 exam 조회 (L40) |
| `src/app/api/exams/generate/route.ts` | INSERT 시 institute_id 없음 + classifications 조회 (L21-28) |
| `src/app/api/exams/[examId]/problems/route.ts` | exam_id로만 조회 (L21-25, L78-81) |
| `src/app/api/exams/[examId]/batch-solutions/route.ts` | problem 조회 (L52-55) |
| `src/app/api/exams/[examId]/distribute-points/route.ts` | exam_problems/problems (L26-30, L38) |
| `src/app/api/exams/[examId]/share/route.ts` | exam 토큰 생성/조회 (L30-34, L54-58) |
| `src/app/api/exams/[examId]/ai-analysis/route.ts` | exam 조회 (L41-45) |
| `src/app/api/exams/[examId]/auto-fix/route.ts` | exam/exam_problems/problems (L56-60, L76-80, L89-92) |
| `src/app/api/exams/[examId]/recover/route.ts` | exam_problems/problems (L19-23, L32-35) |
| `src/app/api/exams/[examId]/match-answers/route.ts` | exam_problems/problems (L47-51, L61-64) |
| `src/app/api/exams/[examId]/print/route.ts` | exam 조회 |

### C. Problem 경로 (6개)
| 파일 | 위험 |
|---|---|
| `src/app/api/problems/route.ts` | POST 시 institute_id 필터 없음 |
| `src/app/api/problems/[problemId]/route.ts` | GET/PATCH (L30-33) |
| `src/app/api/problems/search/route.ts` | classifications + problems (L28-30, L58-65) |
| `src/app/api/problems/[problemId]/generate-figure/route.ts` | problem 조회 (L47-51) |
| `src/app/api/problems/[problemId]/generate-solution/route.ts` | problem/classifications (L43-47, L54-58) |
| `src/app/api/problems/[problemId]/reanalyze/route.ts` | exam_problems/exams (L24-35) |

### D. BookGroup + 기타 (3개)
| 파일 | 위험 |
|---|---|
| `src/app/api/book-groups/route.ts` | GET/POST 시 모든 그룹 반환 |
| `src/app/api/book-groups/[groupId]/route.ts` | PUT/DELETE (L37-38, L76-78, L81-98) |
| `src/app/api/sessions/route.ts` | exam 조회 (L66-70) |

---

## ⚠️ PARTIAL — 조건부 패치 (우선순위 2)
| 파일 | 상황 |
|---|---|
| `src/app/api/exams/[examId]/upload/route.ts` | exam 존재 확인만, 소유권 검증 없음 |
| `src/app/api/exams/[examId]/batch-solutions/route.ts` | hasNonEmptySolution() 함수 내부 필터 없음 |

---

## ✅ SAFE — 패치 불필요 (참고)
| 파일 | 보호 메커니즘 |
|---|---|
| `src/app/api/admin/users/route.ts` | L46: `.eq('institute_id', user.instituteId)` |
| `src/app/api/admin/system-stats/route.ts` | L34, L40: `scopeInstituteId` |
| `src/app/api/exams/create-from-problems/route.ts` | L66: INSERT 시 `institute_id: instituteId` |
| `src/app/api/classes/route.ts` | L58: `.eq('institute_id', userData.institute_id)` |
| `src/app/api/classes/[classId]/students/route.ts` | L44-48: tutor_id 자연 격리 |
| `src/app/api/classes/[classId]/enrollments/route.ts` | L57: tutor_id 자연 격리 |

---

## 🔍 NEEDS_REVIEW
| 파일 | 상황 |
|---|---|
| `src/app/api/enrollments/[enrollmentId]/route.ts` | enrollmentId 조회만, class.tutor_id 검증 불명확 |

---

## 핵심 패턴 — 패치 전략

### 1. 헬퍼 모듈 통과 필수
신규 `src/lib/security/institute-guard.ts`:
- `getUserAccessScope(client, userId)` → `{ instituteId, organizationId, isSuperAdmin, role }`
- `applyInstituteFilter(query, scope, opts?)` → query 체인에 자동 격리 필터 적용
- `assertInstituteAccess(client, userId, instituteId)` → 위반 시 throw

### 2. 공통 풀 처리
- `problems`, `book_groups`: `institute_id IS NULL OR institute_id = X`
- `applyInstituteFilter` 옵션으로 `{ allowCommonPool: true }` 처리

### 3. INSERT 시점 격리
- INSERT payload 에 `institute_id: scope.instituteId` 강제 포함
- 헬퍼 모듈로 보강 가능

### 4. exam-problem 체인
- exam 조회 시 institute 검증 → 그 후 exam_problems 자유롭게 조회 가능 (FK 자연 격리)
- 또는 모든 단계 명시 가드 (depth defense)

---

## 패치 PR 분할 계획 (Phase C)

| PR | 대상 | 파일 수 | 위험 |
|---|---|---|---|
| C.1 | admin/* | 5 | 낮음 |
| C.2a | exams/* 핵심 (route/generate/[id]/[id]/problems) | 4 | 중 |
| C.2b | exams/* 핵심 (batch/distribute/match) | 3 | 중 |
| C.3a | exams/* 부가 (share/ai/auto/recover/print) | 5 | 중 |
| C.3b | exams/* 업로드 (upload + 매개) | 2 | 중 |
| C.4a | problems/* 기본 (route/[id]/search) | 3 | 중 |
| C.4b | problems/* 생성 (figure/solution/reanalyze) | 3 | 중 |
| C.5 | book_groups + sessions | 3 | 낮음 |

**합계**: 8 PR × (1~3일) = ~2~3주.

각 PR 후 검증:
- snaker 로그인 → 기존 동작 유지
- 단위 테스트 (Phase B 셋업 후)
- 빌드/타입체크
