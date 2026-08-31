import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isFiniteBbox,
  buildAnnotationRows,
  saveDetectionAnnotations,
  type AnnotationDbClient,
  type BuildAnnotationRowsInput,
} from './detection-annotations';

// ============================================================================
// 회귀 테스트 — 2026-04-30 ~ 08-29 학습 데이터 유실 사고
//
// 사고: 도형(graph) 행 하나가 무효면 Postgres 다중행 INSERT 원자성 때문에 같은 배열의
//       problem 행까지 실패했고, supabase-js 가 오류를 throw 하지 않아 조용히 묻혔다.
// 가드: (1) 무효 좌표 사전 배제 (2) problem/graph 분리 INSERT (3) .error 로깅
// ============================================================================

const baseInput: BuildAnnotationRowsInput = {
  problemId: 'prob-1',
  examId: 'exam-1',
  jobId: 'job-1',
  pageNumber: 1,
  pageImagePath: 'page-images/job-1/page-1.jpg',
  pageWidth: 0,
  pageHeight: 0,
  problemBbox: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
  figureBboxes: [],
  problemNumber: 3,
  detectionSource: 'MANUAL',
};

describe('isFiniteBbox', () => {
  it('정상 좌표를 통과시킨다', () => {
    expect(isFiniteBbox({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
  });

  it.each([
    ['undefined 필드', { x: 0, y: 0, w: undefined, h: 1 }],
    ['NaN', { x: 0, y: 0, w: NaN, h: 1 }],
    ['Infinity', { x: 0, y: 0, w: Infinity, h: 1 }],
    ['문자열', { x: '0', y: 0, w: 1, h: 1 }],
    ['null 자체', null],
    ['undefined 자체', undefined],
  ])('무효 좌표를 거른다 — %s', (_label, bad) => {
    expect(isFiniteBbox(bad)).toBe(false);
  });
});

// ============================================================================
// 회귀 테스트 — 2026-08-31 원인 확정: 정수 컬럼에 소수가 들어가 INSERT 전멸
//
// 운영 Postgres 로그 실측:
//   ERROR 22P02: invalid input syntax for type integer: "1630.5"
// page_width/page_height 는 integer 인데 클라이언트가 PDF.js viewport 크기를 소수로
// 보냈다. PostgREST 가 400 을 돌려주며 annotation 이 한 건도 안 들어갔다.
// (DELETE 는 204 로 성공해서 "기존 행만 지우고 새로 안 넣는" 상태였다.)
// ============================================================================
describe('정수 컬럼 정규화 (22P02 재발 차단)', () => {
  it('소수 페이지 크기를 반올림한다 — 실제 사고값 1630.5', () => {
    const { problemRow } = buildAnnotationRows({
      ...baseInput,
      pageWidth: 1630.5,
      pageHeight: 2308.25,
    });
    expect(problemRow!.page_width).toBe(1631);
    expect(problemRow!.page_height).toBe(2308);
    expect(Number.isInteger(problemRow!.page_width)).toBe(true);
    expect(Number.isInteger(problemRow!.page_height)).toBe(true);
  });

  it('도형 행도 같은 정수 값을 쓴다', () => {
    const { figureRows } = buildAnnotationRows({
      ...baseInput,
      pageWidth: 1630.5,
      pageHeight: 2308.25,
      figureBboxes: [{ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }],
    });
    expect(figureRows).toHaveLength(1);
    expect(Number.isInteger(figureRows[0].page_width)).toBe(true);
    expect(Number.isInteger(figureRows[0].page_height)).toBe(true);
  });

  it('페이지 번호도 정수로 만든다', () => {
    const { problemRow } = buildAnnotationRows({ ...baseInput, pageNumber: 2.0000001 });
    expect(problemRow!.page_number).toBe(2);
  });

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['undefined', undefined as unknown as number],
  ])('비유한 페이지 크기는 0 으로 떨어뜨린다 (행은 살린다) — %s', (_label, bad) => {
    const { problemRow } = buildAnnotationRows({ ...baseInput, pageWidth: bad });
    expect(problemRow).not.toBeNull();
    expect(problemRow!.page_width).toBe(0);
  });

  it('bbox 는 real 컬럼이라 소수를 그대로 보존한다', () => {
    const { problemRow } = buildAnnotationRows({
      ...baseInput,
      problemBbox: { x: 0.1234, y: 0.2345, w: 0.5678, h: 0.4321 },
    });
    expect(problemRow!.bbox_x).toBeCloseTo(0.1234);
    expect(problemRow!.bbox_w).toBeCloseTo(0.5678);
  });
});

describe('buildAnnotationRows', () => {
  it('문제 행을 만든다', () => {
    const { problemRow, figureRows, skipped } = buildAnnotationRows(baseInput);
    expect(problemRow).toMatchObject({
      class_label: 'problem',
      bbox_x: 0.1, bbox_y: 0.2, bbox_w: 0.5, bbox_h: 0.4,
      problem_number: 3,
    });
    expect(figureRows).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });

  it('도형 좌표를 problem 크롭 기준 → 페이지 기준으로 변환한다', () => {
    const { figureRows } = buildAnnotationRows({
      ...baseInput,
      figureBboxes: [{ x: 0.2, y: 0.5, w: 0.4, h: 0.25 }],
    });
    expect(figureRows).toHaveLength(1);
    // x = 0.1 + 0.2*0.5 = 0.2 / y = 0.2 + 0.5*0.4 = 0.4 / w = 0.4*0.5 = 0.2 / h = 0.25*0.4 = 0.1
    expect(figureRows[0].bbox_x).toBeCloseTo(0.2);
    expect(figureRows[0].bbox_y).toBeCloseTo(0.4);
    expect(figureRows[0].bbox_w).toBeCloseTo(0.2);
    expect(figureRows[0].bbox_h).toBeCloseTo(0.1);
    expect(figureRows[0].class_label).toBe('graph');
  });

  it('★ 핵심 회귀: 무효한 도형이 섞여도 문제 행은 살아남는다', () => {
    const { problemRow, figureRows, skipped } = buildAnnotationRows({
      ...baseInput,
      figureBboxes: [
        { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },                                  // 정상
        { x: 0.1, y: 0.1, w: undefined as unknown as number, h: 0.3 },       // 사고 원인 재현
        { x: NaN, y: 0.1, w: 0.3, h: 0.3 },                                  // NaN
        { x: 0.1, y: 0.1, w: 0, h: 0.3 },                                    // 크기 0
      ],
    });
    expect(problemRow).not.toBeNull();          // ← 예전 코드에서는 이게 통째로 유실됐다
    expect(figureRows).toHaveLength(1);         // 정상 1건만
    expect(skipped).toHaveLength(3);
  });

  it('`undefined <= 0` 가 false 라는 함정을 실제로 막는다', () => {
    const bad = { x: 0.1, y: 0.1, w: undefined as unknown as number, h: 0.3 };
    // 예전 가드는 이 조건만 봤다 → 통과해버려 NaN 이 DB 로 갔다
    expect(bad.w <= 0).toBe(false);
    // 새 가드는 막는다
    expect(buildAnnotationRows({ ...baseInput, figureBboxes: [bad] }).figureRows).toHaveLength(0);
  });

  it('문제 bbox 자체가 무효면 아무것도 만들지 않는다', () => {
    const { problemRow, figureRows, skipped } = buildAnnotationRows({
      ...baseInput,
      problemBbox: { x: 0.1, y: 0.1, w: NaN, h: 0.3 },
      figureBboxes: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }],
    });
    expect(problemRow).toBeNull();
    expect(figureRows).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it('figureBboxes 가 null/undefined 여도 문제 행은 만든다 (하위 호환)', () => {
    expect(buildAnnotationRows({ ...baseInput, figureBboxes: null }).problemRow).not.toBeNull();
    expect(buildAnnotationRows({ ...baseInput, figureBboxes: undefined }).problemRow).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------

type InsertCall = { rows: unknown[] };

function makeClient(opts: {
  problemInsertError?: string;
  graphInsertError?: string;
  deleteError?: string;
} = {}) {
  const inserts: InsertCall[] = [];
  let insertCount = 0;
  const client: AnnotationDbClient = {
    from: () => ({
      delete: () => ({
        eq: async () => ({ error: opts.deleteError ? { message: opts.deleteError } : null }),
      }),
      insert: async (rows: unknown) => {
        insertCount += 1;
        inserts.push({ rows: rows as unknown[] });
        const isFirst = insertCount === 1;
        const err = isFirst ? opts.problemInsertError : opts.graphInsertError;
        return { error: err ? { message: err, details: null } : null };
      },
    }),
  };
  return { client, inserts };
}

describe('saveDetectionAnnotations', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('★ 핵심 회귀: problem 과 graph 를 분리해서 INSERT 한다', async () => {
    const { client, inserts } = makeClient();
    const res = await saveDetectionAnnotations(
      client,
      { ...baseInput, figureBboxes: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }] },
      '[test]',
    );
    expect(inserts).toHaveLength(2);                 // ← 한 배열로 합치면 안 된다
    expect(inserts[0].rows).toHaveLength(1);         // problem 단독
    expect(inserts[1].rows).toHaveLength(1);         // graph 별도
    expect(res.problemSaved).toBe(true);
    expect(res.figuresSaved).toBe(1);
  });

  it('★ 핵심 회귀: graph INSERT 가 실패해도 problem 은 저장된다', async () => {
    const { client } = makeClient({ graphInsertError: 'null value in column "bbox_w"' });
    const res = await saveDetectionAnnotations(
      client,
      { ...baseInput, figureBboxes: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }] },
      '[test]',
    );
    expect(res.problemSaved).toBe(true);             // ← 사고 당시엔 여기서 같이 죽었다
    expect(res.figuresSaved).toBe(0);
    expect(res.errors.some(e => e.startsWith('graph:'))).toBe(true);
  });

  it('★ 핵심 회귀: INSERT 오류를 삼키지 않고 로그로 남긴다', async () => {
    const spy = vi.spyOn(console, 'error');
    const { client } = makeClient({ problemInsertError: 'boom' });
    const res = await saveDetectionAnnotations(client, baseInput, '[test]');
    expect(res.problemSaved).toBe(false);
    expect(res.errors).toContain('problem: boom');
    expect(spy).toHaveBeenCalled();                  // ← 4개월 무증상의 직접 원인이 이것
  });

  it('도형이 없으면 INSERT 는 한 번만 한다', async () => {
    const { client, inserts } = makeClient();
    await saveDetectionAnnotations(client, baseInput, '[test]');
    expect(inserts).toHaveLength(1);
  });

  it('예외가 나도 던지지 않는다 (자산화 흐름 보호)', async () => {
    const client: AnnotationDbClient = {
      from: () => ({
        delete: () => ({ eq: async () => { throw new Error('network down'); } }),
        insert: async () => ({ error: null }),
      }),
    };
    await expect(saveDetectionAnnotations(client, baseInput, '[test]')).resolves.toBeDefined();
  });
});
