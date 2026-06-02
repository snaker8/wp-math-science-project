// ============================================================================
// 업로드된 시험지 → book_groups 폴더 자동 매칭
// 폴더 이름에 과목 키워드(중2, 수1, 공통수학1 등)가 포함되면 그 폴더로 배치
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

interface SubjectRule {
  match: (subject: string) => boolean;
  /** 폴더 이름에 포함될 가능성이 있는 키워드들 (우선순위 순). '중1' 같은 짧은 키워드는 '중10' 같은 오매칭을 주의 */
  keywords: string[];
}

const SUBJECT_KEYWORD_RULES: SubjectRule[] = [
  // 고등
  { match: (s) => /공통수학1/.test(s),            keywords: ['공통수학1', '공수1', '공통1'] },
  { match: (s) => /공통수학2/.test(s),            keywords: ['공통수학2', '공수2', '공통2'] },
  { match: (s) => /수학I|수1/.test(s),            keywords: ['수1', '수학I', '수학1'] },
  { match: (s) => /수학II|수2/.test(s),           keywords: ['수2', '수학II', '수학2'] },
  { match: (s) => /대수/.test(s),                 keywords: ['대수'] },
  { match: (s) => /미적분1/.test(s),              keywords: ['미적분1'] },
  { match: (s) => /미적분2|^미적분$/.test(s),     keywords: ['미적분2', '미적분'] },
  { match: (s) => /확률.*통계|확통/.test(s),      keywords: ['확통', '확률과통계', '확률'] },
  { match: (s) => /기하/.test(s),                 keywords: ['기하'] },
  { match: (s) => /수학\(상\)/.test(s),           keywords: ['수학(상)', '수상'] },
  { match: (s) => /수학\(하\)/.test(s),           keywords: ['수학(하)', '수하'] },
  // 중학 — 3이 1/2보다 뒤에 있어야 '중13'이 '중1'에 잘못 걸리지 않음 (실제론 '중1/2/3' 배타적)
  { match: (s) => /중1/.test(s),                  keywords: ['중1'] },
  { match: (s) => /중2/.test(s),                  keywords: ['중2'] },
  { match: (s) => /중3/.test(s),                  keywords: ['중3'] },
  // 과학
  { match: (s) => /공통과학1/.test(s),            keywords: ['공통과학1', '공과1'] },
  { match: (s) => /공통과학2/.test(s),            keywords: ['공통과학2', '공과2'] },
  { match: (s) => /물리/.test(s),                 keywords: ['물리'] },
  { match: (s) => /화학/.test(s),                 keywords: ['화학'] },
  { match: (s) => /생명과학|생물/.test(s),        keywords: ['생명', '생물'] },
  { match: (s) => /지구과학/.test(s),             keywords: ['지구'] },
];

/**
 * 학교 기출 단원집 → 학교명 기반 book_groups 폴더 찾기/생성 (2026-05-29).
 *
 * 클라우드 페이지 좌측 트리에 "동래중 (중2-1)" 같은 학교별 폴더를 만들어,
 * 같은 학교 여러 단원집(수와 식·부등식·함수)을 한 폴더로 모은다.
 * 폴더명: "{학교} ({학년}-{학기})" → 학년/학기 없으면 축약. 학기만 없으면 "{학교} ({학년})".
 *
 * @returns book_group_id or null
 */
export async function findOrCreateSchoolFolder(
  supabase: SupabaseClient,
  schoolName: string,
  grade: string | null,
  semester: number | null,
  instituteId: string | null,
  createdBy: string | null,
): Promise<string | null> {
  if (!schoolName) return null;

  // 폴더명 구성 — "동래중 (중2-1)" / "동래중 (중2)" / "동래중"
  let suffix = '';
  if (grade && semester) suffix = ` (${grade}-${semester})`;
  else if (grade) suffix = ` (${grade})`;
  const folderName = `${schoolName}${suffix}`;

  // 1) 기존 폴더 찾기 (institute 범위 일치)
  let findQ = supabase
    .from('book_groups')
    .select('id')
    .eq('name', folderName)
    .is('deleted_at', null);
  findQ = instituteId ? findQ.eq('institute_id', instituteId) : findQ.is('institute_id', null);
  const { data: found } = await findQ.limit(1);
  if (found && found.length > 0) return (found[0] as { id: string }).id;

  // 2) 없으면 생성
  try {
    const { data: created, error } = await supabase
      .from('book_groups')
      .insert({
        name: folderName,
        institute_id: instituteId,
        created_by: createdBy,
        subject_track: 'math',
      })
      .select('id')
      .single();
    if (error) {
      console.warn(`[학교폴더] "${folderName}" 생성 실패:`, error.message);
      return null;
    }
    console.log(`[학교폴더] "${folderName}" 생성됨 (${created?.id})`);
    return (created as { id: string } | null)?.id || null;
  } catch (e) {
    console.warn(`[학교폴더] "${folderName}" 생성 예외:`, e);
    return null;
  }
}

/**
 * 감지된 과목명에 대해 book_groups에서 가장 적절한 폴더 ID 찾기.
 * 사용자가 폴더 이름을 rename해도 키워드만 포함되면 매칭됨.
 * @returns matched group info or null
 */
export async function findAutoFolderForSubject(
  supabase: SupabaseClient,
  detectedSubject: string
): Promise<{ id: string; name: string; keyword: string } | null> {
  if (!detectedSubject) return null;
  const matched = SUBJECT_KEYWORD_RULES.find((r) => r.match(detectedSubject));
  if (!matched) return null;

  for (const kw of matched.keywords) {
    const { data: groups } = await supabase
      .from('book_groups')
      .select('id, name')
      .ilike('name', `%${kw}%`)
      .is('deleted_at', null)
      .limit(10);
    if (groups && groups.length > 0) {
      // '기출/시험/문제/테스트' 계열 폴더 우선 (학생용 '중2' 폴더와 강사용 '중2 기출' 구분)
      const preferred = (groups as Array<{ id: string; name: string }>).find((g) =>
        /기출|시험|문제|테스트/.test(g.name)
      );
      const target = preferred || (groups[0] as { id: string; name: string });
      return { id: target.id, name: target.name, keyword: kw };
    }
  }
  return null;
}
