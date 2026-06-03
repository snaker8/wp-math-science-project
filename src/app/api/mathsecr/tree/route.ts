// GET /api/mathsecr/tree — 수학비서 분류 트리 API
// ?subject=07 → 해당 과목 트리 반환
// 파라미터 없으면 → 과목 목록만 반환

import { NextRequest, NextResponse } from 'next/server';
import mathsecrTree from '../../../../../mathsecr_complete.json';

// ★ 2026-06-03 perf: 정적 분류 트리(인증·DB 無, URL 의 ?subject 로만 분기) → CDN 캐싱.
//   시드/재배포 시에만 변경 → 1일 fresh + 7일 stale-while-revalidate.
//   force-dynamic 제거 필수(no-store 를 강제해 캐싱을 막으므로).
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
};

interface TreeNode {
  t: string;
  c: string;
  ch?: TreeNode[];
}

const CODE_TO_NAME: Record<string, string> = {
  '01': '중1-1', '02': '중1-2', '03': '중2-1', '04': '중2-2',
  '05': '중3-1', '06': '중3-2',
  '07': '공통수학1', '08': '공통수학2', '09': '대수',
  '10': '미적분1', '11': '확률과 통계', '12': '미적분2', '13': '기하',
};

// 주요 13과목만 (14-18 특수과목 제외)
const MAIN_SUBJECT_CODES = new Set(Object.keys(CODE_TO_NAME));

function loadTree(): TreeNode[] {
  return mathsecrTree as unknown as TreeNode[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const subjectCode = searchParams.get('subject');

  const tree = loadTree();
  const mainSubjects = tree.filter(s => MAIN_SUBJECT_CODES.has(s.c));

  const subjects = mainSubjects.map(s => ({
    code: s.c,
    name: CODE_TO_NAME[s.c] || s.t,
  }));

  if (!subjectCode) {
    return NextResponse.json({ subjects }, { headers: CACHE_HEADERS });
  }

  const subject = tree.find(s => s.c === subjectCode);
  if (!subject) {
    return NextResponse.json({ subjects, tree: null, error: '과목을 찾을 수 없습니다.' }, { headers: CACHE_HEADERS });
  }

  return NextResponse.json({ subjects, tree: subject }, { headers: CACHE_HEADERS });
}
