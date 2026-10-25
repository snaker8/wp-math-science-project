/**
 * 수학비서 HML → 클라우드 일괄 적재
 * ============================================================================
 *
 * ★ 기본은 드라이런이다. 실제로 쓰려면 `--commit` 을 명시해야 한다.
 *   수천 문항을 잘못 넣으면 되돌리는 비용이 넣는 비용보다 훨씬 크다.
 *
 * ★ 앱과 **같은 함수**(createExamFromHml)를 쓴다. 별도 적재 경로를 만들지 않는다.
 *   /api/workflow/import-hml 라우트가 부르는 바로 그 함수라, 화면에서 한 장씩
 *   올린 것과 데이터 모양이 100% 같다 (검증 루프·검수 경고 포함).
 *
 * ── 대상 ────────────────────────────────────────────────────────────────
 * 수학비서 자료는 **전부 기출 기반**이다 (대표 확인, 2026-09-01). 파일명이
 * 무엇이든 안에 든 문제는 학교 기출이므로 전량이 대상이다.
 * 다만 **파일의 성격**은 둘로 갈리고, 그에 따라 제목·폴더만 달라진다:
 *
 *   [학교 기출 원본]  한 학교 한 시험 → 제목 규칙 적용, 학교별 폴더
 *     A `…_내신 2025년 부산 해운대구 반여고 고1공통 1학기기말 공통수학1`
 *     B `…_2024년 경일고 1학년 1학기 중간고사`
 *     C `…_[2023기출][1-2-F][혜광고]`
 *
 *   [편집 문제지]    여러 학교 기출을 조합한 수업·과제용 → G드라이브 폴더 그대로
 *     예) `…_[전사고][대수][14.등차수열의합][과제]`
 *   ★ 학교가 하나가 아니므로 학교별 폴더에 못 넣는다. 대표가 쓰던 분류를 유지한다.
 *
 * 어느 쪽이든 **문제는 똑같이 문제은행에 쌓인다.** 폴더는 "시험지 원본을 어디서
 * 다시 꺼내 보는가"의 문제일 뿐이다.
 *
 * ── 중복 차단 ───────────────────────────────────────────────────────────
 * 학교 기출: 접두 키(`25-1-1-F 반여고`). 제목 전체 비교는 과목명 유무 때문에
 *   같은 시험지를 못 걸러 두 벌이 생긴 사고가 있었다 (2026-09-01 반여고).
 * 편집 문제지: 제목 + 폴더 조합.
 *
 * ── 품질 게이트 ─────────────────────────────────────────────────────────
 * 원본(수학비서 파일) 자체가 불완전한 경우가 드물게 있다 — 보기가 2~3개뿐인 문항 등.
 * 우리가 고칠 수 없으므로 **버리지 않고 넣되 리포트에 남긴다.** 조용히 넣는 게 제일 나쁘다.
 *
 * 실행:
 *   npx tsx scripts/import-mathsecr.ts                     드라이런(전체)
 *   npx tsx scripts/import-mathsecr.ts --kind=school        학교 기출만
 *   npx tsx scripts/import-mathsecr.ts --folder=동래자사관    특정 폴더만
 *   npx tsx scripts/import-mathsecr.ts --school=반여고 --commit
 */
import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { parseHml, type HmlProblem } from '@/lib/workflow/hml-parser';
import { createExamFromHml } from '@/lib/workflow/hml-save';

const ROOT = process.env.MATHSECR_ROOT || 'G:/내 드라이브/수학 자료';
const CREATED_BY = process.env.IMPORT_USER_ID || 'a629ecb4-965a-43eb-b42e-c0e17c8ff5b9'; // snaker@hanmail.net
const COMMIT = process.argv.includes('--commit');
const ARG = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const ONLY_SCHOOL = ARG('school');
const ONLY_FOLDER = ARG('folder');
const ONLY_KIND = ARG('kind') as 'school' | 'made' | 'mock' | undefined;
const LIMIT = Number(ARG('limit') || 0);

// ── 분류 ─────────────────────────────────────────────────────────────────
export interface SchoolExam {
  kind: 'school';
  year: number; school: string; grade: number; semester: number;
  period: '중간' | '기말'; subject: string; similar: boolean;
}
export interface MadeSheet { kind: 'made'; name: string }
/**
 * 모의고사 — 평가원(6월·9월·11월 수능·예시문항)·교육청 학력평가. 2026-10-25 추가.
 *   파일명: `2026년(2027학년도) 평가원 고3 공통 06월` · `2025년 교육청 고1공통 9월` · `2009년 평가원 고3이과 6월`
 *           · `2004년(2005학년도) 평가원 고3문과 예시 문항`
 *   track: 공통(2022학년도~ 통합형·고1·고2) / 문과·이과·예체능(2021학년도 이전 분리형)
 */
export interface MockExam {
  kind: 'mock';
  year: number; org: '평가원' | '교육청'; grade: number;
  track: '공통' | '문과' | '이과' | '예체능' | '';
  month: number | null; // null = 예시 문항·학업성취도 등 월 없는 것
  /** 지역 교육청(`경남`·`경기도`·`인천`) — 전국 학평과 같은 달이 겹치므로 제목에 넣어 구분 */
  region?: string;
  /** 변형 표기 — `예시`·`파이널`·`학업성취도` (제목 꼬리) */
  label?: string;
}
export type Classified = SchoolExam | MadeSheet | MockExam;

const P_MOCK = /^(?:\d+_)?(\d{4})년\s*(?:\(\d{4}학년도\))?\s*(평가원|교육청)\s*고(\d)\s*(공통|문과|이과|예체능)?\s*(?:(\d{1,2})월|(예시\s*문항))\s*$/;
/**
 * 변형 10건 (2026-10-25 미러 실측, 정규격 563 외):
 *   `2027년(2028학년도) 평가원 고3공통 수능 예시 문항` · `2013년(2014학년도) 평가원 고3이과 예시 문항 5월`
 *   `2016년 경남교육청 고3 10월 수능대비 파이널 수리영역 나형` · `2007년 경기도교육청 고3 5월 학업성취도평가 수리영역 가형`
 *   `2004년 인천교육청 고3 학업성취도평가 수리영역 나형` · `2023년 교육청 고3공통 4월(5_10시행)`
 *   가형=이과·나형=문과. 지역 교육청은 전국 학평과 같은 달이라 제목에 지역을 넣는다.
 */
const P_MOCK_LOOSE = /^(?:\d+_)?(\d{4})년\s*(?:\(\d{4}학년도\))?\s*(?:(경남|경기도|인천|서울|부산|대구|울산|경북|전남|전북|충남|충북|강원|제주|대전|광주|세종)\s*)?(평가원|교육청)\s*고(\d)\s*(공통|문과|이과|예체능)?\s*(.*)$/;

const P_A = /^(?:\d+_)?내신\s*(\d{4})\s*년\s+(.+?)\s+(중|고)(\d)(\S*)\s+(\d)\s*학기\s*(중간|기말)\s*(.*)$/;
const P_B = /^(?:\d+_)?(\d{4})년\s+(\S+?)\s+(\d)학년\s+(\d)학기\s*(중간|기말)고사\s*(.*)$/;
const P_C = /^(?:\d+_)?\[(\d{4})기출\]\[(\d)-(\d)-([MF])\]\[([^\]]+)\]\s*(.*)$/;
/**
 * D 규격 — 2026-09-01 대량 유입분(786개).
 *   `[24년][1-1][중간][학산여고][수학상]__db-165266`
 *    ↑연도  ↑학년-학기 ↑시기   ↑학교     ↑과목      ↑수학비서ID
 *   변형: 과목 칸이 없는 것(`[22년][2-1][기말][지산고]`), `수학 상` 처럼 공백 있는 것,
 *         접두 ID(`1610056_`)와 접미 ID(`__db-…`) 둘 다 나타남.
 */
const P_D = /^(?:\d+_)?\[(\d{2})년\]\[(\d)-(\d)\]\[(중간|기말)\]\[([^\]]+)\](?:\[([^\]]*)\])?(?:__db-(\d+))?/;

/** 2022 개정 여부로 고1 과목명을 가른다. 2024년 이후 입학생이 공통수학1·2. */
function hs1Subject(year: number, semester: number): string {
  if (year >= 2024) return semester === 2 ? '공통수학2' : '공통수학1';
  return semester === 2 ? '수학(하)' : '수학(상)';
}

/**
 * 수학비서 내려받기 접미사 `__db-234951` 제거.
 *
 * ★ 2026-09-02 사고 — 제목이 `18-1-1-F 중동고 수학상__db-234951` 로 저장됐다(381건).
 *   D 규격만 고쳤다가 **A 규격에서 또 나왔다** — A 는 과목을 줄 끝까지 잡으므로
 *   `수학2__db-234928` 이 통째로 과목명이 된다.
 *   → 규격별로 막지 말고 **파일명 단계에서 한 번에** 걷어낸다. 새 규격이 생겨도 안전하다.
 *   수학비서ID 는 제목에 넣지 않는다(중복 차단은 제목 접두 키로 한다).
 */
function stripDbSuffix(s: string): string {
  // `__db-234951` · `__duplicate-of-db-559920` 등 `__` 로 시작하는 내려받기 꼬리표를 모두 제거.
  // (규격을 좁게 잡았다가 `__duplicate-of-db-` 를 놓친 이력이 있다 — 넓게 잡는다)
  return s.replace(/__[a-z][a-z0-9-]*\d.*$/i, '').trim();
}

export function classify(fileName: string): Classified {
  const n = stripDbSuffix(fileName.replace(/\.hml$/i, '').trim());
  const similar = /유사/.test(n);

  const a = n.match(P_A);
  if (a) {
    const loc = a[2].trim().split(/\s+/);
    return {
      kind: 'school', year: Number(a[1]), school: loc[loc.length - 1],
      grade: Number(a[4]), semester: Number(a[6]),
      period: a[7] as '중간' | '기말', subject: a[8].trim(), similar,
    };
  }
  const b = n.match(P_B);
  if (b) {
    const year = Number(b[1]); const grade = Number(b[3]); const semester = Number(b[4]);
    return {
      kind: 'school', year, school: b[2], grade, semester,
      period: b[5] as '중간' | '기말',
      subject: grade === 1 ? hs1Subject(year, semester) : '', similar,
    };
  }
  const c = n.match(P_C);
  if (c) {
    const year = Number(c[1]); const grade = Number(c[2]); const semester = Number(c[3]);
    return {
      kind: 'school', year, school: c[5], grade, semester,
      period: c[4] === 'M' ? '중간' : '기말',
      subject: grade === 1 ? hs1Subject(year, semester) : '', similar,
    };
  }
  const d = n.match(P_D);
  if (d) {
    const year = 2000 + Number(d[1]);
    const grade = Number(d[2]);
    const semester = Number(d[3]);
    // ★ 2026-09-02 사고 — 과목 칸에 `__db-234951` 접미사가 딸려 들어가
    //   제목이 `18-1-1-F 중동고 수학상__db-234951` 로 저장됐다(381건).
    //   수학비서ID 는 중복 차단 키로만 쓰고 제목에는 절대 넣지 않는다.
    const rawSubject = (d[6] || '')
      .replace(/__db-\d+.*$/, '')   // 접미 ID 제거
      .replace(/\s+/g, '')
      .trim();
    return {
      kind: 'school', year, school: d[5].replace(/__db-\d+.*$/, '').trim(), grade, semester,
      period: d[4] as '중간' | '기말',
      subject: rawSubject || (grade === 1 ? hs1Subject(year, semester) : ''),
      similar,
    };
  }
  const mk = n.match(P_MOCK);
  if (mk) {
    return {
      kind: 'mock', year: Number(mk[1]), org: mk[2] as '평가원' | '교육청', grade: Number(mk[3]),
      track: (mk[4] || '') as MockExam['track'], month: mk[5] ? Number(mk[5]) : null,
    };
  }
  const ml = n.match(P_MOCK_LOOSE);
  if (ml) {
    const rest = ml[6].replace(/\([^)]*\)/g, ' ').trim(); // `4월(5_10시행)` → `4월`
    const month = rest.match(/(\d{1,2})월/);
    let track = (ml[5] || '') as MockExam['track'];
    if (!track && /가형/.test(rest)) track = '이과';
    if (!track && /나형/.test(rest)) track = '문과';
    const label = /예시/.test(rest) ? '예시' : /파이널/.test(rest) ? '파이널' : /학업성취도/.test(rest) ? '학업성취도' : '';
    // 월도 없고 알 수 있는 변형 표기도 없으면 모의고사로 단정하지 않는다
    if (!month && !label) return { kind: 'made', name: n.replace(/^\d+_/, '').trim() || n };
    return {
      kind: 'mock', year: Number(ml[1]), org: ml[3] as '평가원' | '교육청', grade: Number(ml[4]), track,
      month: label === '예시' ? null : month ? Number(month[1]) : null,
      ...(ml[2] ? { region: ml[2] } : {}), ...(label ? { label } : {}),
    };
  }
  return { kind: 'made', name: n.replace(/^\d+_/, '').trim() || n };
}

/**
 * 고3 통합형(2022학년도~) 파일은 공통 22문항 + 확률과 통계·미적분·기하 각 8문항 = 46문항이 한 파일에 순서대로 들어 있다.
 *   (실측 2026-06 평가원: 파일 안에 과목 구분 문단 없음, 23번부터 확통·31번부터 미적·39번부터 기하)
 *   한 장으로 넣으면 과목코드가 5개가 돼 분류 프롬프트가 5과목 표를 다 받고, 유형 검색도 섞인다.
 *   → 4장으로 나눠 각자 과목코드를 붙인다. 46문항이 아니면 구조를 모르는 것이므로 나누지 않고 리포트에 남긴다.
 */
export const MOCK_G3_SPLIT: Array<{ label: string; from: number; to: number; codes: string[] }> = [
  { label: '공통', from: 1, to: 22, codes: ['09', '10'] },
  { label: '확률과 통계', from: 23, to: 30, codes: ['11'] },
  { label: '미적분', from: 31, to: 38, codes: ['12'] },
  { label: '기하', from: 39, to: 46, codes: ['13'] },
];
export function isSplittableMock(c: Classified, problemCount: number): boolean {
  return c.kind === 'mock' && c.grade === 3 && c.track === '공통' && problemCount === 46;
}

/**
 * 제목 뒤 과목 표기 정리.
 *   고등은 같은 학년·학기에도 과목이 갈린다(공통수학1 / 대수 / 미적분Ⅰ …) → 그대로 둔다.
 *   중등 교과서명(`중등수학2상`)은 앞의 `25-2-1-F` 가 이미 학년·학기를 말하고 있어
 *   중복이다. 학교 이름에 '중'도 들어간다 → 그냥 `수학`. (2026-09-02 대표 지적)
 */
export function normalizeSubjectLabel(subject: string): string {
  if (/^중등수학\s*\d\s*[상하]$/.test(subject)) return '수학';
  return subject;
}

/** 제목 — 운영 실측 형식. `25-1-2-F 동인고 공통수학2` = 2025년 고1 2학기 기말 */
export function buildTitle(c: Classified): string {
  if (c.kind === 'made') return c.name;
  if (c.kind === 'mock') {
    // `26-06 평가원 고3` · `25-09 교육청 고1` · `20-06 평가원 고3 이과` · `04-예시 평가원 고3 문과`
    const yy = String(c.year).slice(2);
    const mm = c.month == null ? (c.label || '예시') : String(c.month).padStart(2, '0');
    const track = c.track && c.track !== '공통' ? ` ${c.track}` : '';
    // 월이 있는 변형(`16-10 경남교육청 고3 문과 파이널`)은 꼬리로, 월이 없으면 월 자리에(`04-학업성취도 인천교육청 고3 이과`)
    const tail = c.label && c.label !== '예시' && c.month != null ? ` ${c.label}` : '';
    return `${yy}-${mm} ${c.region || ''}${c.org} 고${c.grade}${track}${tail}`;
  }
  const yy = String(c.year).slice(2);
  const p = c.period === '중간' ? 'M' : 'F';
  const subjectLabel = normalizeSubjectLabel(c.subject);
  const sub = subjectLabel ? ` ${subjectLabel}` : '';
  return `${yy}-${c.grade}-${c.semester}-${p} ${c.school}${sub}${c.similar ? ' (유사)' : ''}`;
}

/** 장식 문자·미러 접두 폴더를 걷어낸 G드라이브 폴더 경로 */
function mirrorFolders(file: string): string[] {
  const rel = path.relative(ROOT, path.dirname(file));
  return rel.split(path.sep)
    .map((s) => s.replace(/^[★◐△■♣＃＆#&\s]+/, '').trim())
    .filter((s) => s && !/미러$/.test(s))
    .slice(0, 3);
}

export function targetFolders(c: Classified, file: string): string[] {
  if (c.kind === 'school') {
    return [c.similar ? '학교기출유사' : '학교기출', c.school, c.subject || '기타'];
  }
  // 클라우드 상단 「모의고사」 버튼은 같은 이름의 최상위 폴더와 연동된다(CATEGORY_FOLDER_NAME.mock).
  if (c.kind === 'mock') return ['모의고사', c.org, `고${c.grade}`];
  const f = mirrorFolders(file);
  return f.length ? f : ['수학비서 자료'];
}

/** 학년·학기 → mathsecr 과목코드. 파일명에 둘 다 있으므로 정확히 특정된다. */
export function resolveCodes(c: Classified, file: string): string[] {
  if (c.kind === 'mock') {
    // 고1 = 공통수학1·2 (옛 수학(상)(하)도 같은 두 코드), 고2 = 대수·미적분Ⅰ (옛 수1·수2 동일 코드)
    if (c.grade === 1) return ['07', '08'];
    if (c.grade === 2) return ['09', '10'];
    // 고3 — 통합형 공통은 isSplittableMock 로 4장 분할. 못 나누면 다섯 과목 모두 후보.
    if (c.track === '문과' || c.track === '예체능') return ['09', '10', '11'];   // 나형: 수Ⅰ·수Ⅱ·확통
    if (c.track === '이과') return ['11', '12', '13'];                          // 가형: 확통·미적분·기하
    return ['09', '10', '11', '12', '13'];
  }
  if (c.kind !== 'school') return [];
  if (/중\d/.test(file) || (c.grade <= 3 && /중등/.test(c.subject))) {
    const table: Record<number, string[]> = { 1: ['01', '02'], 2: ['03', '04'], 3: ['05', '06'] };
    const pair = table[c.grade];
    if (pair && /중등|중\d/.test(c.subject + file)) return [pair[c.semester === 2 ? 1 : 0]];
  }
  const s = c.subject.replace(/\s/g, '');
  const direct: Record<string, string | string[]> = {
    // 2022 개정
    '공통수학1': '07', '공수1': '07', '공통수학2': '08', '공수2': '08',
    '대수': '09', '미적분1': '10', '확률과통계': '11', '확통': '11', '기하': '13',
    // 2015 개정 (D 규격에 많다 — 수학상/수학하/수학1/수학2)
    // ★ 수학(상)/(하)는 2022 공통수학1·2 양쪽으로 단원이 재배치됐다.
    //   출처명으로 한 과목을 확정하지 않고 두 후보를 모두 저장해 문제 본문으로 최종 분류한다.
    //   최종 MS07 문제는 공통수학1 유형 검색에, MS08 문제는 공통수학2 유형 검색에 노출된다.
    '수학상': ['07', '08'], '수학(상)': ['07', '08'],
    '수학하': ['07', '08'], '수학(하)': ['07', '08'],
    '수학1': '09', '수1': '09', '수학I': '09',
    '수학2': '10', '수2': '10', '수학II': '10',
    '미적분': '12', '미적분2': '12',
    // 심화·기타 — 대수 계열로 본다 (트리에 별도 과목이 없다)
    '고급대수': '09',
  };
  const resolved = direct[s];
  if (!resolved) return [];
  return Array.isArray(resolved) ? resolved : [resolved];
}

// ── 품질 게이트 ───────────────────────────────────────────────────────────
export interface Defect { number: number; reason: string }

/**
 * 문항 품질 점검. 원본이 불완전한 경우를 **버리지 않고 드러낸다.**
 * (수학비서 파일 자체가 드물게 불완전하다 — 대표 확인, 실측 3,762 객관식 중 2건)
 */
export function inspect(problems: HmlProblem[]): Defect[] {
  const out: Defect[] = [];
  for (const p of problems) {
    if (!p.content.trim()) { out.push({ number: p.number, reason: '본문 없음' }); continue; }
    const marks = (p.content.match(/[①②③④⑤]/g) || []).length;
    if (p.choices.length > 0 && p.choices.length < 5) {
      out.push({ number: p.number, reason: `보기 ${p.choices.length}개${marks ? ' (본문에 마커 잔류 — 쪼개짐 의심)' : ' (원본 결손 의심)'}` });
    }
    const idx = '①②③④⑤'.indexOf(p.answer);
    if (p.choices.length > 0 && idx >= 0 && idx >= p.choices.length) {
      out.push({ number: p.number, reason: `정답 ${p.answer} 인데 보기 ${p.choices.length}개 — 채점 불가` });
    }
  }
  return out;
}

// ── 폴더 ─────────────────────────────────────────────────────────────────
const folderCache = new Map<string, string>();
async function ensureFolder(sb: SupabaseClient, segments: string[]): Promise<string | null> {
  let parentId: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const key = segments.slice(0, i + 1).join('/');
    const hit = folderCache.get(key);
    if (hit) { parentId = hit; continue; }
    const base = sb.from('book_groups').select('id').eq('name', segments[i])
      .is('deleted_at', null).is('institute_id', null);
    const { data: found } = parentId ? await base.eq('parent_id', parentId) : await base.is('parent_id', null);
    if (found?.length) { parentId = found[0].id as string; folderCache.set(key, parentId); continue; }
    if (!COMMIT) { parentId = `(신규)${key}`; folderCache.set(key, parentId); continue; }
    const { data: made, error } = await sb.from('book_groups')
      .insert({ name: segments[i], parent_id: parentId, institute_id: null, created_by: CREATED_BY })
      .select('id').single();
    if (error || !made) { console.error(`  폴더 생성 실패 "${key}": ${error?.message}`); return null; }
    parentId = made.id as string; folderCache.set(key, parentId);
  }
  return parentId;
}

// ── 실행 ─────────────────────────────────────────────────────────────────
function walk(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 7) return out;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (e.name.toLowerCase().endsWith('.hml')) out.push(p);
  }
  return out;
}

async function main() {
  const env = Object.fromEntries(
    fs.readFileSync('.env.local', 'utf-8').split('\n')
      .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]; }),
  ) as Record<string, string>;
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  let items = walk(ROOT).map((file) => {
    const cls = classify(path.basename(file));
    // ★ 모의고사 규격은 미러의 평가원·교육청 폴더 안에 있는 원본만. 다른 폴더의 `1318097_2016년 교육청 고2이과 3월.hml`
    //   같은 발췌본(8~9문항)이 먼저 걸리면 같은 제목으로 원본(30문항)을 막는다(2026-10-25 첫 적재 실측) → 종전처럼 편집본.
    if (cls.kind === 'mock' && !/[\\/](평가원|교육청)[\\/]/.test(file)) {
      return { file, cls: { kind: 'made', name: stripDbSuffix(path.basename(file).replace(/\.hml$/i, '')).replace(/^\d+_/, '').trim() } as Classified };
    }
    return { file, cls };
  });
  if (ONLY_KIND) items = items.filter((x) => x.cls.kind === ONLY_KIND);
  if (ONLY_SCHOOL) items = items.filter((x) => x.cls.kind === 'school' && x.cls.school === ONLY_SCHOOL);
  if (ONLY_FOLDER) items = items.filter((x) => x.file.includes(ONLY_FOLDER));
  if (LIMIT) items = items.slice(0, LIMIT);

  console.log(COMMIT ? '★ 실제 적재' : '드라이런 (쓰지 않음)');
  console.log(`대상 ${items.length}건  (학교기출 ${items.filter((x) => x.cls.kind === 'school').length} / 편집본 ${items.filter((x) => x.cls.kind === 'made').length})\n`);

  let done = 0, skipped = 0, failed = 0, problems = 0, defectExams = 0, defectCount = 0;
  /** 이 실행에서 이미 처리한 중복 키 — 같은 실행 안의 중복을 막는다 (DB 조회만으론 못 막음) */
  const seenKeys = new Set<string>();
  const report: string[] = [];

  for (const { file, cls } of items) {
    const title = buildTitle(cls);
    const folders = targetFolders(cls, file);

    // ── 중복 차단 ────────────────────────────────────────────────────────
    // ★ 2026-09-02 사고 — 같은 시험지가 **같은 초에 두 번** 들어갔다(129건).
    //   같은 파일이 폴더 두 곳에 있는데, 두 번째를 검사할 때 첫 번째 INSERT 가
    //   아직 조회에 안 잡혀 DB 검사만으로는 못 막았다.
    //   → 이 실행에서 이미 처리한 키를 메모리에 기억해 같은 실행 안의 중복도 막는다.
    const dupKey = cls.kind === 'school'
      ? `${title.split(' ')[0]} ${cls.school}`
      : title;
    if (seenKeys.has(dupKey)) { skipped++; continue; }

    // ★ 조회 자체가 실패(fetch failed)하면 "없음"으로 보지 않는다 — 2026-10-25 3차 실행에서 네트워크 오류 순간에
    //   가드가 통과돼 평가원 13장이 두 번 들어갔다(createExamFromHml 안의 가드도 try/catch 로 통과시킨다). 실패로 기록하고 넘어간다.
    if (cls.kind === 'school') {
      const { data, error } = await sb.from('exams').select('id,title')
        .like('title', `${dupKey}%`).is('deleted_at', null).limit(1);
      if (error) { failed++; report.push(`적재실패  ${title} — 중복 조회 실패(${error.message}) → 재실행 대상`); continue; }
      if (data?.length) { seenKeys.add(dupKey); skipped++; continue; }
    } else {
      // 모의고사 고3 통합형은 `…고3 공통/확률과 통계/미적분/기하` 로 나뉘어 저장되므로 접두 일치로 본다.
      const q = cls.kind === 'mock'
        ? sb.from('exams').select('id').like('title', `${title}%`).is('deleted_at', null).limit(1)
        : sb.from('exams').select('id').eq('title', title).is('deleted_at', null).limit(1);
      const { data, error } = await q;
      if (error) { failed++; report.push(`적재실패  ${title} — 중복 조회 실패(${error.message}) → 재실행 대상`); continue; }
      if (data?.length) { seenKeys.add(dupKey); skipped++; continue; }
    }
    seenKeys.add(dupKey);

    let parsed;
    try { parsed = parseHml(fs.readFileSync(file)); }
    catch (e) { failed++; report.push(`파싱실패  ${title} — ${e instanceof Error ? e.message : e}`); continue; }
    if (!parsed.problems.length) { skipped++; continue; }

    const defects = inspect(parsed.problems);
    if (defects.length) {
      defectExams++; defectCount += defects.length;
      report.push(`검수필요  ${title}\n${defects.map((d) => `            #${d.number} ${d.reason}`).join('\n')}`);
    }

    // ── 적재 단위 — 보통 파일 1장 = 시험지 1장. 고3 통합형 모의고사(46문항)만 과목별 4장. ──
    type Piece = { title: string; parsed: typeof parsed; codes: string[] };
    let pieces: Piece[];
    if (isSplittableMock(cls, parsed.problems.length)) {
      pieces = MOCK_G3_SPLIT.map((s) => ({
        title: `${title} ${s.label}`,
        parsed: { ...parsed, problems: parsed.problems.filter((p) => p.number >= s.from && p.number <= s.to) },
        codes: s.codes,
      }));
    } else {
      if (cls.kind === 'mock' && cls.grade === 3 && cls.track === '공통') {
        report.push(`구조불명  ${title} — 고3 공통인데 ${parsed.problems.length}문항(46 아님) → 한 장으로 넣음, 과목코드 5개`);
      }
      pieces = [{ title, parsed, codes: resolveCodes(cls, file) }];
    }

    if (!COMMIT) {
      for (const pc of pieces) {
        console.log(`  [dry] ${pc.title.slice(0, 44).padEnd(46)} ${String(pc.parsed.problems.length).padStart(3)}문항  ${folders.join('/')}  [${pc.codes.join(',')}]${defects.length ? `  ⚠${defects.length}` : ''}`);
        problems += pc.parsed.problems.length;
      }
      done++; continue;
    }

    // ★ 네트워크 일시 오류(TypeError: fetch failed, 2026-10-25 실측 37회) — 폴더를 못 만들면 시험지를 만들지 않는다
    //   (null 로 넘기면 createExamFromHml 이 과목코드로 엉뚱한 폴더를 고른다). 3회 재시도 후 실패로 기록.
    let bookGroupId: string | null = null;
    for (let attempt = 0; attempt < 3 && !bookGroupId; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 2000 * attempt));
      bookGroupId = await ensureFolder(sb, folders);
    }
    if (!bookGroupId) { failed++; report.push(`적재실패  ${title} — 폴더 생성 실패(네트워크) → 재실행 대상`); continue; }
    for (const pc of pieces) {
      const res = await createExamFromHml(sb, pc.parsed, {
        createdBy: CREATED_BY,
        instituteId: null,                                   // 공통풀
        bookGroupId: bookGroupId?.startsWith('(신규)') ? null : bookGroupId,
        sourceCategory: cls.kind === 'school' ? 'school' : cls.kind === 'mock' ? 'mock' : 'auto',
        title: pc.title,
        sourceName: path.basename(file),
        curriculumCodes: pc.codes,
        ...(cls.kind === 'mock' ? { grade: `고${cls.grade}`, examYear: cls.year } : {}),
      });
      if (!res.ok) { failed++; report.push(`적재실패  ${pc.title} — ${res.error}`); continue; }
      // ★ 제목이 달라도 같은 시험이면 createExamFromHml 이 건너뛴다(exam-duplicate-guard).
      //   그걸 "적재됨"으로 세면 리포트가 거짓말이 된다 — 건너뜀으로 잡고 이유를 남긴다.
      if (res.alreadyExisted) {
        skipped++;
        report.push(`중복건너뜀 ${pc.title} — 이미 있음: "${res.duplicateOf?.title ?? '(제목 동일)'}"`);
        continue;
      }
      // ★ 문항 일부만 들어간 시험지(문항 INSERT 중 fetch failed)는 남기면 안 된다 — 제목 중복 가드가 재실행을 막아
      //   영원히 반쪽으로 남는다. 시험지·문항을 소프트삭제하고 실패로 기록해 재실행에서 다시 넣는다.
      if ((res.savedProblems ?? 0) < pc.parsed.problems.length && res.examId) {
        const { data: links } = await sb.from('exam_problems').select('problem_id').eq('exam_id', res.examId);
        const ids = (links || []).map((l) => l.problem_id as string);
        if (ids.length) await sb.from('problems').update({ deleted_at: new Date().toISOString() }).in('id', ids);
        await sb.from('exams').update({ deleted_at: new Date().toISOString() }).eq('id', res.examId);
        failed++; report.push(`적재실패  ${pc.title} — 문항 ${res.savedProblems ?? 0}/${pc.parsed.problems.length} 만 저장돼 되돌림(네트워크) → 재실행 대상`);
        continue;
      }
      problems += res.savedProblems ?? 0;
    }
    done++;
    if (done % 25 === 0) console.log(`  … ${done}건 적재 (${problems.toLocaleString()}문항)`);
  }

  console.log(`\n── 결과 ──`);
  console.log(`  처리       ${done}`);
  console.log(`  건너뜀     ${skipped}   (중복·0문항)`);
  console.log(`  실패       ${failed}`);
  console.log(`  문항       ${problems.toLocaleString()}`);
  console.log(`  검수 필요   시험지 ${defectExams} / 문항 ${defectCount}`);

  if (report.length) {
    const out = path.join('scripts', `import-report-${COMMIT ? 'commit' : 'dry'}.txt`);
    fs.writeFileSync(out, report.join('\n'), 'utf-8');
    console.log(`\n  상세 리포트 → ${out}`);
  }
  if (!COMMIT) console.log(`\n실제로 넣으려면 --commit 을 붙이세요.`);
}

// ★ 직접 실행할 때만 돈다.
//   이 파일은 classify()/buildTitle() 같은 순수 함수를 다른 스크립트가 import 해서 쓴다.
//   가드가 없으면 **import 하는 순간 적재 전체가 실행된다** (2026-09-02 실측 — 검증
//   스크립트가 멈춘 것처럼 보였는데 실제로는 1,576건 드라이런이 돌고 있었다).
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('import-mathsecr.ts');
if (isDirectRun) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
