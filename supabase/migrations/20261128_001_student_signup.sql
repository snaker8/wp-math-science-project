-- 학생 QR 가입 (2026-11-28 대표 「QR 을 찍으면 가입 안 된 학생은 가입 창부터 — 매쓰홀릭과 같게」)
--   · institutes.student_id_prefix — 학생 아이디 접두어. 있으면 아이디 = 접두어+이름 (동부산과사람 = EDG).
--     없으면 학생 휴대폰 번호가 아이디 (엄궁차수학 — 대표 「전화번호 그대로」).
--   · users.parent_phone — 가입 때 받는 학부모 전화번호 (리포트·알림 발송용)
-- 더하기만 한다. 기존 행·열은 바꾸지 않는다.

ALTER TABLE public.institutes ADD COLUMN IF NOT EXISTS student_id_prefix text;
COMMENT ON COLUMN public.institutes.student_id_prefix IS
  '학생 아이디 접두어 (예: EDG). 있으면 QR 가입 아이디 = 접두어+이름, 없으면 학생 휴대폰 번호';

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS parent_phone text;
COMMENT ON COLUMN public.users.parent_phone IS '학부모 전화번호 (숫자만). 학생 QR 가입 때 입력';

UPDATE public.institutes i
   SET student_id_prefix = 'EDG'
  FROM public.organizations o
 WHERE o.id = i.organization_id AND o.name = '과사람' AND i.name = '동부산'
   AND i.student_id_prefix IS NULL;
