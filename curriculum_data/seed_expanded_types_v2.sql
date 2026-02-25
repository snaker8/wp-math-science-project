-- ============================================================================
-- 확장 세부유형 추가 데이터 (시중교재 분석 기반)
-- Generated: 2026-02-22
-- Total new types: 137
-- ============================================================================

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-01-005', '다항식의 정리 (내림차순·오름차순)', '다항식을 특정 문자에 대해 내림차순 또는 오름차순으로 정리', '차수 기준 재배열', '수학', '다항식', '[10수학01-01]', '다항식의 덧셈, 뺄셈, 곱셈을 할 수 있다.', 'UNDERSTANDING', 1, 2, '["내림차순","오름차순","다항식 정리"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-01-006', '곱셈 공식의 활용 (식의 값)', '곱셈 공식을 이용하여 주어진 조건에서 식의 값 구하기', '곱셈 공식 변형 후 대입', '수학', '다항식', '[10수학01-01]', '다항식의 덧셈, 뺄셈, 곱셈을 할 수 있다.', 'PROBLEM_SOLVING', 2, 4, '["곱셈공식","식의값","대입"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-01-007', '대칭식과 교대식', 'a+b, ab가 주어졌을 때 대칭식의 값 구하기', '기본 대칭식으로 변환', '수학', '다항식', '[10수학01-01]', '다항식의 덧셈, 뺄셈, 곱셈을 할 수 있다.', 'INFERENCE', 3, 5, '["대칭식","교대식","a+b","ab"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-01-008', '세 문자 이상의 곱셈 공식', '(a+b+c)² 등 세 문자 이상의 곱셈 공식 활용', '다문자 곱셈 공식 적용', '수학', '다항식', '[10수학01-01]', '다항식의 덧셈, 뺄셈, 곱셈을 할 수 있다.', 'CALCULATION', 2, 4, '["세문자","곱셈공식","전개"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-02-004', '다항식의 나눗셈 (몫과 나머지)', '다항식 ÷ 다항식에서 몫과 나머지를 구하는 기본 문제', '장제법(긴 나눗셈)', '수학', '다항식', '[10수학01-02]', '다항식의 나눗셈을 할 수 있다.', 'CALCULATION', 1, 3, '["나눗셈","몫","나머지","장제법"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-02-005', '항등식과 미정계수법 (계수비교법)', '항등식의 성질을 이용하여 미정계수 결정 (양변의 계수 비교)', '계수비교법', '수학', '다항식', '[10수학01-02]', '다항식의 나눗셈을 할 수 있다.', 'UNDERSTANDING', 2, 4, '["항등식","미정계수","계수비교"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-02-006', '항등식과 미정계수법 (수치대입법)', '항등식에 특정 값을 대입하여 미정계수 결정', '수치대입법', '수학', '다항식', '[10수학01-02]', '다항식의 나눗셈을 할 수 있다.', 'UNDERSTANDING', 2, 4, '["항등식","미정계수","수치대입"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-02-007', '조립제법 활용 (다항식의 값)', '조립제법을 이용하여 f(a)의 값을 효율적으로 계산', '조립제법', '수학', '다항식', '[10수학01-02]', '다항식의 나눗셈을 할 수 있다.', 'CALCULATION', 2, 3, '["조립제법","다항식의값","대입"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-03-005', '나머지정리 활용 (미정계수 결정)', '나머지정리로 다항식의 미정계수 결정', '나머지정리 적용 후 연립방정식', '수학', '다항식', '[10수학01-03]', '나머지정리의 의미를 이해하고, 이를 활용하여 문제를 해결할 수 있다.', 'INFERENCE', 3, 5, '["나머지정리","미정계수","연립방정식"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-03-006', '조립제법을 이용한 인수분해', '조립제법으로 고차다항식의 인수를 찾아 인수분해', '조립제법 + 인수정리', '수학', '다항식', '[10수학01-03]', '나머지정리의 의미를 이해하고, 이를 활용하여 문제를 해결할 수 있다.', 'CALCULATION', 2, 4, '["조립제법","인수정리","고차식"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-03-007', '나머지정리와 인수정리 종합', '나머지정리와 인수정리를 종합 활용하는 복합 문제', '나머지정리 + 인수정리 결합', '수학', '다항식', '[10수학01-03]', '나머지정리의 의미를 이해하고, 이를 활용하여 문제를 해결할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["나머지정리","인수정리","종합"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-03-008', '다항식의 나머지 (ax+b로 나눈 나머지)', 'f(x)를 ax+b로 나눈 나머지 구하기', 'f(-b/a) 계산', '수학', '다항식', '[10수학01-03]', '나머지정리의 의미를 이해하고, 이를 활용하여 문제를 해결할 수 있다.', 'CALCULATION', 2, 3, '["나머지","일차식으로나누기"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-04-005', '치환을 이용한 인수분해', '공통 부분을 하나의 문자로 치환하여 인수분해', '치환법', '수학', '다항식', '[10수학01-04]', '인수분해를 할 수 있다.', 'INFERENCE', 3, 4, '["치환","인수분해","공통부분"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-04-006', '복이차식의 인수분해', 'x⁴+ax²+b 꼴의 복이차식 인수분해', 'x²=t 치환 후 인수분해', '수학', '다항식', '[10수학01-04]', '인수분해를 할 수 있다.', 'CALCULATION', 3, 4, '["복이차식","치환","x⁴"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-04-007', '인수분해의 활용 (수의 계산)', '인수분해를 이용한 수의 계산 문제', '인수분해 후 수치 대입', '수학', '다항식', '[10수학01-04]', '인수분해를 할 수 있다.', 'PROBLEM_SOLVING', 2, 4, '["인수분해","수계산","활용"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-04-008', '인수분해의 활용 (식의 값)', '인수분해를 이용하여 복잡한 식의 값 구하기', '인수분해 후 조건 대입', '수학', '다항식', '[10수학01-04]', '인수분해를 할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["인수분해","식의값","활용"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-04-009', '인수분해의 활용 (도형)', '도형 문제에서 인수분해를 활용하여 넓이·길이 구하기', '식 세우기 + 인수분해', '수학', '다항식', '[10수학01-04]', '인수분해를 할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["인수분해","도형","넓이"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-05-005', '음수의 제곱근', '음수의 제곱근을 허수단위 i를 이용하여 표현', '√(-a) = i√a 변환', '수학', '방정식과 부등식', '[10수학01-05]', '복소수의 뜻과 성질을 이해하고, 복소수의 사칙연산을 할 수 있다.', 'UNDERSTANDING', 1, 3, '["음수","제곱근","허수","i"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-05-006', '복소수의 상등 활용 (연립)', '복소수의 상등조건을 이용한 연립방정식 풀이', '실수부·허수부 비교', '수학', '방정식과 부등식', '[10수학01-05]', '복소수의 뜻과 성질을 이해하고, 복소수의 사칙연산을 할 수 있다.', 'INFERENCE', 3, 4, '["복소수","상등","연립방정식"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-05-007', '복소수의 거듭제곱', '복소수의 거듭제곱 계산 (z^n)', 'i의 주기성 활용', '수학', '방정식과 부등식', '[10수학01-05]', '복소수의 뜻과 성질을 이해하고, 복소수의 사칙연산을 할 수 있다.', 'CALCULATION', 2, 4, '["복소수","거듭제곱","i주기"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-05-008', '복소수의 성질 종합 응용', '켤레복소수, i의 거듭제곱 등 성질을 종합 활용', '복소수 성질 종합', '수학', '방정식과 부등식', '[10수학01-05]', '복소수의 뜻과 성질을 이해하고, 복소수의 사칙연산을 할 수 있다.', 'PROBLEM_SOLVING', 4, 5, '["복소수","종합","응용"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-06-004', '이차방정식의 판별식', '판별식 D를 이용한 근의 존재 판별', 'D = b²-4ac 판별', '수학', '방정식과 부등식', '[10수학01-06]', '이차방정식을 풀 수 있다.', 'UNDERSTANDING', 2, 3, '["판별식","근","이차방정식"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-06-005', '판별식 활용 (미정계수)', '판별식 조건으로 미정계수의 범위 결정', 'D≥0, D=0, D<0 조건 활용', '수학', '방정식과 부등식', '[10수학01-06]', '이차방정식을 풀 수 있다.', 'INFERENCE', 3, 5, '["판별식","미정계수","범위"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-06-006', '이차방정식의 켤레근', '계수가 유리수/실수인 이차방정식의 켤레근 성질', '켤레근 정리', '수학', '방정식과 부등식', '[10수학01-06]', '이차방정식을 풀 수 있다.', 'UNDERSTANDING', 3, 4, '["켤레근","유리수계수","이차방정식"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-06-007', '이차방정식의 작성', '주어진 두 근으로 이차방정식 작성', '(x-α)(x-β)=0', '수학', '방정식과 부등식', '[10수학01-06]', '이차방정식을 풀 수 있다.', 'CALCULATION', 2, 3, '["이차방정식","작성","근"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-06-008', '이차방정식의 정수근 조건', '이차방정식이 정수근을 갖기 위한 조건', '판별식 + 근의공식 + 정수 조건', '수학', '방정식과 부등식', '[10수학01-06]', '이차방정식을 풀 수 있다.', 'PROBLEM_SOLVING', 4, 5, '["정수근","이차방정식","조건"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-07-005', '근과 계수의 관계 (두 근의 대칭식)', 'α+β, αβ를 이용한 대칭식 값 계산', '근과 계수의 관계 + 대칭식 변환', '수학', '방정식과 부등식', '[10수학01-07]', '이차방정식의 근과 계수의 관계를 이해한다.', 'CALCULATION', 2, 4, '["근과계수","대칭식","α+β"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-07-006', '두 근의 부호 판별', '이차방정식의 두 근이 양수/음수/이부호인 조건', '판별식, 근의합, 근의곱 부호 분석', '수학', '방정식과 부등식', '[10수학01-07]', '이차방정식의 근과 계수의 관계를 이해한다.', 'INFERENCE', 3, 5, '["근의부호","양근","음근"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-07-007', '새로운 이차방정식 작성', '주어진 이차방정식의 근으로부터 새 방정식 작성', '근과 계수의 관계 역이용', '수학', '방정식과 부등식', '[10수학01-07]', '이차방정식의 근과 계수의 관계를 이해한다.', 'PROBLEM_SOLVING', 3, 5, '["이차방정식작성","근과계수","역이용"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-07-008', '공통근 문제', '두 이차방정식의 공통근 구하기', '두 방정식의 차 → 공통근 대입', '수학', '방정식과 부등식', '[10수학01-07]', '이차방정식의 근과 계수의 관계를 이해한다.', 'PROBLEM_SOLVING', 4, 5, '["공통근","이차방정식","연립"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-08-004', '포물선과 직선의 위치 관계', '이차함수 그래프와 직선의 교점 개수 판별', '연립 후 판별식', '수학', '방정식과 부등식', '[10수학01-08]', '이차방정식과 이차함수의 관계를 이해한다.', 'UNDERSTANDING', 2, 4, '["포물선","직선","교점","판별식"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-08-005', '이차함수의 그래프와 x축 위치 관계', 'y=ax²+bx+c와 x축의 교점 관계 (D 조건)', '판별식과 그래프 해석', '수학', '방정식과 부등식', '[10수학01-08]', '이차방정식과 이차함수의 관계를 이해한다.', 'UNDERSTANDING', 2, 3, '["이차함수","x축","판별식","그래프"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-08-006', '근의 분리 (주어진 범위의 근)', '이차방정식의 근이 특정 범위에 존재하는 조건', '판별식+축+f(경계값) 조건', '수학', '방정식과 부등식', '[10수학01-08]', '이차방정식과 이차함수의 관계를 이해한다.', 'INFERENCE', 4, 5, '["근의분리","범위","이차함수"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-08-007', '이차함수의 그래프 해석', '이차함수 그래프의 계수(a,b,c) 부호와 관계 해석', '그래프 특성 분석', '수학', '방정식과 부등식', '[10수학01-08]', '이차방정식과 이차함수의 관계를 이해한다.', 'UNDERSTANDING', 3, 5, '["이차함수","그래프해석","계수부호"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-09-004', '제한된 범위에서 이차함수 최대·최소', '주어진 구간에서 이차함수의 최댓값·최솟값', '꼭짓점+구간 경계값 비교', '수학', '방정식과 부등식', '[10수학01-09]', '이차함수의 최대, 최소를 구할 수 있다.', 'INFERENCE', 3, 5, '["이차함수","최대최소","구간"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-09-005', '판별식을 이용한 최대·최소', '판별식 D≥0 조건을 이용한 식의 최대·최소', 'y=k 놓고 판별식 D≥0', '수학', '방정식과 부등식', '[10수학01-09]', '이차함수의 최대, 최소를 구할 수 있다.', 'INFERENCE', 4, 5, '["판별식","최대최소","범위"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-09-006', '이차식의 최대·최소 활용', '실생활 문제에서 이차함수의 최대·최소 활용', '식 세우기 + 꼭짓점 구하기', '수학', '방정식과 부등식', '[10수학01-09]', '이차함수의 최대, 최소를 구할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["이차함수","최대최소","활용","실생활"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-09-007', '조건부 최적화 (이차함수)', '조건식이 주어진 상태에서 이차함수의 최대·최소', '조건 대입 후 이차함수 변환', '수학', '방정식과 부등식', '[10수학01-09]', '이차함수의 최대, 최소를 구할 수 있다.', 'PROBLEM_SOLVING', 4, 5, '["조건부","최적화","이차함수"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-10-005', '삼차방정식의 근과 계수의 관계', '삼차방정식의 세 근의 합, 곱 등의 관계', '비에타 공식 (삼차)', '수학', '방정식과 부등식', '[10수학01-10]', '여러 가지 방정식을 풀 수 있다.', 'UNDERSTANDING', 3, 4, '["삼차방정식","근과계수","비에타"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-10-006', '치환을 이용한 고차방정식', '적절한 치환으로 고차방정식을 이차방정식으로 변환', 't 치환', '수학', '방정식과 부등식', '[10수학01-10]', '여러 가지 방정식을 풀 수 있다.', 'INFERENCE', 3, 5, '["치환","고차방정식","이차변환"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-10-007', '상반방정식', '계수가 대칭인 상반방정식 풀이', 'x+1/x = t 치환', '수학', '방정식과 부등식', '[10수학01-10]', '여러 가지 방정식을 풀 수 있다.', 'INFERENCE', 4, 5, '["상반방정식","대칭계수","치환"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-10-008', '연립이차방정식', '두 이차방정식의 연립 풀이', '대입법 또는 가감법', '수학', '방정식과 부등식', '[10수학01-10]', '여러 가지 방정식을 풀 수 있다.', 'CALCULATION', 3, 4, '["연립","이차방정식","대입법"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-10-009', '연립방정식의 활용', '실생활 문제를 연립방정식으로 모델링하여 해결', '식 세우기 + 연립 풀이', '수학', '방정식과 부등식', '[10수학01-10]', '여러 가지 방정식을 풀 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["연립방정식","활용","문장제"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-10-010', '부정방정식', '정수해를 갖는 부정방정식 풀이', '인수분해 + 정수 조건', '수학', '방정식과 부등식', '[10수학01-10]', '여러 가지 방정식을 풀 수 있다.', 'PROBLEM_SOLVING', 4, 5, '["부정방정식","정수해","인수분해"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-11-005', '연립일차부등식', '두 일차부등식의 연립 풀이 (해의 범위)', '각 부등식 풀이 후 교집합', '수학', '방정식과 부등식', '[10수학01-11]', '여러 가지 부등식을 풀 수 있다.', 'CALCULATION', 2, 3, '["연립부등식","일차","교집합"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-11-006', '연립이차부등식', '이차부등식이 포함된 연립부등식 풀이', '각 부등식 풀이 후 교집합', '수학', '방정식과 부등식', '[10수학01-11]', '여러 가지 부등식을 풀 수 있다.', 'CALCULATION', 3, 4, '["연립부등식","이차","교집합"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-11-007', '이차부등식이 항상 성립할 조건', 'ax²+bx+c>0이 모든 실수에서 성립할 조건', 'a>0이고 D<0', '수학', '방정식과 부등식', '[10수학01-11]', '여러 가지 부등식을 풀 수 있다.', 'INFERENCE', 3, 5, '["항상성립","이차부등식","판별식"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-11-008', '부등식의 활용 (문장제)', '부등식을 세워 실생활 문제 해결', '부등식 모델링 + 풀이', '수학', '방정식과 부등식', '[10수학01-11]', '여러 가지 부등식을 풀 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["부등식","활용","문장제"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-12-004', '절대값을 포함한 방정식', '|f(x)| = g(x) 형태의 방정식 풀이', '경우 나누기 (f(x)≥0, f(x)<0)', '수학', '방정식과 부등식', '[10수학01-12]', '절대값을 포함한 부등식을 풀 수 있다.', 'CALCULATION', 2, 4, '["절대값","방정식","경우나누기"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-12-005', '이중 절대값 부등식', '||x-a|-b|<c 등 이중 절대값이 포함된 부등식', '단계별 절대값 해제', '수학', '방정식과 부등식', '[10수학01-12]', '절대값을 포함한 부등식을 풀 수 있다.', 'INFERENCE', 4, 5, '["이중절대값","부등식","단계별"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-EQU-12-006', '절대값과 그래프', '절대값 함수의 그래프를 이용한 부등식/방정식 해석', '그래프 그리기 + 교점 분석', '수학', '방정식과 부등식', '[10수학01-12]', '절대값을 포함한 부등식을 풀 수 있다.', 'UNDERSTANDING', 3, 5, '["절대값","그래프","해석"]'::jsonb, '고등학교', 'HS0', 'EQU', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-01-004', '유한집합의 원소의 개수', '합집합의 원소 개수 공식 n(A∪B) = n(A)+n(B)-n(A∩B)', '포함-배제 원리', '수학', '집합과 명제', '[10수학03-01]', '집합의 뜻을 알고, 집합을 표현할 수 있다.', 'CALCULATION', 2, 4, '["유한집합","원소개수","포함배제"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-01-005', '세 집합의 원소 개수', 'n(A∪B∪C) 포함-배제 원리', '세 집합 포함-배제 공식', '수학', '집합과 명제', '[10수학03-01]', '집합의 뜻을 알고, 집합을 표현할 수 있다.', 'CALCULATION', 3, 5, '["세집합","포함배제","원소개수"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-01-006', '집합의 원소 나열과 조건', '조건제시법으로 표현된 집합의 원소 구하기', '조건 해석 후 원소 나열', '수학', '집합과 명제', '[10수학03-01]', '집합의 뜻을 알고, 집합을 표현할 수 있다.', 'UNDERSTANDING', 1, 3, '["조건제시법","원소나열","집합"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-01-007', '부분집합의 개수와 조건', '특정 원소를 포함/제외하는 부분집합의 개수', '2^n 공식 활용 (조건부)', '수학', '집합과 명제', '[10수학03-01]', '집합의 뜻을 알고, 집합을 표현할 수 있다.', 'INFERENCE', 2, 4, '["부분집합","개수","조건"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-02-004', '집합의 연산 법칙', '교환법칙, 결합법칙, 분배법칙, 드모르간 법칙', '집합 연산 법칙 적용', '수학', '집합과 명제', '[10수학03-02]', '집합의 연산을 할 수 있다.', 'UNDERSTANDING', 2, 3, '["교환법칙","분배법칙","드모르간"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-02-005', '벤 다이어그램 해석', '벤 다이어그램을 이용한 집합 관계 파악', '벤 다이어그램 영역 분석', '수학', '집합과 명제', '[10수학03-02]', '집합의 연산을 할 수 있다.', 'UNDERSTANDING', 1, 3, '["벤다이어그램","집합","영역"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-02-006', '집합의 연산 응용 (미지 집합)', 'A∩X=B, A∪X=C 등 조건을 만족하는 집합 X 구하기', '벤 다이어그램 + 조건 분석', '수학', '집합과 명제', '[10수학03-02]', '집합의 연산을 할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["미지집합","조건","집합연산"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-02-007', '집합과 원소 개수 활용', '집합의 원소 개수 조건을 이용한 문장제 풀이', '포함-배제 + 문장제 해석', '수학', '집합과 명제', '[10수학03-02]', '집합의 연산을 할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["집합","원소개수","활용","문장제"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-03-004', '명제의 역·이·대우', '주어진 명제의 역, 이, 대우 작성 및 참·거짓 판별', '가정과 결론 교환/부정', '수학', '집합과 명제', '[10수학03-03]', '명제의 뜻을 알고, 참·거짓을 판별할 수 있다.', 'UNDERSTANDING', 2, 3, '["역","이","대우","명제"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-03-005', '조건과 진리집합', '조건의 진리집합을 구하고 포함 관계로 명제 판별', '진리집합 구하기 + 포함관계', '수학', '집합과 명제', '[10수학03-03]', '명제의 뜻을 알고, 참·거짓을 판별할 수 있다.', 'UNDERSTANDING', 2, 4, '["조건","진리집합","포함관계"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-03-006', '명제의 참·거짓 종합', '여러 명제의 참·거짓 동시 판별 (반례 찾기 포함)', '반례 또는 증명', '수학', '집합과 명제', '[10수학03-03]', '명제의 뜻을 알고, 참·거짓을 판별할 수 있다.', 'INFERENCE', 3, 5, '["명제","참거짓","반례"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-04-004', '필요·충분조건과 미정계수', '필요·충분조건이 되기 위한 미정계수의 범위', '진리집합의 포함관계 + 미정계수', '수학', '집합과 명제', '[10수학03-04]', '필요조건과 충분조건을 구분할 수 있다.', 'INFERENCE', 3, 5, '["필요조건","충분조건","미정계수"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-04-005', '필요·충분·필요충분조건 종합', '여러 명제 사이의 필요·충분 관계 종합 판별', '진리집합 + 논리적 관계 분석', '수학', '집합과 명제', '[10수학03-04]', '필요조건과 충분조건을 구분할 수 있다.', 'INFERENCE', 3, 5, '["필요조건","충분조건","필요충분","종합"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-04-006', '필요·충분조건 응용 (부등식·방정식)', '방정식/부등식 조건의 필요·충분 관계 판별', '해집합 비교', '수학', '집합과 명제', '[10수학03-04]', '필요조건과 충분조건을 구분할 수 있다.', 'PROBLEM_SOLVING', 4, 5, '["필요충분","방정식","부등식","해집합"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-05-004', '대우를 이용한 증명', '명제 p→q의 대우 ~q→~p를 증명', '대우 증명법', '수학', '집합과 명제', '[10수학03-05]', '대우를 이용하여 명제를 증명할 수 있다.', 'INFERENCE', 3, 5, '["대우증명","간접증명"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-05-005', '귀류법', '결론의 부정을 가정하여 모순 도출', '귀류법', '수학', '집합과 명제', '[10수학03-05]', '대우를 이용하여 명제를 증명할 수 있다.', 'INFERENCE', 3, 5, '["귀류법","모순","간접증명"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-05-006', '직접 증명법', '가정에서 출발하여 결론을 직접 도출', '직접증명', '수학', '집합과 명제', '[10수학03-05]', '대우를 이용하여 명제를 증명할 수 있다.', 'INFERENCE', 2, 4, '["직접증명","연역법"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-06-004', '산술-기하 평균 부등식', '(a+b)/2 ≥ √(ab) 활용 (등호 조건 포함)', 'AM-GM 부등식', '수학', '집합과 명제', '[10수학03-06]', '절대부등식의 의미를 이해한다.', 'UNDERSTANDING', 3, 4, '["산술기하평균","AM-GM","등호조건"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-06-005', '코시-슈바르츠 부등식', '(a²+b²)(c²+d²) ≥ (ac+bd)² 활용', 'Cauchy-Schwarz 부등식', '수학', '집합과 명제', '[10수학03-06]', '절대부등식의 의미를 이해한다.', 'INFERENCE', 4, 5, '["코시슈바르츠","부등식","증명"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-06-006', '절대부등식의 증명 (다양한 방법)', '완전제곱식, 부등식의 성질 등을 이용한 증명', '완전제곱식 ≥ 0 활용', '수학', '집합과 명제', '[10수학03-06]', '절대부등식의 의미를 이해한다.', 'INFERENCE', 3, 5, '["절대부등식","증명","완전제곱"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-07-002', '절대부등식과 최대·최소', '절대부등식을 이용한 최대·최소 구하기', '등호 조건 활용', '수학', '집합과 명제', '[10수학03-07]', '절대부등식의 의미를 이해한다.', 'PROBLEM_SOLVING', 3, 5, '["절대부등식","최대최소","등호조건"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-07-003', '절대부등식 활용 (실생활)', '절대부등식을 실생활 최적화 문제에 활용', '부등식 모델링 + 등호조건', '수학', '집합과 명제', '[10수학03-07]', '절대부등식의 의미를 이해한다.', 'PROBLEM_SOLVING', 4, 5, '["절대부등식","활용","최적화"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-08-003', '절대부등식 증명 (변형)', '주어진 조건하에서 부등식 증명 (조건부 증명)', '조건 활용 + 부등식 변형', '수학', '집합과 명제', '[10수학03-08]', '절대부등식을 증명할 수 있다.', 'INFERENCE', 4, 5, '["조건부증명","부등식변형"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-SET-08-004', '여러 변수의 부등식 증명', '3개 이상 변수에 대한 부등식 증명', '대칭성 + 부등식 기법', '수학', '집합과 명제', '[10수학03-08]', '절대부등식을 증명할 수 있다.', 'PROBLEM_SOLVING', 4, 5, '["다변수","부등식증명","대칭"]'::jsonb, '고등학교', 'HS0', 'SET', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-01-004', '함수의 개수 (경우의 수)', '유한집합 사이의 함수의 개수 구하기', '곱의 법칙', '수학', '함수', '[10수학04-01]', '함수의 뜻을 알고, 그 그래프를 이해한다.', 'CALCULATION', 2, 4, '["함수개수","곱의법칙","유한집합"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-01-005', '일대일함수·일대일대응의 개수', '일대일함수, 일대일대응의 개수 구하기', '순열 공식', '수학', '함수', '[10수학04-01]', '함수의 뜻을 알고, 그 그래프를 이해한다.', 'CALCULATION', 3, 4, '["일대일함수","일대일대응","개수"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-01-006', '항등함수와 상수함수', '항등함수, 상수함수의 정의와 성질', '정의 적용', '수학', '함수', '[10수학04-01]', '함수의 뜻을 알고, 그 그래프를 이해한다.', 'UNDERSTANDING', 1, 2, '["항등함수","상수함수"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-01-007', '함수의 정의역·공역·치역', '주어진 함수의 정의역, 공역, 치역 구하기', '정의 적용', '수학', '함수', '[10수학04-01]', '함수의 뜻을 알고, 그 그래프를 이해한다.', 'UNDERSTANDING', 1, 3, '["정의역","공역","치역"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-02-004', '합성함수의 성질', '합성함수의 결합법칙, 항등함수와의 합성 등', '합성함수 성질 적용', '수학', '함수', '[10수학04-02]', '합성함수와 역함수의 의미를 이해한다.', 'UNDERSTANDING', 2, 3, '["합성함수","결합법칙","성질"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-02-005', '역함수의 그래프', '역함수의 그래프가 y=x에 대칭임을 이용', 'y=x 대칭 변환', '수학', '함수', '[10수학04-02]', '합성함수와 역함수의 의미를 이해한다.', 'UNDERSTANDING', 2, 3, '["역함수","그래프","y=x대칭"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-02-006', '합성함수·역함수 종합', 'f∘g의 역함수, (f∘g)⁻¹ = g⁻¹∘f⁻¹ 등 종합 활용', '합성+역함수 성질 결합', '수학', '함수', '[10수학04-02]', '합성함수와 역함수의 의미를 이해한다.', 'PROBLEM_SOLVING', 3, 5, '["합성함수","역함수","종합"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-02-007', '합성함수의 미지함수 결정', 'f∘g = h일 때 f 또는 g 구하기', '역함수 이용 또는 대입법', '수학', '함수', '[10수학04-02]', '합성함수와 역함수의 의미를 이해한다.', 'INFERENCE', 3, 5, '["합성함수","미지함수","결정"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-03-004', '유리식의 사칙연산', '유리식의 덧셈·뺄셈·곱셈·나눗셈', '통분 후 계산', '수학', '함수', '[10수학04-03]', '유리식과 유리함수를 이해한다.', 'CALCULATION', 2, 3, '["유리식","사칙연산","통분"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-03-005', '유리식의 조건 (정의 불가)', '유리식이 정의되지 않는 조건 (분모=0)', '분모≠0 조건 분석', '수학', '함수', '[10수학04-03]', '유리식과 유리함수를 이해한다.', 'UNDERSTANDING', 1, 2, '["유리식","정의역","분모"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-03-006', '번분수식의 계산', '분수식 안에 분수가 있는 복잡한 유리식 정리', '역수 변환 + 통분', '수학', '함수', '[10수학04-03]', '유리식과 유리함수를 이해한다.', 'CALCULATION', 2, 4, '["번분수식","복잡한유리식","정리"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-04-004', '유리함수의 평행이동·대칭이동', 'y=a/(x-p)+q 형태의 그래프 이동', '표준형 변환 + 이동', '수학', '함수', '[10수학04-04]', '유리함수의 그래프를 그릴 수 있다.', 'UNDERSTANDING', 2, 3, '["유리함수","평행이동","점근선"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-04-005', '유리함수와 직선의 교점', '유리함수 그래프와 직선의 교점 구하기', '연립방정식', '수학', '함수', '[10수학04-04]', '유리함수의 그래프를 그릴 수 있다.', 'CALCULATION', 3, 4, '["유리함수","교점","직선"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-04-006', '유리함수 활용 (역수 관계)', '유리함수를 이용한 실생활 모델링', '유리함수 모델링', '수학', '함수', '[10수학04-04]', '유리함수의 그래프를 그릴 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["유리함수","활용","모델링"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-05-004', '무리식의 계산', '분모의 유리화, 이중근호 등 무리식 정리', '유리화 + 이중근호 풀기', '수학', '함수', '[10수학04-05]', '무리함수의 그래프를 그릴 수 있다.', 'CALCULATION', 2, 4, '["무리식","유리화","이중근호"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-05-005', '무리함수의 정의역과 치역', '무리함수의 정의역(근호 안 ≥0)과 치역 구하기', '부등식 풀이', '수학', '함수', '[10수학04-05]', '무리함수의 그래프를 그릴 수 있다.', 'UNDERSTANDING', 2, 3, '["무리함수","정의역","치역"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-FUN-05-006', '무리함수와 직선의 교점', '무리함수 그래프와 직선의 교점 (무연근 확인)', '연립 + 양변 제곱 + 검증', '수학', '함수', '[10수학04-05]', '무리함수의 그래프를 그릴 수 있다.', 'INFERENCE', 3, 5, '["무리함수","교점","무연근"]'::jsonb, '고등학교', 'HS0', 'FUN', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-01-004', '좌표평면 위의 도형의 넓이', '좌표를 이용한 삼각형·사각형의 넓이 구하기', '꼭짓점 좌표 활용 (신발끈 공식)', '수학', '도형의 방정식', '[10수학02-01]', '두 점 사이의 거리를 구할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["좌표","넓이","삼각형","신발끈"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-01-005', '거리 조건을 만족하는 도형', '특정 거리 조건을 만족하는 점의 자취', '거리 공식 + 자취 방정식', '수학', '도형의 방정식', '[10수학02-01]', '두 점 사이의 거리를 구할 수 있다.', 'INFERENCE', 3, 5, '["거리조건","자취","방정식"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-02-004', '무게중심 좌표', '삼각형의 무게중심 좌표 구하기', '((x₁+x₂+x₃)/3, (y₁+y₂+y₃)/3)', '수학', '도형의 방정식', '[10수학02-02]', '선분의 내분점과 외분점의 좌표를 구할 수 있다.', 'CALCULATION', 2, 3, '["무게중심","삼각형","좌표"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-02-005', '내분점·외분점 활용', '내분점·외분점을 이용한 도형 문제', '내분·외분 공식 활용', '수학', '도형의 방정식', '[10수학02-02]', '선분의 내분점과 외분점의 좌표를 구할 수 있다.', 'PROBLEM_SOLVING', 3, 4, '["내분점","외분점","활용"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-02-006', '좌표를 이용한 도형의 성질 증명', '좌표 설정 후 도형의 기하학적 성질 증명', '좌표 설정 + 공식 적용', '수학', '도형의 방정식', '[10수학02-02]', '선분의 내분점과 외분점의 좌표를 구할 수 있다.', 'INFERENCE', 4, 5, '["좌표기하","증명","도형성질"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-03-004', '두 점을 지나는 직선의 방정식', '두 점이 주어졌을 때 직선의 방정식 구하기', '기울기 계산 + 점-기울기 형', '수학', '도형의 방정식', '[10수학02-03]', '직선의 방정식을 구할 수 있다.', 'CALCULATION', 1, 2, '["직선","두점","기울기"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-03-005', 'x절편·y절편 형태의 직선', 'x/a + y/b = 1 형태의 직선 방정식', '절편형 활용', '수학', '도형의 방정식', '[10수학02-03]', '직선의 방정식을 구할 수 있다.', 'UNDERSTANDING', 2, 3, '["절편형","직선","x절편","y절편"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-03-006', '직선의 방정식 활용 (도형)', '직선을 이용한 삼각형·사각형 넓이 구하기', '교점 + 넓이 공식', '수학', '도형의 방정식', '[10수학02-03]', '직선의 방정식을 구할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["직선","넓이","도형활용"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-04-004', '두 직선의 교점을 지나는 직선', 'l₁ + kl₂ = 0 형태로 교점을 지나는 직선의 방정식', '직선 묶음 활용', '수학', '도형의 방정식', '[10수학02-04]', '두 직선의 위치 관계를 이해한다.', 'INFERENCE', 3, 4, '["교점","직선묶음","위치관계"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-04-005', '세 직선의 위치 관계', '세 직선이 한 점에서 만날 조건, 삼각형을 이루는 조건', '교점 일치 조건 분석', '수학', '도형의 방정식', '[10수학02-04]', '두 직선의 위치 관계를 이해한다.', 'INFERENCE', 3, 5, '["세직선","한점","삼각형"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-04-006', '정사영과 대칭점', '직선에 대한 점의 대칭점, 정사영 구하기', '수선의 발 + 대칭점 공식', '수학', '도형의 방정식', '[10수학02-04]', '두 직선의 위치 관계를 이해한다.', 'PROBLEM_SOLVING', 3, 5, '["대칭점","정사영","수선의발"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-05-004', '평행한 두 직선 사이의 거리', '평행한 두 직선 사이의 거리 구하기', '한 직선 위의 점 → 다른 직선까지 거리', '수학', '도형의 방정식', '[10수학02-05]', '점과 직선 사이의 거리를 구할 수 있다.', 'CALCULATION', 2, 3, '["평행직선","거리","공식"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-05-005', '점과 직선 거리의 활용 (최단거리)', '점-직선 거리를 이용한 최단거리 문제', '대칭점 활용 + 삼각부등식', '수학', '도형의 방정식', '[10수학02-05]', '점과 직선 사이의 거리를 구할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["최단거리","대칭점","점과직선"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-05-006', '직선과 넓이 조건', '넓이가 주어진 삼각형의 꼭짓점/직선 구하기', '점-직선 거리 = 높이', '수학', '도형의 방정식', '[10수학02-05]', '점과 직선 사이의 거리를 구할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["넓이","삼각형","높이","거리"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-06-004', '원의 방정식 (일반형 → 표준형)', 'x²+y²+Ax+By+C=0을 표준형으로 변환', '완전제곱식 변환', '수학', '도형의 방정식', '[10수학02-06]', '원의 방정식을 구할 수 있다.', 'CALCULATION', 2, 3, '["원","일반형","표준형","완전제곱"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-06-005', '세 점을 지나는 원', '세 점이 주어졌을 때 원의 방정식 결정', '일반형에 대입 → 연립방정식', '수학', '도형의 방정식', '[10수학02-06]', '원의 방정식을 구할 수 있다.', 'INFERENCE', 3, 4, '["세점","원","연립방정식"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-06-006', '원의 방정식 조건 문제', '중심, 반지름 등 조건이 주어진 원의 방정식', '조건 해석 + 표준형', '수학', '도형의 방정식', '[10수학02-06]', '원의 방정식을 구할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["원","조건","방정식결정"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-06-007', '직선 위의 중심을 가진 원', '중심이 특정 직선 위에 있는 원의 방정식', '중심 좌표 매개변수화', '수학', '도형의 방정식', '[10수학02-06]', '원의 방정식을 구할 수 있다.', 'INFERENCE', 3, 4, '["원","중심","직선위"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-07-005', '원의 접선의 방정식 (기울기)', '기울기가 주어진 원의 접선 구하기', 'D=0 조건 또는 공식', '수학', '도형의 방정식', '[10수학02-07]', '원과 직선의 위치 관계를 이해한다.', 'CALCULATION', 3, 4, '["접선","기울기","원"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-07-006', '원 위의 점에서의 접선', '원 위의 점 (x₁,y₁)에서의 접선 방정식', 'xx₁+yy₁=r² 공식', '수학', '도형의 방정식', '[10수학02-07]', '원과 직선의 위치 관계를 이해한다.', 'CALCULATION', 2, 3, '["접선","원위의점","공식"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-07-007', '원 밖의 점에서의 접선', '원 밖의 점에서 원에 그은 접선 구하기', '접점 좌표 설정 + 수직조건', '수학', '도형의 방정식', '[10수학02-07]', '원과 직선의 위치 관계를 이해한다.', 'INFERENCE', 3, 5, '["접선","원밖의점","수직"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-07-008', '원과 직선의 현의 길이', '원과 직선이 만들어내는 현의 길이 구하기', '중심-직선 거리 + 피타고라스', '수학', '도형의 방정식', '[10수학02-07]', '원과 직선의 위치 관계를 이해한다.', 'CALCULATION', 2, 4, '["현의길이","원","직선","피타고라스"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-08-004', '두 원의 교점을 지나는 원/직선', '두 원의 교점을 지나는 원 또는 직선의 방정식', 'C₁+kC₂=0 형태', '수학', '도형의 방정식', '[10수학02-08]', '두 원의 위치 관계를 이해한다.', 'INFERENCE', 3, 5, '["두원","교점","공통현"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-08-005', '두 원의 공통접선', '두 원의 공통외접선, 공통내접선 구하기', '접선 조건 + 거리 관계', '수학', '도형의 방정식', '[10수학02-08]', '두 원의 위치 관계를 이해한다.', 'PROBLEM_SOLVING', 4, 5, '["공통접선","외접선","내접선"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-08-006', '두 원의 위치 관계와 미정계수', '두 원이 특정 위치 관계를 가지기 위한 조건', '중심거리와 반지름의 관계', '수학', '도형의 방정식', '[10수학02-08]', '두 원의 위치 관계를 이해한다.', 'INFERENCE', 3, 5, '["두원","위치관계","미정계수"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-09-004', 'x축 대칭이동', '도형·방정식의 x축 대칭이동 (y→-y)', 'y를 -y로 치환', '수학', '도형의 방정식', '[10수학02-09]', '도형의 이동을 이해한다.', 'CALCULATION', 1, 2, '["x축대칭","대칭이동"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-09-005', 'y축 대칭이동', '도형·방정식의 y축 대칭이동 (x→-x)', 'x를 -x로 치환', '수학', '도형의 방정식', '[10수학02-09]', '도형의 이동을 이해한다.', 'CALCULATION', 1, 2, '["y축대칭","대칭이동"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-09-006', '원점 대칭이동', '도형·방정식의 원점 대칭이동 (x→-x, y→-y)', '(x,y)→(-x,-y)', '수학', '도형의 방정식', '[10수학02-09]', '도형의 이동을 이해한다.', 'CALCULATION', 1, 2, '["원점대칭","대칭이동"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CRD-09-007', '복합 이동 (평행+대칭)', '평행이동과 대칭이동을 연속으로 적용', '순서대로 변환 적용', '수학', '도형의 방정식', '[10수학02-09]', '도형의 이동을 이해한다.', 'INFERENCE', 3, 5, '["복합이동","평행이동","대칭이동"]'::jsonb, '고등학교', 'HS0', 'CRD', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CNT-01-004', '합의 법칙', '합의 법칙을 이용한 경우의 수 구하기', '동시에 일어나지 않는 사건의 합', '수학', '경우의 수', '[10수학05-01]', '경우의 수를 구할 수 있다.', 'UNDERSTANDING', 1, 2, '["합의법칙","경우의수"]'::jsonb, '고등학교', 'HS0', 'CNT', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CNT-01-005', '곱의 법칙', '곱의 법칙을 이용한 경우의 수 구하기', '동시에 일어나는 사건의 곱', '수학', '경우의 수', '[10수학05-01]', '경우의 수를 구할 수 있다.', 'UNDERSTANDING', 1, 3, '["곱의법칙","경우의수"]'::jsonb, '고등학교', 'HS0', 'CNT', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CNT-01-006', '경우의 수 활용 (수 만들기)', '조건을 만족하는 수(자연수, 짝수 등) 만들기', '자릿수별 경우의 수', '수학', '경우의 수', '[10수학05-01]', '경우의 수를 구할 수 있다.', 'PROBLEM_SOLVING', 2, 4, '["수만들기","자릿수","경우의수"]'::jsonb, '고등학교', 'HS0', 'CNT', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CNT-02-004', '중복순열', 'n개에서 r개를 중복 허용하여 뽑는 순열', 'nΠr = n^r', '수학', '경우의 수', '[10수학05-02]', '순열의 수를 구할 수 있다.', 'CALCULATION', 2, 3, '["중복순열","경우의수"]'::jsonb, '고등학교', 'HS0', 'CNT', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CNT-02-005', '같은 것이 있는 순열', '같은 것이 포함된 n개의 배열 수', 'n!/(p!q!...)', '수학', '경우의 수', '[10수학05-02]', '순열의 수를 구할 수 있다.', 'CALCULATION', 2, 4, '["같은것순열","중복","배열"]'::jsonb, '고등학교', 'HS0', 'CNT', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CNT-02-006', '원순열', '원형으로 배열하는 순열의 수', '(n-1)!', '수학', '경우의 수', '[10수학05-02]', '순열의 수를 구할 수 있다.', 'UNDERSTANDING', 2, 4, '["원순열","원형배열"]'::jsonb, '고등학교', 'HS0', 'CNT', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CNT-02-007', '순열 활용 (자리 배치)', '조건이 있는 자리 배치 문제', '조건 우선 배치 후 나머지', '수학', '경우의 수', '[10수학05-02]', '순열의 수를 구할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["자리배치","조건","순열"]'::jsonb, '고등학교', 'HS0', 'CNT', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CNT-03-004', '조합의 성질 활용', 'nCr = nC(n-r), nCr = n-1Cr-1 + n-1Cr 등 성질', '조합 공식 성질', '수학', '경우의 수', '[10수학05-03]', '조합의 수를 구할 수 있다.', 'UNDERSTANDING', 2, 3, '["조합","성질","공식"]'::jsonb, '고등학교', 'HS0', 'CNT', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CNT-03-005', '조합 활용 (분류·선택)', '그룹 선택, 대표 선출 등 조합 활용 문제', '조건별 조합 계산', '수학', '경우의 수', '[10수학05-03]', '조합의 수를 구할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["조합","선택","분류"]'::jsonb, '고등학교', 'HS0', 'CNT', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CNT-03-006', '중복조합', '서로 다른 n종류에서 r개를 중복 허용하여 선택', 'nHr = n+r-1Cr', '수학', '경우의 수', '[10수학05-03]', '조합의 수를 구할 수 있다.', 'CALCULATION', 3, 4, '["중복조합","선택"]'::jsonb, '고등학교', 'HS0', 'CNT', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-CNT-03-007', '조합 활용 (도형·최단 경로)', '격자점 최단 경로, 직선 교점 등 도형+조합', '경로 = nCr (이동 조합)', '수학', '경우의 수', '[10수학05-03]', '조합의 수를 구할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["최단경로","격자","도형","조합"]'::jsonb, '고등학교', 'HS0', 'CNT', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-15-004', '부등식의 영역 (연립)', '연립부등식이 나타내는 영역 구하기', '각 부등식 영역의 교집합', '수학', '다항식', '[10수학01-15]', '부등식의 영역을 이해한다.', 'UNDERSTANDING', 2, 4, '["부등식영역","연립","교집합"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-15-005', '부등식 영역에서의 최대·최소', 'ax+by의 최대·최소를 부등식 영역에서 구하기', '선형계획법 (꼭짓점 검사)', '수학', '다항식', '[10수학01-15]', '부등식의 영역을 이해한다.', 'PROBLEM_SOLVING', 3, 5, '["선형계획법","최대최소","부등식영역"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-15-006', '원과 부등식의 영역', '원의 부등식 (x-a)²+(y-b)²≤r²의 영역', '원 내부/외부 판별', '수학', '다항식', '[10수학01-15]', '부등식의 영역을 이해한다.', 'UNDERSTANDING', 2, 4, '["원","부등식영역","내부외부"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-16-002', '부등식 영역 활용 (실생활)', '실생활 문제를 부등식 영역으로 모델링', '변수 설정 + 부등식 + 영역', '수학', '다항식', '[10수학01-16]', '부등식의 영역을 활용하여 문제를 해결할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["부등식영역","실생활","모델링"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();

INSERT INTO expanded_math_types (type_code, type_name, description, solution_method, subject, area, standard_code, standard_content, cognitive, difficulty_min, difficulty_max, keywords, school_level, level_code, domain_code, is_active)
VALUES ('MA-HS0-POL-16-003', '부등식 영역과 정수해', '부등식 영역 내 격자점(정수해)의 개수', '영역 그리기 + 격자점 세기', '수학', '다항식', '[10수학01-16]', '부등식의 영역을 활용하여 문제를 해결할 수 있다.', 'PROBLEM_SOLVING', 3, 5, '["정수해","격자점","부등식영역"]'::jsonb, '고등학교', 'HS0', 'POL', true)
ON CONFLICT (type_code) DO UPDATE SET type_name=EXCLUDED.type_name, description=EXCLUDED.description, solution_method=EXCLUDED.solution_method, cognitive=EXCLUDED.cognitive, difficulty_min=EXCLUDED.difficulty_min, difficulty_max=EXCLUDED.difficulty_max, keywords=EXCLUDED.keywords, updated_at=NOW();
