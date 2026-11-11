/**
 * 수학비서 「내 문제지」 묶음 출제본 → 이미 적재된 학교기출 문제에 해설을 채운다. (AI 비용 0)
 *
 * 배경 (2026-11-11):
 *   나만의DB 원본 HML 로 적재한 학교기출 41,356문항은 해설이 0이다(원본에 해설이 없다).
 *   같은 문항을 내 문제지에 묶어 출제하면 해설이 붙어 나온다 → 브라우저에서 75묶음을 받아
 *   bundle_NNN.hml(출제본) + bundle_NNN.json(묶을 때 담은 시험지·셀·번호) 로 저장했다.
 *
 * 짝짓기:
 *   출제본의 문항 순서 = 담은 셀 순서(json.cells 를 키 순서대로 펼친 것). 출처 줄의 시험지명이
 *   다른 출처(같은 문항이 모의고사에도 있으면 모의고사 이름)로 찍히는 경우가 있어 **순서로** 짝짓고,
 *   시험지명이 맞는 문항으로 순서가 맞는지 검산한다. 하나라도 어긋나면 그 묶음은 건너뛴다.
 *   우리 문제 = problems.source_name `…__db-{수학비서 시험지 id}.hml` + source_number.
 *
 * 쓰기:
 *   - solution_latex 가 비어 있는 문제만 채운다(--overwrite 로 덮어쓰기). 해설 그림은 Storage 업로드 후 `![](url)`.
 *   - 정답은 **바꾸지 않는다**. 다르면 보고서에만 적는다(수학비서 정답 검증 갱신분 — 사람이 보고 결정).
 *   - 유형 경로(수학비서 분류)도 보고서에만 남긴다.
 *
 * 사용:
 *   npx tsx scripts/backfill-mathsecr-solutions.ts --bundles=<dir> --mydbs=<mydbs.json>          # 드라이런
 *   npx tsx scripts/backfill-mathsecr-solutions.ts --bundles=<dir> --mydbs=<mydbs.json> --apply  # 쓰기
 *   옵션: --only=001,002  --overwrite
 */
import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseWorksheetHml,
  type WorksheetItem,
} from "../src/lib/workflow/hml-worksheet";
import { materializeSolution } from "../src/lib/workflow/solution-images";
import {
  loadSupabase,
  parseArgs,
  normAns,
  normText,
  similarity,
  SIM_OK,
  fetchByDbId,
  solutionUploader,
  type DbProblem,
} from "./mathsecr-match";

const args = parseArgs();
const APPLY = args.apply === "true";
const OVERWRITE = args.overwrite === "true";
// 정답 칸에 섞인 `[해설]…` 꼬리 제거 (값은 그대로, 수학비서 정답과 같은 경우만)
const FIX_POLLUTED = args["fix-polluted"] === "true";
// 우리 정답이 빈 문항만 수학비서 정답으로 채움 (다른 값으로 덮어쓰지 않는다)
const FILL_EMPTY = args["fill-empty-answers"] === "true";
// 순서 검산 — 출처 줄 시험지명이 담은 시험지와 같은 비율 하한. 모의고사는 같은 문항이 여러 출처(교육청·평가원)에
// 걸려 다른 이름이 찍히므로 낮춰 돌린다(어긋남 0 은 그대로 필수, 문항마다 본문 유사도도 따로 본다).
const MIN_TITLE_HIT = Number(args["min-title-hit"] ?? 0.8);
const DIR = args.bundles;
const ONLY = args.only ? new Set(args.only.split(",")) : null;
if (!DIR || !args.mydbs) {
  console.error("--bundles=<dir> --mydbs=<json> 필요");
  process.exit(1);
}

interface BundleMeta {
  no: string;
  exams: number[];
  cells: Record<string, [number, number, number][]>;
  order?: Array<[number, number]>;
}

/** 수학비서 시험지 제목 → `YY-G-S-M|F` + 학교. 두 형식:
 *   `[23년][1-2][중간][동인고][수학하]` · `내신 2025년 부산시 해운대구 해운대고 고1 공통 1학기 기말 공통수학1` */
function examKeyFromMathsecrTitle(
  t: string,
): { key: string; school: string; subject: string } | null {
  let m = t.match(
    /^\[(\d{2})년\]\[(\d)-(\d)\]\[(중간|기말)\]\[([^\]]+)\](?:\[([^\]]*)\])?/,
  );
  if (m)
    return {
      key: `${m[1]}-${m[2]}-${m[3]}-${m[4] === "중간" ? "M" : "F"}`,
      school: m[5].trim(),
      subject: m[6] || "",
    };
  // `[20년][사직중][3-1 중간]` (중학교)
  m = t.match(/^\[(\d{2})년\]\[([^\]]+)\]\[(\d)-(\d)\s*(중간|기말)\]/);
  if (m)
    return {
      key: `${m[1]}-${m[3]}-${m[4]}-${m[5] === "중간" ? "M" : "F"}`,
      school: m[2].trim(),
      subject: "",
    };
  m = t.match(
    /(\d{4})년\s.*?\s(\S+)\s고(\d)\s?공통\s.*?(\d)학기\s*(중간|기말)\s*(\S*)/,
  );
  if (m)
    return {
      key: `${m[1].slice(2)}-${m[3]}-${m[4]}-${m[5] === "중간" ? "M" : "F"}`,
      school: m[2].trim(),
      subject: m[6] || "",
    };
  return null;
}
/** 과목명 정규화: `수학(상)`·`수학 상`→`수학상`, `수1`→`수학1` */
const subjectNorm = (s: string) =>
  s.replace(/[\s()（）]/g, "").replace(/^수(\d)$/, "수학$1");
// `부산중앙여고` ↔ `중앙여고` 처럼 지역 접두만 다른 경우. 남는 글자가 3자 미만이면 떼지 않는다(`부산여고`).
const schoolCore = (s: string) => {
  const t = s.replace(/\s/g, "").replace(/등학교$|학교$/, "");
  const cut = t.replace(/^부산/, "");
  return cut.length >= 3 ? cut : t;
};

async function fetchExamProblems(
  sb: SupabaseClient,
  examId: string,
): Promise<DbProblem[]> {
  const { data, error } = await sb
    .from("exam_problems")
    .select(
      "problems!inner(id, source_name, source_number, content_latex, solution_latex, answer_json, deleted_at)",
    )
    .eq("exam_id", examId)
    .limit(1000);
  if (error) throw new Error(`exam ${examId}: ${error.message}`);
  return (
    (data || []) as unknown as Array<{
      problems: DbProblem & { deleted_at: string | null };
    }>
  )
    .map((r) => r.problems)
    .filter((p) => p && !p.deleted_at);
}

/** 학교기출 시험지 전체 (id, title) — 1,000행 잘림 방지 페이지네이션 */
async function fetchAllExams(
  sb: SupabaseClient,
): Promise<Array<{ id: string; title: string }>> {
  const out: Array<{ id: string; title: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("exams")
      .select("id, title")
      .is("deleted_at", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`exams: ${error.message}`);
    out.push(...((data || []) as Array<{ id: string; title: string }>));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
  const sb = loadSupabase();

  const mydbs = JSON.parse(fs.readFileSync(args.mydbs, "utf-8")) as Array<{
    id: number;
    title: string;
  }>;
  const titleOf = new Map(mydbs.map((d) => [d.id, d.title]));

  const files = fs
    .readdirSync(DIR)
    .filter((f) => /^bundle_\d+\.hml$/.test(f))
    .sort();
  const report = {
    apply: APPLY,
    bundles: 0,
    skippedBundles: [] as string[],
    items: 0,
    matched: 0,
    noDbProblem: 0,
    filled: 0,
    alreadyHad: 0,
    noSolution: 0,
    uploadFail: 0,
    answerDiffs: [] as Array<{
      problemId: string;
      db: number;
      no: number;
      title: string;
      ours: string;
      mathsecr: string;
    }>,
    missingInDb: [] as Array<Record<string, unknown>>,
    chapters: [] as Array<{
      problemId: string;
      chapter: string[];
      db: number;
      no: number;
    }>,
    byContent: 0,
    pollutedAnswers: 0,
    pollutedFixed: 0,
    emptyAnswers: 0,
    emptyFilled: 0,
    examRoutes: {} as Record<string, string>,
  };

  // 우리 시험지 색인: `23-1-2-M 동인고 수학(하)` → key 23-1-2-M, school 동인고. 유사/변형본 제외.
  const examIndex = new Map<
    string,
    Array<{ id: string; title: string; school: string }>
  >();
  for (const e of await fetchAllExams(sb)) {
    const m = e.title.match(/^(\d{2})-(\d)-(\d)-([MF])\s+(\S+)/);
    if (!m || /유사|변형/.test(e.title)) continue;
    const key = `${m[1]}-${m[2]}-${m[3]}-${m[4]}`;
    (examIndex.get(key) || examIndex.set(key, []).get(key)!).push({
      id: e.id,
      title: e.title,
      school: m[5],
    });
  }

  for (const f of files) {
    const no = f.match(/\d+/)![0];
    if (ONLY && !ONLY.has(no)) continue;
    const metaPath = path.join(DIR, `bundle_${no}.json`);
    if (!fs.existsSync(metaPath)) {
      report.skippedBundles.push(`${no}: json 없음`);
      continue;
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as BundleMeta;
    const items: WorksheetItem[] = parseWorksheetHml(
      fs.readFileSync(path.join(DIR, f)),
    );

    // 담은 순서 = JS 객체 키 순서(정수 키 오름차순) — 브라우저에서 Object.values(L.cells) 로 담았다.
    //   (손으로 담은 묶음은 meta.order 에 [시험지id, 번호] 순서를 직접 적는다)
    //   ★ 같은 셀이 두 시험지에 다 들어 있으면(같은 문제 재출제) 수학비서는 한 번만 담는다(bundle 036 실측) →
    //     첫 자리만 남기고, 나머지 자리는 aliases 로 같은 해설을 받는다.
    const expected: Array<{
      db: number;
      no: number;
      aliases: Array<{ db: number; no: number }>;
    }> = [];
    if (meta.order)
      for (const [db, qn] of meta.order)
        expected.push({ db, no: qn, aliases: [] });
    else {
      const seen = new Map<number, (typeof expected)[number]>();
      for (const [db, cells] of Object.entries(meta.cells))
        for (const c of cells) {
          const prev = seen.get(c[0]);
          if (prev) {
            prev.aliases.push({ db: Number(db), no: c[1] });
            continue;
          }
          const e = { db: Number(db), no: c[1], aliases: [] };
          seen.set(c[0], e);
          expected.push(e);
        }
    }
    if (expected.length !== items.length) {
      report.skippedBundles.push(
        `${no}: 문항 수 불일치 (담은 ${expected.length} / 출제본 ${items.length})`,
      );
      continue;
    }
    let titleHits = 0,
      titleMiss = 0;
    items.forEach((it, i) => {
      if (it.sourceTitle === titleOf.get(expected[i].db)) {
        if (it.number === expected[i].no) titleHits++;
        else titleMiss++;
      }
    });
    if (titleMiss > 0 || titleHits < items.length * MIN_TITLE_HIT) {
      report.skippedBundles.push(
        `${no}: 순서 검산 실패 (일치 ${titleHits}, 어긋남 ${titleMiss}, 전체 ${items.length})`,
      );
      continue;
    }
    report.bundles++;
    report.items += items.length;

    // 후보 문제: ① source_name 의 __db-{id} ② 없으면 같은 연도·학기·고사·학교의 우리 시험지(유사 제외)
    const byDb = new Map<number, DbProblem[]>();
    for (const db of new Set(
      expected.flatMap((e) => [e.db, ...e.aliases.map((a) => a.db)]),
    )) {
      let cands = await fetchByDbId(sb, db);
      let via = "db";
      if (!cands.length) {
        const k = examKeyFromMathsecrTitle(titleOf.get(db) || "");
        // 학교명: 정확히 같은 것 우선. 없을 때만 한쪽이 다른 쪽을 포함(3글자 이상 — `여고` 같은 꼬리로 여러 학교가 걸리지 않게).
        const pool = k ? examIndex.get(k.key) || [] : [];
        let hits = pool.filter(
          (e) => e.school.replace(/\s/g, "") === k!.school.replace(/\s/g, ""),
        );
        if (!hits.length)
          hits = pool.filter(
            (e) => schoolCore(e.school) === schoolCore(k!.school),
          );
        if (!hits.length)
          hits = pool.filter((e) => {
            const a = e.school.replace(/\s/g, ""),
              b = k!.school.replace(/\s/g, "");
            return (
              Math.min(a.length, b.length) >= 3 &&
              (a.includes(b) || b.includes(a))
            );
          });
        // 같은 학교·학기에 여러 장(수학1·수학2 등)이면 과목으로 좁힌다. 그래도 여러 장이면 합쳐 두고
        // 문항마다 「같은 번호 중 본문이 가장 비슷한 것 하나」만 고른다(아래 single 처리).
        if (hits.length > 1 && k!.subject) {
          const sub = subjectNorm(k!.subject);
          const bySub = hits.filter(
            (e) => subjectNorm(e.title.split(/\s+/).slice(2).join("")) === sub,
          );
          if (bySub.length) hits = bySub;
        }
        if (hits.length > 4) hits = []; // 지나치게 많으면 학교명 짝이 잘못된 것 — 안 붙인다
        for (const e of hits)
          cands.push(...(await fetchExamProblems(sb, e.id)));
        via = hits.length
          ? `title:${hits.map((h) => h.title).join("|")}`
          : "none";
      }
      byDb.set(db, cands);
      report.examRoutes[String(db)] = via;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      for (const { db, no: qn } of [expected[i], ...expected[i].aliases]) {
        const cands = byDb.get(db) || [];
        // 같은 번호 + 본문 일치 → 없으면 본문이 가장 비슷한 문제(더 엄격한 기준)
        let targets = cands.filter(
          (p) =>
            p.source_number === qn &&
            similarity(p.content_latex || "", it.stem) >= SIM_OK,
        );
        // 제목으로 찾은 시험지(여러 장 합침)면 가장 비슷한 하나만 — 다른 시험지의 같은 번호에 붙지 않게
        if (
          targets.length > 1 &&
          !String(report.examRoutes[String(db)] || "").startsWith("db")
        ) {
          targets = [
            targets
              .map((p) => ({
                p,
                s: similarity(p.content_latex || "", it.stem),
              }))
              .sort((a, b) => b.s - a.s)[0].p,
          ];
        }
        if (!targets.length && cands.length) {
          const best = cands
            .map((p) => ({ p, s: similarity(p.content_latex || "", it.stem) }))
            .sort((a, b) => b.s - a.s)[0];
          if (best && best.s >= 0.8) {
            targets = [best.p];
            report.byContent++;
          }
        }
        if (!targets.length) {
          report.noDbProblem++;
          const same = cands.find((p) => p.source_number === qn);
          const best = cands
            .map((p) => ({ p, s: similarity(p.content_latex || "", it.stem) }))
            .sort((a, b) => b.s - a.s)[0];
          report.missingInDb.push({
            db,
            no: qn,
            title: titleOf.get(db) || "",
            candidates: cands.length,
            simSameNo: same
              ? Number(similarity(same.content_latex || "", it.stem).toFixed(2))
              : null,
            bestSim: best ? Number(best.s.toFixed(2)) : null,
            bestNo: best?.p.source_number ?? null,
            ours: same ? normText(same.content_latex || "").slice(0, 60) : "",
            theirs: normText(it.stem).slice(0, 60),
          });
          continue;
        }
        for (const p of targets) {
          report.matched++;
          if (it.chapter.length)
            report.chapters.push({
              problemId: p.id,
              chapter: it.chapter,
              db,
              no: qn,
            });
          const ours = String(
            p.answer_json?.finalAnswer ?? p.answer_json?.correct_answer ?? "",
          );
          if (it.answer && normAns(ours) !== normAns(it.answer)) {
            // 9월 적재분: 서답형 정답 칸에 `값[해설]…풀이 전문` 이 통째로 들어간 사고(10-25 파서 수정 전).
            const head = ours.split(/\[\s*해\s*설\s*\]/)[0];
            const polluted =
              head !== ours && normAns(head) === normAns(it.answer);
            if (polluted) {
              report.pollutedAnswers++;
              if (APPLY && FIX_POLLUTED) {
                const aj = { ...(p.answer_json || {}) } as Record<
                  string,
                  unknown
                >;
                if (typeof aj.finalAnswer === "string")
                  aj.finalAnswer = head.trim();
                if (typeof aj.correct_answer === "string")
                  aj.correct_answer = head.trim();
                const { error } = await sb
                  .from("problems")
                  .update({ answer_json: aj })
                  .eq("id", p.id);
                if (error) throw new Error(`answer ${p.id}: ${error.message}`);
                report.pollutedFixed++;
              }
            } else if (!ours.trim()) {
              // 우리 정답이 비어 있음 → 수학비서 정답으로 채운다(덮어쓰기 아님).
              //   객관식은 ①~⑤(복수 허용)만 신뢰 — 안전 가드 #3.
              const isObj = p.answer_json?.type === "multiple_choice";
              const okObj = /^[①②③④⑤]$/.test(it.answer.trim());
              report.emptyAnswers++;
              if (APPLY && FILL_EMPTY && (!isObj || okObj)) {
                const aj = {
                  ...(p.answer_json || {}),
                  finalAnswer: it.answer.trim(),
                  correct_answer: it.answer.trim(),
                };
                const { error } = await sb
                  .from("problems")
                  .update({ answer_json: aj })
                  .eq("id", p.id);
                if (error) throw new Error(`answer ${p.id}: ${error.message}`);
                report.emptyFilled++;
              }
            } else {
              report.answerDiffs.push({
                problemId: p.id,
                db,
                no: qn,
                title: titleOf.get(db) || "",
                ours: ours.slice(0, 120),
                mathsecr: it.answer,
              });
            }
          }
          if (!it.solution) {
            report.noSolution++;
            continue;
          }
          if ((p.solution_latex || "").trim() && !OVERWRITE) {
            report.alreadyHad++;
            continue;
          }
          if (!APPLY) {
            report.filled++;
            continue;
          }
          let fails = 0;
          const sol = await materializeSolution(
            it.solution,
            it.solutionImages,
            solutionUploader(sb, p.id, () => {
              fails++;
            }),
          );
          report.uploadFail += fails;
          const { error } = await sb
            .from("problems")
            .update({ solution_latex: sol })
            .eq("id", p.id);
          if (error) throw new Error(`update ${p.id}: ${error.message}`);
          report.filled++;
        }
      }
    }
    console.log(`bundle ${no}: ${items.length}문항 처리`);
  }

  const out = path.join(DIR, `backfill-report${APPLY ? "" : "-dry"}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 1), "utf-8");
  const { answerDiffs, missingInDb, chapters, ...summary } = report;
  console.log(
    JSON.stringify(
      {
        ...summary,
        answerDiffs: answerDiffs.length,
        missingInDb: missingInDb.length,
        chapters: chapters.length,
        report: out,
      },
      null,
      1,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
