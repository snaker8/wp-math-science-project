// ============================================================================
// POST /api/debug/repair-links - 기존 문제들을 exam에 다시 연결
// exam_problems 테이블이 비어있을 때 사용
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabaseAdmin not configured' }, { status: 503 });
  }

  try {
    // 1. 활성 exams 조회
    const { data: exams } = await supabaseAdmin
      .from('exams')
      .select('id, title, description, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!exams || exams.length === 0) {
      return NextResponse.json({ error: 'No exams found' });
    }

    const results: any[] = [];

    for (const exam of exams) {
      // exam의 description에서 파일명 추출
      const fileNameMatch = exam.description?.match(/업로드.*?파일:\s*(.+?)(?:\s*\(|$)/);
      const fileName = fileNameMatch?.[1]?.trim();

      if (!fileName) {
        results.push({ examId: exam.id, examTitle: exam.title, status: 'skipped', reason: 'No filename in description' });
        continue;
      }

      // 2. 해당 파일에서 생성된 문제 조회 (source_name으로 매칭)
      const { data: problems, error: pErr } = await supabaseAdmin
        .from('problems')
        .select('id, created_at')
        .eq('source_name', fileName)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (pErr || !problems || problems.length === 0) {
        // source_name이 정확히 안 맞을 수 있으므로 like 검색도 시도
        const baseName = fileName.replace(/\.pdf$/i, '');
        const { data: problems2 } = await supabaseAdmin
          .from('problems')
          .select('id, created_at')
          .like('source_name', `%${baseName}%`)
          .is('deleted_at', null)
          .order('created_at', { ascending: true });

        if (!problems2 || problems2.length === 0) {
          results.push({ examId: exam.id, examTitle: exam.title, status: 'no_problems', fileName });
          continue;
        }

        // exam_problems에 이미 연결되어 있는지 확인
        const { count: existingCount } = await supabaseAdmin
          .from('exam_problems')
          .select('id', { count: 'exact', head: true })
          .eq('exam_id', exam.id);

        if (existingCount && existingCount > 0) {
          results.push({ examId: exam.id, examTitle: exam.title, status: 'already_linked', count: existingCount });
          continue;
        }

        // exam_problems INSERT
        const inserts = problems2.map((p, idx) => ({
          exam_id: exam.id,
          problem_id: p.id,
          sequence_number: idx + 1,
          points: 4,
        }));

        const { error: insertErr } = await supabaseAdmin
          .from('exam_problems')
          .insert(inserts);

        results.push({
          examId: exam.id,
          examTitle: exam.title,
          status: insertErr ? 'error' : 'linked',
          count: problems2.length,
          error: insertErr?.message || null,
          fileName,
        });
        continue;
      }

      // exam_problems에 이미 연결되어 있는지 확인
      const { count: existingCount } = await supabaseAdmin
        .from('exam_problems')
        .select('id', { count: 'exact', head: true })
        .eq('exam_id', exam.id);

      if (existingCount && existingCount > 0) {
        results.push({ examId: exam.id, examTitle: exam.title, status: 'already_linked', count: existingCount });
        continue;
      }

      // exam_problems INSERT
      const inserts = problems.map((p, idx) => ({
        exam_id: exam.id,
        problem_id: p.id,
        sequence_number: idx + 1,
        points: 4,
      }));

      const { error: insertErr } = await supabaseAdmin
        .from('exam_problems')
        .insert(inserts);

      results.push({
        examId: exam.id,
        examTitle: exam.title,
        status: insertErr ? 'error' : 'linked',
        count: problems.length,
        error: insertErr?.message || null,
        fileName,
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    return NextResponse.json({
      error: 'Unexpected error',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
