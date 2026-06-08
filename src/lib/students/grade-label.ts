// ============================================================================
// 학생 학년 표시 유틸
//
// users.grade 컬럼은 integer (1~12).
//   1~6   = 초1~초6
//   7~9   = 중1~중3
//   10~12 = 고1~고3
//
// 화면에 "7학년" 같이 정수가 그대로 노출되는 회귀 차단용 공통 유틸.
// 사용자 요구: "학생 학년 중1 인데 7학년으로 표시되거나 표시가 안된다".
// ============================================================================

/** integer grade → 한글 라벨 (없으면 fallback) */
export function gradeIntToLabel(
  grade: number | string | null | undefined,
  fallback: string = '',
): string {
  if (grade == null) return fallback;
  // 이미 한글 라벨("중2" 등)로 들어온 경우 그대로 통과.
  //   소스 혼재: 일부 API(/api/users/students)는 grade 를 정수가 아니라 변환된 라벨
  //   문자열로 반환한다. 이를 다시 변환하면 parseInt 실패로 라벨이 blank 되던 회귀 차단.
  if (typeof grade === 'string') {
    const t = grade.trim();
    if (/^(초[1-6]|중[1-3]|고[1-3])$/.test(t)) return t;
  }
  const n = typeof grade === 'number' ? grade : parseInt(String(grade), 10);
  if (!Number.isInteger(n)) return fallback;
  if (n >= 1 && n <= 6) return `초${n}`;
  if (n >= 7 && n <= 9) return `중${n - 6}`;
  if (n >= 10 && n <= 12) return `고${n - 9}`;
  return fallback;
}

/** 한글 라벨 → integer (역방향, 입력 normalize) */
export function gradeLabelToInt(label: string | null | undefined): number | null {
  if (!label) return null;
  const map: Record<string, number> = {
    '초1': 1, '초2': 2, '초3': 3, '초4': 4, '초5': 5, '초6': 6,
    '중1': 7, '중2': 8, '중3': 9,
    '고1': 10, '고2': 11, '고3': 12,
  };
  const trimmed = String(label).trim();
  return map[trimmed] ?? null;
}
