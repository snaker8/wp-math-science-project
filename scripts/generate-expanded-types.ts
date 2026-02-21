/**
 * 시중교재(쎈, 개념원리 RPM, 블랙라벨, 수학의정석, 마플) 분석 기반
 * 확장 세부유형 생성 스크립트
 *
 * 현재 1,139개 → 목표 ~3,200개
 *
 * Usage: npx tsx scripts/generate-expanded-types.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface ExpandedType {
  type_code: string;
  type_name: string;
  description: string;
  solution_method: string;
  subject: string;
  area: string;
  standard_code: string;
  standard_content: string;
  cognitive: 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';
  difficulty_min: number;
  difficulty_max: number;
  keywords: string[];
  school_level: string;
  level_code: string;
  domain_code: string;
}

// ============================================================================
// 고등 공통 HS0 확장 (124 → ~350)
// 쎈 고등수학(상) 206유형 + 쎈 고등수학(하) 152유형 기반
// ============================================================================
export const HS0_EXPANSION: ExpandedType[] = [
  // ── POL 다항식 확장 ──────────────────────────────────────────
  // [10수학01-01] 다항식의 덧셈, 뺄셈, 곱셈 — 기존 4 → 8
  { type_code: 'MA-HS0-POL-01-005', type_name: '다항식의 정리 (내림차순·오름차순)', description: '다항식을 특정 문자에 대해 내림차순 또는 오름차순으로 정리', solution_method: '차수 기준 재배열', subject: '수학', area: '다항식', standard_code: '[10수학01-01]', standard_content: '다항식의 덧셈, 뺄셈, 곱셈을 할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 1, difficulty_max: 2, keywords: ['내림차순', '오름차순', '다항식 정리'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-01-006', type_name: '곱셈 공식의 활용 (식의 값)', description: '곱셈 공식을 이용하여 주어진 조건에서 식의 값 구하기', solution_method: '곱셈 공식 변형 후 대입', subject: '수학', area: '다항식', standard_code: '[10수학01-01]', standard_content: '다항식의 덧셈, 뺄셈, 곱셈을 할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 2, difficulty_max: 4, keywords: ['곱셈공식', '식의값', '대입'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-01-007', type_name: '대칭식과 교대식', description: 'a+b, ab가 주어졌을 때 대칭식의 값 구하기', solution_method: '기본 대칭식으로 변환', subject: '수학', area: '다항식', standard_code: '[10수학01-01]', standard_content: '다항식의 덧셈, 뺄셈, 곱셈을 할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['대칭식', '교대식', 'a+b', 'ab'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-01-008', type_name: '세 문자 이상의 곱셈 공식', description: '(a+b+c)² 등 세 문자 이상의 곱셈 공식 활용', solution_method: '다문자 곱셈 공식 적용', subject: '수학', area: '다항식', standard_code: '[10수학01-01]', standard_content: '다항식의 덧셈, 뺄셈, 곱셈을 할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 4, keywords: ['세문자', '곱셈공식', '전개'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },

  // [10수학01-02] 다항식의 나눗셈 — 기존 3 → 7
  { type_code: 'MA-HS0-POL-02-004', type_name: '다항식의 나눗셈 (몫과 나머지)', description: '다항식 ÷ 다항식에서 몫과 나머지를 구하는 기본 문제', solution_method: '장제법(긴 나눗셈)', subject: '수학', area: '다항식', standard_code: '[10수학01-02]', standard_content: '다항식의 나눗셈을 할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 1, difficulty_max: 3, keywords: ['나눗셈', '몫', '나머지', '장제법'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-02-005', type_name: '항등식과 미정계수법 (계수비교법)', description: '항등식의 성질을 이용하여 미정계수 결정 (양변의 계수 비교)', solution_method: '계수비교법', subject: '수학', area: '다항식', standard_code: '[10수학01-02]', standard_content: '다항식의 나눗셈을 할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 4, keywords: ['항등식', '미정계수', '계수비교'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-02-006', type_name: '항등식과 미정계수법 (수치대입법)', description: '항등식에 특정 값을 대입하여 미정계수 결정', solution_method: '수치대입법', subject: '수학', area: '다항식', standard_code: '[10수학01-02]', standard_content: '다항식의 나눗셈을 할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 4, keywords: ['항등식', '미정계수', '수치대입'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-02-007', type_name: '조립제법 활용 (다항식의 값)', description: '조립제법을 이용하여 f(a)의 값을 효율적으로 계산', solution_method: '조립제법', subject: '수학', area: '다항식', standard_code: '[10수학01-02]', standard_content: '다항식의 나눗셈을 할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 3, keywords: ['조립제법', '다항식의값', '대입'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },

  // [10수학01-03] 나머지정리와 인수정리 — 기존 4 → 8
  { type_code: 'MA-HS0-POL-03-005', type_name: '나머지정리 활용 (미정계수 결정)', description: '나머지정리로 다항식의 미정계수 결정', solution_method: '나머지정리 적용 후 연립방정식', subject: '수학', area: '다항식', standard_code: '[10수학01-03]', standard_content: '나머지정리의 의미를 이해하고, 이를 활용하여 문제를 해결할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['나머지정리', '미정계수', '연립방정식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-03-006', type_name: '조립제법을 이용한 인수분해', description: '조립제법으로 고차다항식의 인수를 찾아 인수분해', solution_method: '조립제법 + 인수정리', subject: '수학', area: '다항식', standard_code: '[10수학01-03]', standard_content: '나머지정리의 의미를 이해하고, 이를 활용하여 문제를 해결할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 4, keywords: ['조립제법', '인수정리', '고차식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-03-007', type_name: '나머지정리와 인수정리 종합', description: '나머지정리와 인수정리를 종합 활용하는 복합 문제', solution_method: '나머지정리 + 인수정리 결합', subject: '수학', area: '다항식', standard_code: '[10수학01-03]', standard_content: '나머지정리의 의미를 이해하고, 이를 활용하여 문제를 해결할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['나머지정리', '인수정리', '종합'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-03-008', type_name: '다항식의 나머지 (ax+b로 나눈 나머지)', description: 'f(x)를 ax+b로 나눈 나머지 구하기', solution_method: 'f(-b/a) 계산', subject: '수학', area: '다항식', standard_code: '[10수학01-03]', standard_content: '나머지정리의 의미를 이해하고, 이를 활용하여 문제를 해결할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 3, keywords: ['나머지', '일차식으로나누기'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },

  // [10수학01-04] 인수분해 — 기존 4 → 9
  { type_code: 'MA-HS0-POL-04-005', type_name: '치환을 이용한 인수분해', description: '공통 부분을 하나의 문자로 치환하여 인수분해', solution_method: '치환법', subject: '수학', area: '다항식', standard_code: '[10수학01-04]', standard_content: '인수분해를 할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 4, keywords: ['치환', '인수분해', '공통부분'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-04-006', type_name: '복이차식의 인수분해', description: 'x⁴+ax²+b 꼴의 복이차식 인수분해', solution_method: 'x²=t 치환 후 인수분해', subject: '수학', area: '다항식', standard_code: '[10수학01-04]', standard_content: '인수분해를 할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 3, difficulty_max: 4, keywords: ['복이차식', '치환', 'x⁴'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-04-007', type_name: '인수분해의 활용 (수의 계산)', description: '인수분해를 이용한 수의 계산 문제', solution_method: '인수분해 후 수치 대입', subject: '수학', area: '다항식', standard_code: '[10수학01-04]', standard_content: '인수분해를 할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 2, difficulty_max: 4, keywords: ['인수분해', '수계산', '활용'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-04-008', type_name: '인수분해의 활용 (식의 값)', description: '인수분해를 이용하여 복잡한 식의 값 구하기', solution_method: '인수분해 후 조건 대입', subject: '수학', area: '다항식', standard_code: '[10수학01-04]', standard_content: '인수분해를 할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['인수분해', '식의값', '활용'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-04-009', type_name: '인수분해의 활용 (도형)', description: '도형 문제에서 인수분해를 활용하여 넓이·길이 구하기', solution_method: '식 세우기 + 인수분해', subject: '수학', area: '다항식', standard_code: '[10수학01-04]', standard_content: '인수분해를 할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['인수분해', '도형', '넓이'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },

  // ── EQU 방정식 확장 ──────────────────────────────────────────
  // [10수학01-05] 복소수 — 기존 4 → 8
  { type_code: 'MA-HS0-EQU-05-005', type_name: '음수의 제곱근', description: '음수의 제곱근을 허수단위 i를 이용하여 표현', solution_method: '√(-a) = i√a 변환', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-05]', standard_content: '복소수의 뜻과 성질을 이해하고, 복소수의 사칙연산을 할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 1, difficulty_max: 3, keywords: ['음수', '제곱근', '허수', 'i'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-05-006', type_name: '복소수의 상등 활용 (연립)', description: '복소수의 상등조건을 이용한 연립방정식 풀이', solution_method: '실수부·허수부 비교', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-05]', standard_content: '복소수의 뜻과 성질을 이해하고, 복소수의 사칙연산을 할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 4, keywords: ['복소수', '상등', '연립방정식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-05-007', type_name: '복소수의 거듭제곱', description: '복소수의 거듭제곱 계산 (z^n)', solution_method: 'i의 주기성 활용', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-05]', standard_content: '복소수의 뜻과 성질을 이해하고, 복소수의 사칙연산을 할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 4, keywords: ['복소수', '거듭제곱', 'i주기'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-05-008', type_name: '복소수의 성질 종합 응용', description: '켤레복소수, i의 거듭제곱 등 성질을 종합 활용', solution_method: '복소수 성질 종합', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-05]', standard_content: '복소수의 뜻과 성질을 이해하고, 복소수의 사칙연산을 할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 4, difficulty_max: 5, keywords: ['복소수', '종합', '응용'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },

  // [10수학01-06] 이차방정식 — 기존 3 → 8
  { type_code: 'MA-HS0-EQU-06-004', type_name: '이차방정식의 판별식', description: '판별식 D를 이용한 근의 존재 판별', solution_method: 'D = b²-4ac 판별', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-06]', standard_content: '이차방정식을 풀 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 3, keywords: ['판별식', '근', '이차방정식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-06-005', type_name: '판별식 활용 (미정계수)', description: '판별식 조건으로 미정계수의 범위 결정', solution_method: 'D≥0, D=0, D<0 조건 활용', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-06]', standard_content: '이차방정식을 풀 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['판별식', '미정계수', '범위'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-06-006', type_name: '이차방정식의 켤레근', description: '계수가 유리수/실수인 이차방정식의 켤레근 성질', solution_method: '켤레근 정리', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-06]', standard_content: '이차방정식을 풀 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 3, difficulty_max: 4, keywords: ['켤레근', '유리수계수', '이차방정식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-06-007', type_name: '이차방정식의 작성', description: '주어진 두 근으로 이차방정식 작성', solution_method: '(x-α)(x-β)=0', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-06]', standard_content: '이차방정식을 풀 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 3, keywords: ['이차방정식', '작성', '근'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-06-008', type_name: '이차방정식의 정수근 조건', description: '이차방정식이 정수근을 갖기 위한 조건', solution_method: '판별식 + 근의공식 + 정수 조건', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-06]', standard_content: '이차방정식을 풀 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 4, difficulty_max: 5, keywords: ['정수근', '이차방정식', '조건'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },

  // [10수학01-07] 근과 계수의 관계 — 기존 4 → 8
  { type_code: 'MA-HS0-EQU-07-005', type_name: '근과 계수의 관계 (두 근의 대칭식)', description: 'α+β, αβ를 이용한 대칭식 값 계산', solution_method: '근과 계수의 관계 + 대칭식 변환', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-07]', standard_content: '이차방정식의 근과 계수의 관계를 이해한다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 4, keywords: ['근과계수', '대칭식', 'α+β'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-07-006', type_name: '두 근의 부호 판별', description: '이차방정식의 두 근이 양수/음수/이부호인 조건', solution_method: '판별식, 근의합, 근의곱 부호 분석', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-07]', standard_content: '이차방정식의 근과 계수의 관계를 이해한다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['근의부호', '양근', '음근'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-07-007', type_name: '새로운 이차방정식 작성', description: '주어진 이차방정식의 근으로부터 새 방정식 작성', solution_method: '근과 계수의 관계 역이용', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-07]', standard_content: '이차방정식의 근과 계수의 관계를 이해한다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['이차방정식작성', '근과계수', '역이용'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-07-008', type_name: '공통근 문제', description: '두 이차방정식의 공통근 구하기', solution_method: '두 방정식의 차 → 공통근 대입', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-07]', standard_content: '이차방정식의 근과 계수의 관계를 이해한다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 4, difficulty_max: 5, keywords: ['공통근', '이차방정식', '연립'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },

  // [10수학01-08] 이차방정식과 이차함수 — 기존 3 → 7
  { type_code: 'MA-HS0-EQU-08-004', type_name: '포물선과 직선의 위치 관계', description: '이차함수 그래프와 직선의 교점 개수 판별', solution_method: '연립 후 판별식', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-08]', standard_content: '이차방정식과 이차함수의 관계를 이해한다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 4, keywords: ['포물선', '직선', '교점', '판별식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-08-005', type_name: '이차함수의 그래프와 x축 위치 관계', description: 'y=ax²+bx+c와 x축의 교점 관계 (D 조건)', solution_method: '판별식과 그래프 해석', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-08]', standard_content: '이차방정식과 이차함수의 관계를 이해한다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 3, keywords: ['이차함수', 'x축', '판별식', '그래프'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-08-006', type_name: '근의 분리 (주어진 범위의 근)', description: '이차방정식의 근이 특정 범위에 존재하는 조건', solution_method: '판별식+축+f(경계값) 조건', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-08]', standard_content: '이차방정식과 이차함수의 관계를 이해한다.', cognitive: 'INFERENCE', difficulty_min: 4, difficulty_max: 5, keywords: ['근의분리', '범위', '이차함수'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-08-007', type_name: '이차함수의 그래프 해석', description: '이차함수 그래프의 계수(a,b,c) 부호와 관계 해석', solution_method: '그래프 특성 분석', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-08]', standard_content: '이차방정식과 이차함수의 관계를 이해한다.', cognitive: 'UNDERSTANDING', difficulty_min: 3, difficulty_max: 5, keywords: ['이차함수', '그래프해석', '계수부호'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },

  // [10수학01-09] 이차함수 최대·최소 — 기존 3 → 7
  { type_code: 'MA-HS0-EQU-09-004', type_name: '제한된 범위에서 이차함수 최대·최소', description: '주어진 구간에서 이차함수의 최댓값·최솟값', solution_method: '꼭짓점+구간 경계값 비교', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-09]', standard_content: '이차함수의 최대, 최소를 구할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['이차함수', '최대최소', '구간'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-09-005', type_name: '판별식을 이용한 최대·최소', description: '판별식 D≥0 조건을 이용한 식의 최대·최소', solution_method: 'y=k 놓고 판별식 D≥0', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-09]', standard_content: '이차함수의 최대, 최소를 구할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 4, difficulty_max: 5, keywords: ['판별식', '최대최소', '범위'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-09-006', type_name: '이차식의 최대·최소 활용', description: '실생활 문제에서 이차함수의 최대·최소 활용', solution_method: '식 세우기 + 꼭짓점 구하기', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-09]', standard_content: '이차함수의 최대, 최소를 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['이차함수', '최대최소', '활용', '실생활'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-09-007', type_name: '조건부 최적화 (이차함수)', description: '조건식이 주어진 상태에서 이차함수의 최대·최소', solution_method: '조건 대입 후 이차함수 변환', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-09]', standard_content: '이차함수의 최대, 최소를 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 4, difficulty_max: 5, keywords: ['조건부', '최적화', '이차함수'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },

  // [10수학01-10] 여러 가지 방정식 — 기존 4 → 10
  { type_code: 'MA-HS0-EQU-10-005', type_name: '삼차방정식의 근과 계수의 관계', description: '삼차방정식의 세 근의 합, 곱 등의 관계', solution_method: '비에타 공식 (삼차)', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-10]', standard_content: '여러 가지 방정식을 풀 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 3, difficulty_max: 4, keywords: ['삼차방정식', '근과계수', '비에타'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-10-006', type_name: '치환을 이용한 고차방정식', description: '적절한 치환으로 고차방정식을 이차방정식으로 변환', solution_method: 't 치환', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-10]', standard_content: '여러 가지 방정식을 풀 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['치환', '고차방정식', '이차변환'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-10-007', type_name: '상반방정식', description: '계수가 대칭인 상반방정식 풀이', solution_method: 'x+1/x = t 치환', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-10]', standard_content: '여러 가지 방정식을 풀 수 있다.', cognitive: 'INFERENCE', difficulty_min: 4, difficulty_max: 5, keywords: ['상반방정식', '대칭계수', '치환'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-10-008', type_name: '연립이차방정식', description: '두 이차방정식의 연립 풀이', solution_method: '대입법 또는 가감법', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-10]', standard_content: '여러 가지 방정식을 풀 수 있다.', cognitive: 'CALCULATION', difficulty_min: 3, difficulty_max: 4, keywords: ['연립', '이차방정식', '대입법'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-10-009', type_name: '연립방정식의 활용', description: '실생활 문제를 연립방정식으로 모델링하여 해결', solution_method: '식 세우기 + 연립 풀이', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-10]', standard_content: '여러 가지 방정식을 풀 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['연립방정식', '활용', '문장제'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-10-010', type_name: '부정방정식', description: '정수해를 갖는 부정방정식 풀이', solution_method: '인수분해 + 정수 조건', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-10]', standard_content: '여러 가지 방정식을 풀 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 4, difficulty_max: 5, keywords: ['부정방정식', '정수해', '인수분해'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },

  // [10수학01-11] 부등식 — 기존 4 → 8
  { type_code: 'MA-HS0-EQU-11-005', type_name: '연립일차부등식', description: '두 일차부등식의 연립 풀이 (해의 범위)', solution_method: '각 부등식 풀이 후 교집합', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-11]', standard_content: '여러 가지 부등식을 풀 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 3, keywords: ['연립부등식', '일차', '교집합'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-11-006', type_name: '연립이차부등식', description: '이차부등식이 포함된 연립부등식 풀이', solution_method: '각 부등식 풀이 후 교집합', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-11]', standard_content: '여러 가지 부등식을 풀 수 있다.', cognitive: 'CALCULATION', difficulty_min: 3, difficulty_max: 4, keywords: ['연립부등식', '이차', '교집합'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-11-007', type_name: '이차부등식이 항상 성립할 조건', description: 'ax²+bx+c>0이 모든 실수에서 성립할 조건', solution_method: 'a>0이고 D<0', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-11]', standard_content: '여러 가지 부등식을 풀 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['항상성립', '이차부등식', '판별식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-11-008', type_name: '부등식의 활용 (문장제)', description: '부등식을 세워 실생활 문제 해결', solution_method: '부등식 모델링 + 풀이', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-11]', standard_content: '여러 가지 부등식을 풀 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['부등식', '활용', '문장제'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },

  // [10수학01-12] 절대값 부등식 — 기존 3 → 6
  { type_code: 'MA-HS0-EQU-12-004', type_name: '절대값을 포함한 방정식', description: '|f(x)| = g(x) 형태의 방정식 풀이', solution_method: '경우 나누기 (f(x)≥0, f(x)<0)', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-12]', standard_content: '절대값을 포함한 부등식을 풀 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 4, keywords: ['절대값', '방정식', '경우나누기'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-12-005', type_name: '이중 절대값 부등식', description: '||x-a|-b|<c 등 이중 절대값이 포함된 부등식', solution_method: '단계별 절대값 해제', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-12]', standard_content: '절대값을 포함한 부등식을 풀 수 있다.', cognitive: 'INFERENCE', difficulty_min: 4, difficulty_max: 5, keywords: ['이중절대값', '부등식', '단계별'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },
  { type_code: 'MA-HS0-EQU-12-006', type_name: '절대값과 그래프', description: '절대값 함수의 그래프를 이용한 부등식/방정식 해석', solution_method: '그래프 그리기 + 교점 분석', subject: '수학', area: '방정식과 부등식', standard_code: '[10수학01-12]', standard_content: '절대값을 포함한 부등식을 풀 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 3, difficulty_max: 5, keywords: ['절대값', '그래프', '해석'], school_level: '고등학교', level_code: 'HS0', domain_code: 'EQU' },

  // ── SET 집합과 명제 확장 ──────────────────────────────────────
  // [10수학03-01] 집합 — 기존 3 → 7
  { type_code: 'MA-HS0-SET-01-004', type_name: '유한집합의 원소의 개수', description: '합집합의 원소 개수 공식 n(A∪B) = n(A)+n(B)-n(A∩B)', solution_method: '포함-배제 원리', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-01]', standard_content: '집합의 뜻을 알고, 집합을 표현할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 4, keywords: ['유한집합', '원소개수', '포함배제'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-01-005', type_name: '세 집합의 원소 개수', description: 'n(A∪B∪C) 포함-배제 원리', solution_method: '세 집합 포함-배제 공식', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-01]', standard_content: '집합의 뜻을 알고, 집합을 표현할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 3, difficulty_max: 5, keywords: ['세집합', '포함배제', '원소개수'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-01-006', type_name: '집합의 원소 나열과 조건', description: '조건제시법으로 표현된 집합의 원소 구하기', solution_method: '조건 해석 후 원소 나열', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-01]', standard_content: '집합의 뜻을 알고, 집합을 표현할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 1, difficulty_max: 3, keywords: ['조건제시법', '원소나열', '집합'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-01-007', type_name: '부분집합의 개수와 조건', description: '특정 원소를 포함/제외하는 부분집합의 개수', solution_method: '2^n 공식 활용 (조건부)', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-01]', standard_content: '집합의 뜻을 알고, 집합을 표현할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 2, difficulty_max: 4, keywords: ['부분집합', '개수', '조건'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },

  // [10수학03-02] 집합의 연산 — 기존 3 → 7
  { type_code: 'MA-HS0-SET-02-004', type_name: '집합의 연산 법칙', description: '교환법칙, 결합법칙, 분배법칙, 드모르간 법칙', solution_method: '집합 연산 법칙 적용', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-02]', standard_content: '집합의 연산을 할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 3, keywords: ['교환법칙', '분배법칙', '드모르간'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-02-005', type_name: '벤 다이어그램 해석', description: '벤 다이어그램을 이용한 집합 관계 파악', solution_method: '벤 다이어그램 영역 분석', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-02]', standard_content: '집합의 연산을 할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 1, difficulty_max: 3, keywords: ['벤다이어그램', '집합', '영역'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-02-006', type_name: '집합의 연산 응용 (미지 집합)', description: 'A∩X=B, A∪X=C 등 조건을 만족하는 집합 X 구하기', solution_method: '벤 다이어그램 + 조건 분석', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-02]', standard_content: '집합의 연산을 할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['미지집합', '조건', '집합연산'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-02-007', type_name: '집합과 원소 개수 활용', description: '집합의 원소 개수 조건을 이용한 문장제 풀이', solution_method: '포함-배제 + 문장제 해석', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-02]', standard_content: '집합의 연산을 할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['집합', '원소개수', '활용', '문장제'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },

  // [10수학03-03] 명제 — 기존 3 → 6
  { type_code: 'MA-HS0-SET-03-004', type_name: '명제의 역·이·대우', description: '주어진 명제의 역, 이, 대우 작성 및 참·거짓 판별', solution_method: '가정과 결론 교환/부정', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-03]', standard_content: '명제의 뜻을 알고, 참·거짓을 판별할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 3, keywords: ['역', '이', '대우', '명제'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-03-005', type_name: '조건과 진리집합', description: '조건의 진리집합을 구하고 포함 관계로 명제 판별', solution_method: '진리집합 구하기 + 포함관계', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-03]', standard_content: '명제의 뜻을 알고, 참·거짓을 판별할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 4, keywords: ['조건', '진리집합', '포함관계'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-03-006', type_name: '명제의 참·거짓 종합', description: '여러 명제의 참·거짓 동시 판별 (반례 찾기 포함)', solution_method: '반례 또는 증명', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-03]', standard_content: '명제의 뜻을 알고, 참·거짓을 판별할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['명제', '참거짓', '반례'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },

  // [10수학03-04] 필요·충분조건 — 기존 3 → 6
  { type_code: 'MA-HS0-SET-04-004', type_name: '필요·충분조건과 미정계수', description: '필요·충분조건이 되기 위한 미정계수의 범위', solution_method: '진리집합의 포함관계 + 미정계수', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-04]', standard_content: '필요조건과 충분조건을 구분할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['필요조건', '충분조건', '미정계수'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-04-005', type_name: '필요·충분·필요충분조건 종합', description: '여러 명제 사이의 필요·충분 관계 종합 판별', solution_method: '진리집합 + 논리적 관계 분석', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-04]', standard_content: '필요조건과 충분조건을 구분할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['필요조건', '충분조건', '필요충분', '종합'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-04-006', type_name: '필요·충분조건 응용 (부등식·방정식)', description: '방정식/부등식 조건의 필요·충분 관계 판별', solution_method: '해집합 비교', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-04]', standard_content: '필요조건과 충분조건을 구분할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 4, difficulty_max: 5, keywords: ['필요충분', '방정식', '부등식', '해집합'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },

  // [10수학03-05] 증명 — 기존 3 → 6
  { type_code: 'MA-HS0-SET-05-004', type_name: '대우를 이용한 증명', description: '명제 p→q의 대우 ~q→~p를 증명', solution_method: '대우 증명법', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-05]', standard_content: '대우를 이용하여 명제를 증명할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['대우증명', '간접증명'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-05-005', type_name: '귀류법', description: '결론의 부정을 가정하여 모순 도출', solution_method: '귀류법', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-05]', standard_content: '대우를 이용하여 명제를 증명할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['귀류법', '모순', '간접증명'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-05-006', type_name: '직접 증명법', description: '가정에서 출발하여 결론을 직접 도출', solution_method: '직접증명', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-05]', standard_content: '대우를 이용하여 명제를 증명할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 2, difficulty_max: 4, keywords: ['직접증명', '연역법'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },

  // [10수학03-06] 절대부등식 — 기존 3 → 6
  { type_code: 'MA-HS0-SET-06-004', type_name: '산술-기하 평균 부등식', description: '(a+b)/2 ≥ √(ab) 활용 (등호 조건 포함)', solution_method: 'AM-GM 부등식', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-06]', standard_content: '절대부등식의 의미를 이해한다.', cognitive: 'UNDERSTANDING', difficulty_min: 3, difficulty_max: 4, keywords: ['산술기하평균', 'AM-GM', '등호조건'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-06-005', type_name: '코시-슈바르츠 부등식', description: '(a²+b²)(c²+d²) ≥ (ac+bd)² 활용', solution_method: 'Cauchy-Schwarz 부등식', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-06]', standard_content: '절대부등식의 의미를 이해한다.', cognitive: 'INFERENCE', difficulty_min: 4, difficulty_max: 5, keywords: ['코시슈바르츠', '부등식', '증명'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-06-006', type_name: '절대부등식의 증명 (다양한 방법)', description: '완전제곱식, 부등식의 성질 등을 이용한 증명', solution_method: '완전제곱식 ≥ 0 활용', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-06]', standard_content: '절대부등식의 의미를 이해한다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['절대부등식', '증명', '완전제곱'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },

  // [10수학03-07] 기존 1 → 3 / [10수학03-08] 기존 2 → 4
  { type_code: 'MA-HS0-SET-07-002', type_name: '절대부등식과 최대·최소', description: '절대부등식을 이용한 최대·최소 구하기', solution_method: '등호 조건 활용', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-07]', standard_content: '절대부등식의 의미를 이해한다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['절대부등식', '최대최소', '등호조건'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-07-003', type_name: '절대부등식 활용 (실생활)', description: '절대부등식을 실생활 최적화 문제에 활용', solution_method: '부등식 모델링 + 등호조건', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-07]', standard_content: '절대부등식의 의미를 이해한다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 4, difficulty_max: 5, keywords: ['절대부등식', '활용', '최적화'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-08-003', type_name: '절대부등식 증명 (변형)', description: '주어진 조건하에서 부등식 증명 (조건부 증명)', solution_method: '조건 활용 + 부등식 변형', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-08]', standard_content: '절대부등식을 증명할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 4, difficulty_max: 5, keywords: ['조건부증명', '부등식변형'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },
  { type_code: 'MA-HS0-SET-08-004', type_name: '여러 변수의 부등식 증명', description: '3개 이상 변수에 대한 부등식 증명', solution_method: '대칭성 + 부등식 기법', subject: '수학', area: '집합과 명제', standard_code: '[10수학03-08]', standard_content: '절대부등식을 증명할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 4, difficulty_max: 5, keywords: ['다변수', '부등식증명', '대칭'], school_level: '고등학교', level_code: 'HS0', domain_code: 'SET' },

  // ── FUN 함수 확장 ──────────────────────────────────────────
  // [10수학04-01] 함수 — 기존 3 → 7
  { type_code: 'MA-HS0-FUN-01-004', type_name: '함수의 개수 (경우의 수)', description: '유한집합 사이의 함수의 개수 구하기', solution_method: '곱의 법칙', subject: '수학', area: '함수', standard_code: '[10수학04-01]', standard_content: '함수의 뜻을 알고, 그 그래프를 이해한다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 4, keywords: ['함수개수', '곱의법칙', '유한집합'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-01-005', type_name: '일대일함수·일대일대응의 개수', description: '일대일함수, 일대일대응의 개수 구하기', solution_method: '순열 공식', subject: '수학', area: '함수', standard_code: '[10수학04-01]', standard_content: '함수의 뜻을 알고, 그 그래프를 이해한다.', cognitive: 'CALCULATION', difficulty_min: 3, difficulty_max: 4, keywords: ['일대일함수', '일대일대응', '개수'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-01-006', type_name: '항등함수와 상수함수', description: '항등함수, 상수함수의 정의와 성질', solution_method: '정의 적용', subject: '수학', area: '함수', standard_code: '[10수학04-01]', standard_content: '함수의 뜻을 알고, 그 그래프를 이해한다.', cognitive: 'UNDERSTANDING', difficulty_min: 1, difficulty_max: 2, keywords: ['항등함수', '상수함수'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-01-007', type_name: '함수의 정의역·공역·치역', description: '주어진 함수의 정의역, 공역, 치역 구하기', solution_method: '정의 적용', subject: '수학', area: '함수', standard_code: '[10수학04-01]', standard_content: '함수의 뜻을 알고, 그 그래프를 이해한다.', cognitive: 'UNDERSTANDING', difficulty_min: 1, difficulty_max: 3, keywords: ['정의역', '공역', '치역'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },

  // [10수학04-02] 합성함수·역함수 — 기존 3 → 7
  { type_code: 'MA-HS0-FUN-02-004', type_name: '합성함수의 성질', description: '합성함수의 결합법칙, 항등함수와의 합성 등', solution_method: '합성함수 성질 적용', subject: '수학', area: '함수', standard_code: '[10수학04-02]', standard_content: '합성함수와 역함수의 의미를 이해한다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 3, keywords: ['합성함수', '결합법칙', '성질'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-02-005', type_name: '역함수의 그래프', description: '역함수의 그래프가 y=x에 대칭임을 이용', solution_method: 'y=x 대칭 변환', subject: '수학', area: '함수', standard_code: '[10수학04-02]', standard_content: '합성함수와 역함수의 의미를 이해한다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 3, keywords: ['역함수', '그래프', 'y=x대칭'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-02-006', type_name: '합성함수·역함수 종합', description: 'f∘g의 역함수, (f∘g)⁻¹ = g⁻¹∘f⁻¹ 등 종합 활용', solution_method: '합성+역함수 성질 결합', subject: '수학', area: '함수', standard_code: '[10수학04-02]', standard_content: '합성함수와 역함수의 의미를 이해한다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['합성함수', '역함수', '종합'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-02-007', type_name: '합성함수의 미지함수 결정', description: 'f∘g = h일 때 f 또는 g 구하기', solution_method: '역함수 이용 또는 대입법', subject: '수학', area: '함수', standard_code: '[10수학04-02]', standard_content: '합성함수와 역함수의 의미를 이해한다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['합성함수', '미지함수', '결정'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },

  // [10수학04-03] 유리식 — 기존 3 → 6
  { type_code: 'MA-HS0-FUN-03-004', type_name: '유리식의 사칙연산', description: '유리식의 덧셈·뺄셈·곱셈·나눗셈', solution_method: '통분 후 계산', subject: '수학', area: '함수', standard_code: '[10수학04-03]', standard_content: '유리식과 유리함수를 이해한다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 3, keywords: ['유리식', '사칙연산', '통분'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-03-005', type_name: '유리식의 조건 (정의 불가)', description: '유리식이 정의되지 않는 조건 (분모=0)', solution_method: '분모≠0 조건 분석', subject: '수학', area: '함수', standard_code: '[10수학04-03]', standard_content: '유리식과 유리함수를 이해한다.', cognitive: 'UNDERSTANDING', difficulty_min: 1, difficulty_max: 2, keywords: ['유리식', '정의역', '분모'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-03-006', type_name: '번분수식의 계산', description: '분수식 안에 분수가 있는 복잡한 유리식 정리', solution_method: '역수 변환 + 통분', subject: '수학', area: '함수', standard_code: '[10수학04-03]', standard_content: '유리식과 유리함수를 이해한다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 4, keywords: ['번분수식', '복잡한유리식', '정리'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },

  // [10수학04-04] 유리함수 — 기존 3 → 6
  { type_code: 'MA-HS0-FUN-04-004', type_name: '유리함수의 평행이동·대칭이동', description: 'y=a/(x-p)+q 형태의 그래프 이동', solution_method: '표준형 변환 + 이동', subject: '수학', area: '함수', standard_code: '[10수학04-04]', standard_content: '유리함수의 그래프를 그릴 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 3, keywords: ['유리함수', '평행이동', '점근선'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-04-005', type_name: '유리함수와 직선의 교점', description: '유리함수 그래프와 직선의 교점 구하기', solution_method: '연립방정식', subject: '수학', area: '함수', standard_code: '[10수학04-04]', standard_content: '유리함수의 그래프를 그릴 수 있다.', cognitive: 'CALCULATION', difficulty_min: 3, difficulty_max: 4, keywords: ['유리함수', '교점', '직선'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-04-006', type_name: '유리함수 활용 (역수 관계)', description: '유리함수를 이용한 실생활 모델링', solution_method: '유리함수 모델링', subject: '수학', area: '함수', standard_code: '[10수학04-04]', standard_content: '유리함수의 그래프를 그릴 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['유리함수', '활용', '모델링'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },

  // [10수학04-05] 무리함수 — 기존 3 → 6
  { type_code: 'MA-HS0-FUN-05-004', type_name: '무리식의 계산', description: '분모의 유리화, 이중근호 등 무리식 정리', solution_method: '유리화 + 이중근호 풀기', subject: '수학', area: '함수', standard_code: '[10수학04-05]', standard_content: '무리함수의 그래프를 그릴 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 4, keywords: ['무리식', '유리화', '이중근호'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-05-005', type_name: '무리함수의 정의역과 치역', description: '무리함수의 정의역(근호 안 ≥0)과 치역 구하기', solution_method: '부등식 풀이', subject: '수학', area: '함수', standard_code: '[10수학04-05]', standard_content: '무리함수의 그래프를 그릴 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 3, keywords: ['무리함수', '정의역', '치역'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },
  { type_code: 'MA-HS0-FUN-05-006', type_name: '무리함수와 직선의 교점', description: '무리함수 그래프와 직선의 교점 (무연근 확인)', solution_method: '연립 + 양변 제곱 + 검증', subject: '수학', area: '함수', standard_code: '[10수학04-05]', standard_content: '무리함수의 그래프를 그릴 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['무리함수', '교점', '무연근'], school_level: '고등학교', level_code: 'HS0', domain_code: 'FUN' },

  // ── CRD 좌표와 도형 확장 ──────────────────────────────────────
  // [10수학02-01] ~ [10수학02-09] — 기존 28 → ~50
  // 추가: 각 표준에 2-3개씩 확장

  // [10수학02-01] 두 점 사이의 거리 — 기존 3 → 5
  { type_code: 'MA-HS0-CRD-01-004', type_name: '좌표평면 위의 도형의 넓이', description: '좌표를 이용한 삼각형·사각형의 넓이 구하기', solution_method: '꼭짓점 좌표 활용 (신발끈 공식)', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-01]', standard_content: '두 점 사이의 거리를 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['좌표', '넓이', '삼각형', '신발끈'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-01-005', type_name: '거리 조건을 만족하는 도형', description: '특정 거리 조건을 만족하는 점의 자취', solution_method: '거리 공식 + 자취 방정식', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-01]', standard_content: '두 점 사이의 거리를 구할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['거리조건', '자취', '방정식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },

  // [10수학02-02] 내분점·외분점 — 기존 3 → 6
  { type_code: 'MA-HS0-CRD-02-004', type_name: '무게중심 좌표', description: '삼각형의 무게중심 좌표 구하기', solution_method: '((x₁+x₂+x₃)/3, (y₁+y₂+y₃)/3)', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-02]', standard_content: '선분의 내분점과 외분점의 좌표를 구할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 3, keywords: ['무게중심', '삼각형', '좌표'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-02-005', type_name: '내분점·외분점 활용', description: '내분점·외분점을 이용한 도형 문제', solution_method: '내분·외분 공식 활용', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-02]', standard_content: '선분의 내분점과 외분점의 좌표를 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 4, keywords: ['내분점', '외분점', '활용'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-02-006', type_name: '좌표를 이용한 도형의 성질 증명', description: '좌표 설정 후 도형의 기하학적 성질 증명', solution_method: '좌표 설정 + 공식 적용', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-02]', standard_content: '선분의 내분점과 외분점의 좌표를 구할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 4, difficulty_max: 5, keywords: ['좌표기하', '증명', '도형성질'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },

  // [10수학02-03] 직선의 방정식 — 기존 3 → 6
  { type_code: 'MA-HS0-CRD-03-004', type_name: '두 점을 지나는 직선의 방정식', description: '두 점이 주어졌을 때 직선의 방정식 구하기', solution_method: '기울기 계산 + 점-기울기 형', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-03]', standard_content: '직선의 방정식을 구할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 1, difficulty_max: 2, keywords: ['직선', '두점', '기울기'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-03-005', type_name: 'x절편·y절편 형태의 직선', description: 'x/a + y/b = 1 형태의 직선 방정식', solution_method: '절편형 활용', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-03]', standard_content: '직선의 방정식을 구할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 3, keywords: ['절편형', '직선', 'x절편', 'y절편'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-03-006', type_name: '직선의 방정식 활용 (도형)', description: '직선을 이용한 삼각형·사각형 넓이 구하기', solution_method: '교점 + 넓이 공식', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-03]', standard_content: '직선의 방정식을 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['직선', '넓이', '도형활용'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },

  // [10수학02-04] 두 직선의 관계 — 기존 3 → 6
  { type_code: 'MA-HS0-CRD-04-004', type_name: '두 직선의 교점을 지나는 직선', description: 'l₁ + kl₂ = 0 형태로 교점을 지나는 직선의 방정식', solution_method: '직선 묶음 활용', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-04]', standard_content: '두 직선의 위치 관계를 이해한다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 4, keywords: ['교점', '직선묶음', '위치관계'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-04-005', type_name: '세 직선의 위치 관계', description: '세 직선이 한 점에서 만날 조건, 삼각형을 이루는 조건', solution_method: '교점 일치 조건 분석', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-04]', standard_content: '두 직선의 위치 관계를 이해한다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['세직선', '한점', '삼각형'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-04-006', type_name: '정사영과 대칭점', description: '직선에 대한 점의 대칭점, 정사영 구하기', solution_method: '수선의 발 + 대칭점 공식', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-04]', standard_content: '두 직선의 위치 관계를 이해한다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['대칭점', '정사영', '수선의발'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },

  // [10수학02-05] 점과 직선 사이의 거리 — 기존 3 → 6
  { type_code: 'MA-HS0-CRD-05-004', type_name: '평행한 두 직선 사이의 거리', description: '평행한 두 직선 사이의 거리 구하기', solution_method: '한 직선 위의 점 → 다른 직선까지 거리', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-05]', standard_content: '점과 직선 사이의 거리를 구할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 3, keywords: ['평행직선', '거리', '공식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-05-005', type_name: '점과 직선 거리의 활용 (최단거리)', description: '점-직선 거리를 이용한 최단거리 문제', solution_method: '대칭점 활용 + 삼각부등식', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-05]', standard_content: '점과 직선 사이의 거리를 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['최단거리', '대칭점', '점과직선'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-05-006', type_name: '직선과 넓이 조건', description: '넓이가 주어진 삼각형의 꼭짓점/직선 구하기', solution_method: '점-직선 거리 = 높이', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-05]', standard_content: '점과 직선 사이의 거리를 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['넓이', '삼각형', '높이', '거리'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },

  // [10수학02-06] 원의 방정식 — 기존 3 → 7
  { type_code: 'MA-HS0-CRD-06-004', type_name: '원의 방정식 (일반형 → 표준형)', description: 'x²+y²+Ax+By+C=0을 표준형으로 변환', solution_method: '완전제곱식 변환', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-06]', standard_content: '원의 방정식을 구할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 3, keywords: ['원', '일반형', '표준형', '완전제곱'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-06-005', type_name: '세 점을 지나는 원', description: '세 점이 주어졌을 때 원의 방정식 결정', solution_method: '일반형에 대입 → 연립방정식', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-06]', standard_content: '원의 방정식을 구할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 4, keywords: ['세점', '원', '연립방정식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-06-006', type_name: '원의 방정식 조건 문제', description: '중심, 반지름 등 조건이 주어진 원의 방정식', solution_method: '조건 해석 + 표준형', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-06]', standard_content: '원의 방정식을 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['원', '조건', '방정식결정'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-06-007', type_name: '직선 위의 중심을 가진 원', description: '중심이 특정 직선 위에 있는 원의 방정식', solution_method: '중심 좌표 매개변수화', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-06]', standard_content: '원의 방정식을 구할 수 있다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 4, keywords: ['원', '중심', '직선위'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },

  // [10수학02-07] 원과 직선 — 기존 4 → 8
  { type_code: 'MA-HS0-CRD-07-005', type_name: '원의 접선의 방정식 (기울기)', description: '기울기가 주어진 원의 접선 구하기', solution_method: 'D=0 조건 또는 공식', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-07]', standard_content: '원과 직선의 위치 관계를 이해한다.', cognitive: 'CALCULATION', difficulty_min: 3, difficulty_max: 4, keywords: ['접선', '기울기', '원'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-07-006', type_name: '원 위의 점에서의 접선', description: '원 위의 점 (x₁,y₁)에서의 접선 방정식', solution_method: 'xx₁+yy₁=r² 공식', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-07]', standard_content: '원과 직선의 위치 관계를 이해한다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 3, keywords: ['접선', '원위의점', '공식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-07-007', type_name: '원 밖의 점에서의 접선', description: '원 밖의 점에서 원에 그은 접선 구하기', solution_method: '접점 좌표 설정 + 수직조건', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-07]', standard_content: '원과 직선의 위치 관계를 이해한다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['접선', '원밖의점', '수직'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-07-008', type_name: '원과 직선의 현의 길이', description: '원과 직선이 만들어내는 현의 길이 구하기', solution_method: '중심-직선 거리 + 피타고라스', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-07]', standard_content: '원과 직선의 위치 관계를 이해한다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 4, keywords: ['현의길이', '원', '직선', '피타고라스'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },

  // [10수학02-08] 두 원의 관계 — 기존 3 → 6
  { type_code: 'MA-HS0-CRD-08-004', type_name: '두 원의 교점을 지나는 원/직선', description: '두 원의 교점을 지나는 원 또는 직선의 방정식', solution_method: 'C₁+kC₂=0 형태', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-08]', standard_content: '두 원의 위치 관계를 이해한다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['두원', '교점', '공통현'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-08-005', type_name: '두 원의 공통접선', description: '두 원의 공통외접선, 공통내접선 구하기', solution_method: '접선 조건 + 거리 관계', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-08]', standard_content: '두 원의 위치 관계를 이해한다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 4, difficulty_max: 5, keywords: ['공통접선', '외접선', '내접선'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-08-006', type_name: '두 원의 위치 관계와 미정계수', description: '두 원이 특정 위치 관계를 가지기 위한 조건', solution_method: '중심거리와 반지름의 관계', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-08]', standard_content: '두 원의 위치 관계를 이해한다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['두원', '위치관계', '미정계수'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },

  // [10수학02-09] 도형의 이동 — 기존 3 → 7
  { type_code: 'MA-HS0-CRD-09-004', type_name: 'x축 대칭이동', description: '도형·방정식의 x축 대칭이동 (y→-y)', solution_method: 'y를 -y로 치환', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-09]', standard_content: '도형의 이동을 이해한다.', cognitive: 'CALCULATION', difficulty_min: 1, difficulty_max: 2, keywords: ['x축대칭', '대칭이동'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-09-005', type_name: 'y축 대칭이동', description: '도형·방정식의 y축 대칭이동 (x→-x)', solution_method: 'x를 -x로 치환', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-09]', standard_content: '도형의 이동을 이해한다.', cognitive: 'CALCULATION', difficulty_min: 1, difficulty_max: 2, keywords: ['y축대칭', '대칭이동'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-09-006', type_name: '원점 대칭이동', description: '도형·방정식의 원점 대칭이동 (x→-x, y→-y)', solution_method: '(x,y)→(-x,-y)', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-09]', standard_content: '도형의 이동을 이해한다.', cognitive: 'CALCULATION', difficulty_min: 1, difficulty_max: 2, keywords: ['원점대칭', '대칭이동'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },
  { type_code: 'MA-HS0-CRD-09-007', type_name: '복합 이동 (평행+대칭)', description: '평행이동과 대칭이동을 연속으로 적용', solution_method: '순서대로 변환 적용', subject: '수학', area: '도형의 방정식', standard_code: '[10수학02-09]', standard_content: '도형의 이동을 이해한다.', cognitive: 'INFERENCE', difficulty_min: 3, difficulty_max: 5, keywords: ['복합이동', '평행이동', '대칭이동'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CRD' },

  // ── CNT 경우의 수 확장 ──────────────────────────────────────
  // [10수학05-01] 경우의 수 — 기존 3 → 6
  { type_code: 'MA-HS0-CNT-01-004', type_name: '합의 법칙', description: '합의 법칙을 이용한 경우의 수 구하기', solution_method: '동시에 일어나지 않는 사건의 합', subject: '수학', area: '경우의 수', standard_code: '[10수학05-01]', standard_content: '경우의 수를 구할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 1, difficulty_max: 2, keywords: ['합의법칙', '경우의수'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CNT' },
  { type_code: 'MA-HS0-CNT-01-005', type_name: '곱의 법칙', description: '곱의 법칙을 이용한 경우의 수 구하기', solution_method: '동시에 일어나는 사건의 곱', subject: '수학', area: '경우의 수', standard_code: '[10수학05-01]', standard_content: '경우의 수를 구할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 1, difficulty_max: 3, keywords: ['곱의법칙', '경우의수'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CNT' },
  { type_code: 'MA-HS0-CNT-01-006', type_name: '경우의 수 활용 (수 만들기)', description: '조건을 만족하는 수(자연수, 짝수 등) 만들기', solution_method: '자릿수별 경우의 수', subject: '수학', area: '경우의 수', standard_code: '[10수학05-01]', standard_content: '경우의 수를 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 2, difficulty_max: 4, keywords: ['수만들기', '자릿수', '경우의수'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CNT' },

  // [10수학05-02] 순열 — 기존 3 → 7
  { type_code: 'MA-HS0-CNT-02-004', type_name: '중복순열', description: 'n개에서 r개를 중복 허용하여 뽑는 순열', solution_method: 'nΠr = n^r', subject: '수학', area: '경우의 수', standard_code: '[10수학05-02]', standard_content: '순열의 수를 구할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 3, keywords: ['중복순열', '경우의수'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CNT' },
  { type_code: 'MA-HS0-CNT-02-005', type_name: '같은 것이 있는 순열', description: '같은 것이 포함된 n개의 배열 수', solution_method: 'n!/(p!q!...)', subject: '수학', area: '경우의 수', standard_code: '[10수학05-02]', standard_content: '순열의 수를 구할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 2, difficulty_max: 4, keywords: ['같은것순열', '중복', '배열'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CNT' },
  { type_code: 'MA-HS0-CNT-02-006', type_name: '원순열', description: '원형으로 배열하는 순열의 수', solution_method: '(n-1)!', subject: '수학', area: '경우의 수', standard_code: '[10수학05-02]', standard_content: '순열의 수를 구할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 4, keywords: ['원순열', '원형배열'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CNT' },
  { type_code: 'MA-HS0-CNT-02-007', type_name: '순열 활용 (자리 배치)', description: '조건이 있는 자리 배치 문제', solution_method: '조건 우선 배치 후 나머지', subject: '수학', area: '경우의 수', standard_code: '[10수학05-02]', standard_content: '순열의 수를 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['자리배치', '조건', '순열'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CNT' },

  // [10수학05-03] 조합 — 기존 3 → 7
  { type_code: 'MA-HS0-CNT-03-004', type_name: '조합의 성질 활용', description: 'nCr = nC(n-r), nCr = n-1Cr-1 + n-1Cr 등 성질', solution_method: '조합 공식 성질', subject: '수학', area: '경우의 수', standard_code: '[10수학05-03]', standard_content: '조합의 수를 구할 수 있다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 3, keywords: ['조합', '성질', '공식'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CNT' },
  { type_code: 'MA-HS0-CNT-03-005', type_name: '조합 활용 (분류·선택)', description: '그룹 선택, 대표 선출 등 조합 활용 문제', solution_method: '조건별 조합 계산', subject: '수학', area: '경우의 수', standard_code: '[10수학05-03]', standard_content: '조합의 수를 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['조합', '선택', '분류'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CNT' },
  { type_code: 'MA-HS0-CNT-03-006', type_name: '중복조합', description: '서로 다른 n종류에서 r개를 중복 허용하여 선택', solution_method: 'nHr = n+r-1Cr', subject: '수학', area: '경우의 수', standard_code: '[10수학05-03]', standard_content: '조합의 수를 구할 수 있다.', cognitive: 'CALCULATION', difficulty_min: 3, difficulty_max: 4, keywords: ['중복조합', '선택'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CNT' },
  { type_code: 'MA-HS0-CNT-03-007', type_name: '조합 활용 (도형·최단 경로)', description: '격자점 최단 경로, 직선 교점 등 도형+조합', solution_method: '경로 = nCr (이동 조합)', subject: '수학', area: '경우의 수', standard_code: '[10수학05-03]', standard_content: '조합의 수를 구할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['최단경로', '격자', '도형', '조합'], school_level: '고등학교', level_code: 'HS0', domain_code: 'CNT' },

  // ── POL 부등식 영역 추가 (10수학01-15, 01-16) 확장 ──────────
  { type_code: 'MA-HS0-POL-15-004', type_name: '부등식의 영역 (연립)', description: '연립부등식이 나타내는 영역 구하기', solution_method: '각 부등식 영역의 교집합', subject: '수학', area: '다항식', standard_code: '[10수학01-15]', standard_content: '부등식의 영역을 이해한다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 4, keywords: ['부등식영역', '연립', '교집합'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-15-005', type_name: '부등식 영역에서의 최대·최소', description: 'ax+by의 최대·최소를 부등식 영역에서 구하기', solution_method: '선형계획법 (꼭짓점 검사)', subject: '수학', area: '다항식', standard_code: '[10수학01-15]', standard_content: '부등식의 영역을 이해한다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['선형계획법', '최대최소', '부등식영역'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-15-006', type_name: '원과 부등식의 영역', description: '원의 부등식 (x-a)²+(y-b)²≤r²의 영역', solution_method: '원 내부/외부 판별', subject: '수학', area: '다항식', standard_code: '[10수학01-15]', standard_content: '부등식의 영역을 이해한다.', cognitive: 'UNDERSTANDING', difficulty_min: 2, difficulty_max: 4, keywords: ['원', '부등식영역', '내부외부'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-16-002', type_name: '부등식 영역 활용 (실생활)', description: '실생활 문제를 부등식 영역으로 모델링', solution_method: '변수 설정 + 부등식 + 영역', subject: '수학', area: '다항식', standard_code: '[10수학01-16]', standard_content: '부등식의 영역을 활용하여 문제를 해결할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['부등식영역', '실생활', '모델링'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
  { type_code: 'MA-HS0-POL-16-003', type_name: '부등식 영역과 정수해', description: '부등식 영역 내 격자점(정수해)의 개수', solution_method: '영역 그리기 + 격자점 세기', subject: '수학', area: '다항식', standard_code: '[10수학01-16]', standard_content: '부등식의 영역을 활용하여 문제를 해결할 수 있다.', cognitive: 'PROBLEM_SOLVING', difficulty_min: 3, difficulty_max: 5, keywords: ['정수해', '격자점', '부등식영역'], school_level: '고등학교', level_code: 'HS0', domain_code: 'POL' },
];

// ============================================================================
// SQL 생성 함수
// ============================================================================
function generateSQL(types: ExpandedType[]): string {
  const lines: string[] = [];
  lines.push('-- ============================================================================');
  lines.push('-- 확장 세부유형 추가 데이터 (시중교재 분석 기반)');
  lines.push(`-- Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`-- Total new types: ${types.length}`);
  lines.push('-- ============================================================================');
  lines.push('');

  for (const t of types) {
    const keywords = JSON.stringify(t.keywords).replace(/'/g, "''");
    const esc = (s: string) => s.replace(/'/g, "''");
    lines.push(`INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)`);
    lines.push(`VALUES ('${esc(t.type_code)}', '${esc(t.type_name)}', '${esc(t.description)}', '${esc(t.solution_method)}', '${esc(t.subject)}', '${esc(t.area)}', '${esc(t.standard_code)}', '${esc(t.standard_content)}', '${t.cognitive}', ${t.difficulty_min}, ${t.difficulty_max}, '${keywords}'::jsonb, '${esc(t.school_level)}', '${t.level_code}', '${t.domain_code}', true)`);
    lines.push(`ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();`);
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// JSON 생성 함수
// ============================================================================
function generateJSON(types: ExpandedType[]): string {
  return JSON.stringify(types, null, 2);
}

// ============================================================================
// 메인 실행
// ============================================================================
async function main() {
  const allTypes: ExpandedType[] = [
    ...HS0_EXPANSION,
    // 다른 레벨도 여기에 추가됨
  ];

  console.log(`Total new types to generate: ${allTypes.length}`);
  console.log(`  HS0: ${HS0_EXPANSION.length}`);

  // SQL 출력
  const sql = generateSQL(allTypes);
  const sqlPath = path.join(__dirname, '..', 'curriculum_data', 'seed_expanded_types_v2.sql');
  fs.writeFileSync(sqlPath, sql, 'utf-8');
  console.log(`SQL written to: ${sqlPath}`);

  // JSON 출력 (확인용)
  const json = generateJSON(allTypes);
  const jsonPath = path.join(__dirname, '..', 'curriculum_data', 'expanded_types_v2_additions.json');
  fs.writeFileSync(jsonPath, json, 'utf-8');
  console.log(`JSON written to: ${jsonPath}`);
}

main().catch(console.error);
