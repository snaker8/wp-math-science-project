// ============================================================================
// detection_annotations 저장 — YOLO 학습 데이터 누적
// ============================================================================
//
// ★ 사고 이력 (2026-08-30 조사, 4개월 무증상 데이터 유실)
//
//   YOLO 재학습용 좌표가 2026-04-26 을 마지막으로 8/29 까지 0건이었다.
//   그 사이 자산화된 시험지 166개·문제 4,300여개가 학습 데이터로 한 건도 안 남았다.
//
//   [실측 확정] 두 결함이 겹쳐 "실패해도 아무 흔적이 안 남는" 구조였다:
//     1) Postgres 다중행 INSERT 는 원자적이다. 도형(graph) 행 하나가 무효(NaN → JSON
//        직렬화 시 null → NOT NULL 위반)면 같은 배열의 problem 행까지 통째로 실패한다.
//        → 도형 좌표 하나 때문에 문제 좌표까지 사라진다.
//     2) supabase-js 는 DB 오류를 throw 하지 않고 `{ error }` 로 반환한다.
//        호출부가 `.error` 를 안 봐서 try/catch 로도 안 잡혔다.
//     3) `undefined <= 0` 은 false 라 기존 크기 가드를 그대로 통과했다.
//
//   운영 DB begin/rollback 프로브로 재현:
//     - problem + graph 정상 2행 → INSERT 성공
//     - graph 행 하나만 bbox_w 무효 → PG 23502, 배치 전체 실패 (problem 행 동반 사망)
//
//   [미확정] 최초 트리거는 특정하지 못했다. 일자별 실측상 4/20 경부터 이미 간헐 실패였고
//   (4/22~25 시험지 8개 자산화에 annotation 0), 4/26 을 마지막으로 영구 0 이 됐다.
//   4/29 YOLO 엔드포인트 전환(f7ad223)·4/30 graph 배열 INSERT 도입(e030838)은 영구 0
//   구간 안에 있으나 영구 0 의 시작이 그보다 앞서므로, 단일 커밋을 원인으로 지목할
//   근거가 없다. 클라이언트 상태에 좌우되는 부분이라 정적 분석의 한계다.
//   → 아래 가드 (3) 의 오류 로깅이 다음 자산화에서 진짜 원인을 드러낸다.
//
// ★ 가드 — 아래 3개는 같이 살아있어야 한다. 하나라도 빠지면 같은 사고가 재발한다.
//   (1) 유한수 검증: 무효 bbox 는 행을 만들기 전에 배제한다. NaN·Infinity·undefined 모두.
//   (2) 분리 INSERT: problem 행을 먼저 단독으로 넣는다. 도형 행은 별도 INSERT 라
//       무슨 값이 들어와도 problem 행을 죽일 수 없다. ★ 절대 한 배열로 합치지 말 것.
//   (3) 오류 로깅: 모든 INSERT 의 `.error` 를 확인해 console.error 로 남긴다.
//       조용한 실패를 다시 만들지 않는다.
//
//   자산화(exam/problems 저장) 자체에는 영향을 주지 않는다 — 학습 데이터는 부가 산출물이라
//   여기서 무엇이 실패해도 예외를 던지지 않고 로그만 남긴다.

export interface AnnotationBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnnotationRow {
  problem_id: string;
  exam_id: string | null;
  job_id: string;
  page_number: number;
  page_image_path: string;
  page_width: number;
  page_height: number;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  class_label: 'problem' | 'graph';
  problem_number: number | null;
  detection_source: string;
}

export interface BuildAnnotationRowsInput {
  problemId: string;
  examId: string | null;
  jobId: string;
  pageNumber: number;
  pageImagePath: string;
  pageWidth: number;
  pageHeight: number;
  /** 문제 영역 bbox — 페이지 기준 0~1 */
  problemBbox: AnnotationBbox;
  /** 도형 bbox 목록 — problem 크롭 기준 0~1 (페이지 좌표로 변환해 저장) */
  figureBboxes?: AnnotationBbox[] | null;
  problemNumber: number | null;
  detectionSource: string;
}

export interface BuildAnnotationRowsResult {
  /** problem 클래스 행. 문제 bbox 가 무효면 null. */
  problemRow: AnnotationRow | null;
  /** graph 클래스 행들. 무효 좌표는 제외됨. */
  figureRows: AnnotationRow[];
  /** 배제된 항목의 사유 — 로깅용. 조용한 유실 방지. */
  skipped: string[];
}

/**
 * bbox 의 네 값이 모두 유한수인지 검사.
 *
 * ★ `undefined <= 0` 은 false 라 부등호 가드만으로는 못 거른다. 그 값이 곱셈에 들어가면
 *   NaN 이 되고, JSON.stringify 가 null 로 직렬화해 NOT NULL 위반으로 배치를 죽인다.
 *   이 사고의 직접 원인이므로 타입 검사까지 명시적으로 한다.
 */
export function isFiniteBbox(bbox: unknown): bbox is AnnotationBbox {
  if (!bbox || typeof bbox !== 'object') return false;
  const b = bbox as Partial<AnnotationBbox>;
  return (
    typeof b.x === 'number' && Number.isFinite(b.x) &&
    typeof b.y === 'number' && Number.isFinite(b.y) &&
    typeof b.w === 'number' && Number.isFinite(b.w) &&
    typeof b.h === 'number' && Number.isFinite(b.h)
  );
}

/**
 * 저장할 행들을 만든다. DB 접근 없음 — 순수 함수라 단위 테스트로 검증한다.
 *
 * 도형 좌표는 problem 크롭 기준(0~1)이므로 페이지 기준(0~1)으로 변환한다:
 *   pageX = problem.x + fig.x * problem.w
 */
export function buildAnnotationRows(input: BuildAnnotationRowsInput): BuildAnnotationRowsResult {
  const skipped: string[] = [];

  if (!isFiniteBbox(input.problemBbox)) {
    return {
      problemRow: null,
      figureRows: [],
      skipped: [`problem bbox 무효: ${JSON.stringify(input.problemBbox)}`],
    };
  }

  const pb = input.problemBbox;
  const base = {
    problem_id: input.problemId,
    exam_id: input.examId,
    job_id: input.jobId,
    page_number: input.pageNumber,
    page_image_path: input.pageImagePath,
    page_width: input.pageWidth,
    page_height: input.pageHeight,
    problem_number: input.problemNumber,
    detection_source: input.detectionSource,
  };

  const problemRow: AnnotationRow = {
    ...base,
    bbox_x: pb.x,
    bbox_y: pb.y,
    bbox_w: pb.w,
    bbox_h: pb.h,
    class_label: 'problem',
  };

  const figureRows: AnnotationRow[] = [];
  for (const [idx, fig] of (input.figureBboxes ?? []).entries()) {
    if (!isFiniteBbox(fig)) {
      skipped.push(`도형 ${idx}: 좌표 무효 ${JSON.stringify(fig)}`);
      continue;
    }
    if (fig.w <= 0 || fig.h <= 0) {
      skipped.push(`도형 ${idx}: 크기 0 이하 (w=${fig.w}, h=${fig.h})`);
      continue;
    }

    const row: AnnotationRow = {
      ...base,
      bbox_x: pb.x + fig.x * pb.w,
      bbox_y: pb.y + fig.y * pb.h,
      bbox_w: fig.w * pb.w,
      bbox_h: fig.h * pb.h,
      class_label: 'graph',
    };

    // 변환 결과가 무한/NaN 이 될 여지는 없지만(유한수 × 유한수), 방어적으로 한 번 더 본다.
    // 여기서 걸리면 위 입력 검증에 구멍이 있다는 뜻이므로 사유를 남긴다.
    if (![row.bbox_x, row.bbox_y, row.bbox_w, row.bbox_h].every(Number.isFinite)) {
      skipped.push(`도형 ${idx}: 좌표 변환 결과 무효`);
      continue;
    }
    figureRows.push(row);
  }

  return { problemRow, figureRows, skipped };
}

/** supabase-js 클라이언트 중 이 모듈이 쓰는 부분만. 테스트에서 가짜 구현을 넣기 위함. */
export interface AnnotationDbClient {
  from(table: string): {
    delete(): { eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }> };
    insert(rows: unknown): PromiseLike<{ error: { message: string; details?: string | null } | null }>;
  };
}

export interface SaveAnnotationsResult {
  problemSaved: boolean;
  figuresSaved: number;
  errors: string[];
}

/**
 * 기존 행 삭제 후 problem 행과 graph 행을 **분리해서** 저장한다.
 *
 * ★ 분리가 핵심이다. 한 배열로 합치면 도형 행 하나가 문제 행을 죽인다(위 사고 이력).
 * ★ 예외를 던지지 않는다. 학습 데이터 저장 실패가 자산화를 막으면 안 된다.
 */
export async function saveDetectionAnnotations(
  client: AnnotationDbClient,
  input: BuildAnnotationRowsInput,
  logPrefix: string,
): Promise<SaveAnnotationsResult> {
  const result: SaveAnnotationsResult = { problemSaved: false, figuresSaved: 0, errors: [] };
  const { problemRow, figureRows, skipped } = buildAnnotationRows(input);

  for (const reason of skipped) {
    console.warn(`${logPrefix} annotation 일부 배제 — ${reason}`);
  }

  if (!problemRow) {
    result.errors.push('problem bbox 무효로 저장 안 함');
    return result;
  }

  try {
    // 중복 방지 — 같은 문제의 기존 행 제거
    const { error: delError } = await client
      .from('detection_annotations')
      .delete()
      .eq('problem_id', input.problemId);
    if (delError) {
      console.error(`${logPrefix} annotation 기존 행 삭제 실패:`, delError.message);
      result.errors.push(`delete: ${delError.message}`);
    }

    // (1) problem 행 — 단독 INSERT. 도형과 절대 섞지 않는다.
    const { error: pError } = await client.from('detection_annotations').insert([problemRow]);
    if (pError) {
      console.error(`${logPrefix} annotation problem INSERT 실패:`, pError.message, pError.details ?? '');
      result.errors.push(`problem: ${pError.message}`);
    } else {
      result.problemSaved = true;
    }

    // (2) graph 행 — 별도 INSERT. 실패해도 problem 행은 이미 저장됐다.
    if (figureRows.length > 0) {
      const { error: fError } = await client.from('detection_annotations').insert(figureRows);
      if (fError) {
        console.error(`${logPrefix} annotation graph INSERT 실패 (${figureRows.length}행):`, fError.message, fError.details ?? '');
        result.errors.push(`graph: ${fError.message}`);
      } else {
        result.figuresSaved = figureRows.length;
      }
    }
  } catch (err) {
    // 네트워크 오류 등 — 자산화 흐름은 계속 간다.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${logPrefix} annotation 저장 중 예외:`, msg);
    result.errors.push(msg);
  }

  return result;
}
