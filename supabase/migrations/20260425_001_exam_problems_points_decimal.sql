-- exam_problems.points: INT → NUMERIC(4,2)
-- 고등학교 시험지의 [4.3점], [4.5점] 같은 소수점 배점 저장 지원
-- 기존 정수 값(4, 5 등)은 자동으로 4.00, 5.00 형태로 보존됨

ALTER TABLE exam_problems
  ALTER COLUMN points TYPE NUMERIC(4, 2) USING points::NUMERIC(4, 2);

COMMENT ON COLUMN exam_problems.points IS '문제 배점 (소수점 두 자리까지, 0.00~99.99). 소수점 배점은 고등학교 시험지에서 흔함.';
