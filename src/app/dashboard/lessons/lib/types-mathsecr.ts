// 수학비서 분류 트리 노드 타입

export interface MathsecrNode {
  code: string;                  // "MS09-01-03-02-05" (depth 5) or "MS09" (depth 1)
  subject_code: string;          // "09"
  subject_name: string;          // "중3-1"
  level1_code: string | null;
  level1_name: string | null;
  level2_code: string | null;
  level2_name: string | null;
  level3_code: string | null;
  level3_name: string | null;
  level4_code: string | null;
  level4_name: string | null;
  depth: number;                 // 1=과목 ... 5=세부유형
  is_leaf: boolean;
  parent_code: string | null;
  full_path: string;             // "중3-1 > 다항식의 곱셈 > ..."
}

export interface UnitScore {
  id: string;
  meeting_id: string;
  student_id: string;
  mathsecr_code: string;
  score: number;            // 0~100
  problems_total: number | null;
  problems_correct: number | null;
  note: string | null;
  recorded_at: string;
}
