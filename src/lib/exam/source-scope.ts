// ============================================================================
// 출제 출처 범위 — 「전체 / 학교기출(특정 학교) / 시중교재 / 모의고사 / 진단평가」
// ============================================================================
// 2026-10-25 대표: 「유형별 출제에서도 학교기출·시중교재·모의고사 구분을 두고, 특정 학교 기출만 원하면 거기서도 되게」.
//
// 문제(problems)에는 출처 컬럼이 없다. 출처는 **시험지(exams)** 가 안다:
//   학교기출 = exams.school_name 있음 · 모의고사 = 제목 규격 `26-06 평가원 고3` · 시중교재 = 「시중교재」 루트 폴더 아래
//   · 진단평가 = exams.is_diagnostic. 그래서 시험지 → exam_problems → 문제 id 집합으로 푼다.
// ★ 검색(problems/search)·집계(available-counts)·생성(generate) 세 경로가 **같은 함수**를 써야
//   「보이는 수 = 뽑히는 수」가 유지된다(2026-06-10 사고 원칙). 여기 말고 다른 데서 출처를 따로 계산하지 말 것.
// ★ 집합이 수만 개(학교기출 전체 ≈ 2만 문항)일 수 있어 `.in()` 에 넣지 않고 **메모리에서 교집합**을 낸다.
import type { SupabaseClient } from '@supabase/supabase-js';

export type SourceKind = '' | 'school' | 'textbook' | 'mock' | 'diagnostic';
export interface SourceScope { source: SourceKind; schools: string[] }

const KINDS: SourceKind[] = ['', 'school', 'textbook', 'mock', 'diagnostic'];

/** 쿼리스트링(`source=school&schools=a,b`)·JSON 본문 어느 쪽이든 같은 모양으로 */
export function parseSourceScope(input: { source?: unknown; schools?: unknown }): SourceScope {
  const source = (typeof input.source === 'string' && (KINDS as string[]).includes(input.source) ? input.source : '') as SourceKind;
  let schools: string[] = [];
  if (Array.isArray(input.schools)) schools = (input.schools as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim());
  else if (typeof input.schools === 'string') schools = input.schools.split(',').map((s) => s.trim()).filter(Boolean);
  // 학교를 골랐으면 출처는 학교기출이다 (학교만 보내고 source 를 빠뜨린 호출 보호)
  if (schools.length > 0 && !source) return { source: 'school', schools: schools.slice(0, 50) };
  return { source, schools: source === 'school' ? schools.slice(0, 50) : [] };
}

export function hasSourceScope(s: SourceScope): boolean { return s.source !== ''; }

const PAGE = 1000;

async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/** 「시중교재」 루트 폴더 아래 모든 폴더 id (book_groups 는 1,700행 수준 — 한 번에 읽어 부모 체인으로 푼다) */
async function textbookFolderIds(sb: SupabaseClient): Promise<string[]> {
  type G = { id: string; name: string; parent_id: string | null };
  const rows = await pageAll<G>((a, b) => sb.from('book_groups').select('id,name,parent_id').is('deleted_at', null).order('id').range(a, b));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rootOf = (id: string): G | undefined => {
    let cur = byId.get(id); let guard = 0;
    while (cur && cur.parent_id && guard++ < 20) cur = byId.get(cur.parent_id);
    return cur;
  };
  return rows.filter((r) => rootOf(r.id)?.name === '시중교재').map((r) => r.id);
}

/**
 * 출처 범위에 드는 **문제 id 집합**. 범위 없음(전체)이면 null.
 * 격리(institute)·삭제 여부는 호출부가 problems 쪽에서 따로 거른다 — 여기선 출처만 본다.
 */
// ★ 인스턴스 캐시 60초 — 학교기출 전체는 시험지 1,736장 → 문항 36,239개로 실측 3.9초. 집계(타이핑마다)·검색·생성이
//   같은 범위를 연달아 부르므로 짧게 붙든다. 적재 직후 1분 안엔 새 시험지가 안 보일 수 있다(허용).
const cache = new Map<string, { at: number; ids: Set<string> }>();
const TTL_MS = 60_000;

export async function loadSourceProblemIds(sb: SupabaseClient, scope: SourceScope): Promise<Set<string> | null> {
  if (!hasSourceScope(scope)) return null;
  const key = `${scope.source}|${[...scope.schools].sort().join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  const ids = await loadSourceProblemIdsUncached(sb, scope);
  cache.set(key, { at: Date.now(), ids });
  return ids;
}

async function loadSourceProblemIdsUncached(sb: SupabaseClient, scope: SourceScope): Promise<Set<string>> {
  type E = { id: string };
  const base = () => sb.from('exams').select('id').is('deleted_at', null).order('id');
  let examIds: string[] = [];
  if (scope.source === 'school') {
    examIds = (await pageAll<E>((a, b) => {
      let q = base().not('school_name', 'is', null);
      if (scope.schools.length) q = q.in('school_name', scope.schools);
      return q.range(a, b);
    })).map((e) => e.id);
  } else if (scope.source === 'mock') {
    // 제목 규격 `26-06 평가원 고3` · `25-09 교육청 고1` · `16-10 경남교육청 고3 문과 파이널` (scripts/import-mathsecr.ts buildTitle)
    examIds = (await pageAll<E>((a, b) => base()
      .filter('title', 'imatch', '^[0-9]{2}-([0-9]{2}|예시|학업성취도) ')
      .or('title.ilike.%평가원%,title.ilike.%교육청%')
      .range(a, b))).map((e) => e.id);
  } else if (scope.source === 'textbook') {
    const folders = await textbookFolderIds(sb);
    for (let i = 0; i < folders.length; i += 200) {
      const slice = folders.slice(i, i + 200);
      examIds.push(...(await pageAll<E>((a, b) => base().in('book_group_id', slice).range(a, b))).map((e) => e.id));
    }
  } else if (scope.source === 'diagnostic') {
    examIds = (await pageAll<E>((a, b) => base().eq('is_diagnostic', true).range(a, b))).map((e) => e.id);
  }
  const ids = new Set<string>();
  if (examIds.length === 0) return ids;
  type L = { problem_id: string };
  for (let i = 0; i < examIds.length; i += 200) {
    const slice = examIds.slice(i, i + 200);
    const links = await pageAll<L>((a, b) => sb.from('exam_problems').select('problem_id').in('exam_id', slice).order('problem_id').range(a, b));
    for (const l of links) if (l.problem_id) ids.add(l.problem_id);
  }
  return ids;
}
