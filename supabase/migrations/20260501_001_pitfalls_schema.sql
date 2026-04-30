-- ============================================================================
-- 카파시 함정 유형 시스템 (Phase C-1) — 인프라 마이그레이션
--
-- 유형 트리(mathsecr_types)는 "무엇을 묻는가",
-- 함정 유형(pitfall_types)은 "왜 틀리는가" — 별도 차원.
-- 학생 사고 패턴 약점(부호 실수/분배법칙/정의역 등) 추적 + 학부모 대시보드
-- "이번 주 새 연결" 위젯 + 학원 누적 자산 self-compiling 흐름의 base.
--
-- 이번 마이그레이션은 인프라(테이블 + 시드 20여)만. 자동 태깅 통합은 Phase C-1b.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) pitfall_types — 마스터 (확장 가능, AI가 새 코드 발견하면 자동 추가도 가능)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pitfall_types (
  code        VARCHAR(50) PRIMARY KEY,
  label_ko    VARCHAR(100) NOT NULL,
  description TEXT,
  category    VARCHAR(30) NOT NULL,        -- 'computation' | 'concept' | 'logic' | 'wording' | 'time'
  examples    TEXT[],
  is_seeded   BOOLEAN     DEFAULT FALSE,   -- 시드(공식) vs AI 추가
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pitfall_types_category ON pitfall_types(category);

COMMENT ON TABLE  pitfall_types IS '학생 오답 패턴 마스터 — "왜 틀리는가" 차원 (mathsecr_types와 별개).';
COMMENT ON COLUMN pitfall_types.category IS 'computation(계산)/concept(개념)/logic(논리)/wording(문장)/time(시간)';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) problem_pitfalls — 문항 ↔ 함정 매핑 (자산화 시 자동 태깅 + 강사 검수)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS problem_pitfalls (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id    UUID         NOT NULL REFERENCES problems(id)      ON DELETE CASCADE,
  pitfall_code  VARCHAR(50)  NOT NULL REFERENCES pitfall_types(code) ON UPDATE CASCADE,
  ai_confidence DECIMAL(5,4),
  is_verified   BOOLEAN      DEFAULT FALSE,
  verified_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
  verified_at   TIMESTAMPTZ,
  reason        TEXT,                                        -- AI가 매긴 이유 또는 강사 메모
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(problem_id, pitfall_code)
);

CREATE INDEX IF NOT EXISTS idx_problem_pitfalls_pitfall_code ON problem_pitfalls(pitfall_code);
CREATE INDEX IF NOT EXISTS idx_problem_pitfalls_problem_id  ON problem_pitfalls(problem_id);
CREATE INDEX IF NOT EXISTS idx_problem_pitfalls_verified    ON problem_pitfalls(is_verified) WHERE is_verified = TRUE;

COMMENT ON TABLE  problem_pitfalls IS '문항-함정 매핑. 자산화 시 AI 자동 태깅(Phase C-1b)·강사 검수(C-1c).';
COMMENT ON COLUMN problem_pitfalls.is_verified IS '강사가 검수 확정. classifications.is_verified와 동일 패턴.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) 시드 — 공식 함정 유형 20여 (자주 등장하는 사고 패턴)
--    code는 SCREAMING_SNAKE_CASE, label_ko는 짧은 한국어, examples는 학생 풀이 기준 짧은 예.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO pitfall_types (code, label_ko, description, category, examples, is_seeded) VALUES
  ('SIGN_ERROR',         '부호 실수',
   '음수·양수 부호 처리 오류 (분배·이항·제곱 등)',
   'computation', ARRAY['-(a-b) = -a+b를 -a-b로 처리', '-2² = -4를 4로 처리'], TRUE),
  ('DISTRIBUTION_MISS',  '분배법칙 누락',
   '괄호 밖 항이 안쪽 모든 항에 안 곱해지는 실수',
   'computation', ARRAY['a(b+c) = ab+c로 c 누락'], TRUE),
  ('DOMAIN_IGNORE',      '정의역 무시',
   '함수·근호·로그 정의역 조건 누락',
   'concept',     ARRAY['√(x-1) ≥ 0 조건 X', 'log의 진수 > 0 누락'], TRUE),
  ('ROOT_COUNT',         '근의 개수 조건 누락',
   '판별식·근의 분리 조건 잘못 처리',
   'concept',     ARRAY['중근/허근 구분 누락', 'D≥0 vs D>0'], TRUE),
  ('FRACTION_DENOM',     '분모 0 조건',
   '분수식 분모 0 조건 무시',
   'concept',     ARRAY['(x²-1)/(x-1)에서 x≠1 누락'], TRUE),
  ('LOG_BASE_CONDITION', '로그 밑·진수 조건 누락',
   '밑 a>0,a≠1 / 진수>0 조건 무시',
   'concept',     ARRAY['logₐb에서 a=1 허용'], TRUE),
  ('LOG_SUBSTITUTION',   '상용로그 보조값 활용 실패',
   '문제에 log X = N.NNNN 보조값이 주어졌는데 거듭제곱 직접 계산 시도',
   'concept',     ARRAY['log 1.4=0.1461 무시하고 1.4^13 직접 계산'], TRUE),
  ('TRIG_PERIOD',        '삼각함수 주기·범위 실수',
   '주기 또는 정의역 범위 잘못 적용',
   'concept',     ARRAY['sin x = 1/2 해 1개만 (주기 X)'], TRUE),
  ('INEQUALITY_SIGN',    '부등식 부호 반전 누락',
   '음수 곱하기·나누기 시 부등호 반전 누락',
   'computation', ARRAY['-2x>4의 해 x>-2로 처리'], TRUE),
  ('UNIT_CONVERSION',    '단위 환산 실수',
   '시간·거리·확률 단위 통일 실패',
   'computation', ARRAY['시간을 분으로 변환 누락'], TRUE),
  ('PROB_INDEPENDENCE',  '확률 독립·조건부 혼동',
   '독립사건·조건부확률 공식 혼동',
   'concept',     ARRAY['P(A∩B)=P(A)P(B|A) 자리 바꿈'], TRUE),
  ('GRAPH_TRANSFORM',    '그래프 평행·대칭 방향 혼동',
   'y=f(x-a)의 +a/-a 방향 혼동',
   'concept',     ARRAY['y=f(x-2)을 좌측으로 평행이동'], TRUE),
  ('LIMIT_INDETERMINATE','극한 부정형 처리',
   '∞-∞·0/0·∞/∞ 부정형 직접 대입',
   'concept',     ARRAY['(0/0) 직접 0으로 처리'], TRUE),
  ('DERIVATIVE_RULE',    '미분 공식 혼동',
   '곱·몫·합성 미분법 혼동',
   'computation', ARRAY['(uv)′ = u′v′로 처리'], TRUE),
  ('INTEGRATION_BOUND',  '정적분 상하한 혼동',
   '구간 분할·치환 시 한계 잘못 적용',
   'computation', ARRAY['치환 후 상하한 미변경'], TRUE),
  ('VECTOR_DIRECTION',   '벡터 방향·시작점 혼동',
   '벡터 빼기·방향 부호 실수',
   'concept',     ARRAY['AB = B-A 아닌 A-B로 처리'], TRUE),
  ('GEOMETRIC_MISREAD',  '도형 조건 오독',
   '평행·수직·길이 조건 오해',
   'wording',     ARRAY['평행을 같다로 오독'], TRUE),
  ('CASE_MISSING',       '경우의 수 분기 누락',
   '문제 분기·조건 분기 일부 누락',
   'concept',     ARRAY['홀짝 둘 다 검토 누락'], TRUE),
  ('TIME_PRESSURE',      '시간 압박 단순 실수',
   '시간 부족으로 검산 누락',
   'time',        ARRAY['검산 없이 답안 제출'], TRUE),
  ('WORD_PROBLEM_TRANS', '문장→식 전환 오류',
   '문제 조건의 식 전환 오역',
   'wording',     ARRAY['"10% 증가"를 "+10"으로'], TRUE),
  ('NEGATION_CONDITION', '부정 조건 처리',
   '"…아닌"·"…보다 작은" 등 부정 조건 오해',
   'wording',     ARRAY['"양수 아닌" → x≤0'], TRUE)
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) updated_at 자동 갱신 트리거 (다른 테이블 패턴 따름)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_pitfall_types_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pitfall_types_set_updated_at ON pitfall_types;
CREATE TRIGGER pitfall_types_set_updated_at
  BEFORE UPDATE ON pitfall_types
  FOR EACH ROW EXECUTE FUNCTION trg_pitfall_types_set_updated_at();

CREATE OR REPLACE FUNCTION trg_problem_pitfalls_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS problem_pitfalls_set_updated_at ON problem_pitfalls;
CREATE TRIGGER problem_pitfalls_set_updated_at
  BEFORE UPDATE ON problem_pitfalls
  FOR EACH ROW EXECUTE FUNCTION trg_problem_pitfalls_set_updated_at();
