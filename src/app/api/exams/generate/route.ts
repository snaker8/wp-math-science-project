
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { title, criteria } = body;
        // criteria: { subject, chapters: string[], difficulty_distribution: Record<string, number> }

        // 1. Fetch random problems matching criteria
        // This is a simplified implementation. Real-world would be more complex.
        let query = supabase.from('problems').select('id, difficulty');

        // Filter by subject/chapter if possible. 
        // Since we don't have robust metadata, we might just fetch *all* active problems 
        // and filter in memory or ignore filters for MVP.
        // But let's try to match 'tags' or 'unit' if they exist.
        // 'problems' table has 'unit' (from my route.ts insert, I used 'unit' in 'exams', but 'problems' has 'ai_analysis' jsonb).
        // It's hard to filter by JSONB efficiently without indexes.

        query = query.eq('is_active', true);
        // query = query.in('unit', criteria.chapters); // If 'unit' column exists on problems

        const { data: candidates, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        if (!candidates || candidates.length === 0) {
            return NextResponse.json({ error: 'No problems found' }, { status: 404 });
        }

        // 2. Select problems based on difficulty distribution
        const selectedProblemIds: string[] = [];
        const needed = criteria.difficulty_distribution; // {'상': 5, '중': 10...} (mapped to 1-5)

        // Map difficulty strings to numbers
        const diffMap: Record<string, number> = { '최상': 5, '상': 4, '중': 3, '하': 2, '최하': 1 };

        // Simple random selection
        const available = [...candidates];
        // Shuffle
        for (let i = available.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [available[i], available[j]] = [available[j], available[i]];
        }

        // Pick requested number of problems
        // Ideally match difficulty. For now, just pick N random problems to satisfy total count?
        // Let's try to match difficulty.

        for (const levelStr in needed) {
            const count = needed[levelStr];
            const diffLevel = diffMap[levelStr];
            const matching = available.filter(p => p.difficulty === diffLevel);

            for (let i = 0; i < count && i < matching.length; i++) {
                selectedProblemIds.push(matching[i].id);
                // Remove from available to avoid duplicates (though difficulty check handles it)
            }
        }

        // If we didn't find enough matching difficulty, fill with randoms?
        // Or just proceed with what we have.

        if (selectedProblemIds.length === 0) {
            return NextResponse.json({ error: 'No matching problems found' }, { status: 400 });
        }

        // 3. Create Exam
        const { data: exam, error: examError } = await supabase
            .from('exams')
            .insert({
                title: title || '자동 생성된 시험지',
                created_by: user.id,
                status: 'DRAFT',
                problem_count: selectedProblemIds.length,
                grade: '고1', // Dummy
                subject: criteria.subject || '수학',
            })
            .select()
            .single();

        if (examError) throw examError;

        // 4. Link Problems
        const payload = selectedProblemIds.map((pid, idx) => ({
            exam_id: exam.id,
            problem_id: pid,
            order_index: idx + 1,
            points: 4
        }));

        const { error: linkError } = await supabase.from('exam_problems').insert(payload);
        if (linkError) throw linkError;

        return NextResponse.json({ success: true, examId: exam.id });

    } catch (error) {
        console.error('Exam generation failed', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
