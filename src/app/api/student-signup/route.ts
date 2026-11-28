// ============================================================================
// 학생 스스로 가입 (QR) — 2026-11-28 대표 「QR 을 찍으면 가입 안 된 학생은 가입 창부터.
//   이름 · 학원 · 아이디 · 비번 · 학부모 전화번호, 매쓰홀릭과 같게」
// ----------------------------------------------------------------------------
// GET  → 고를 수 있는 학원 목록 [{ id, label, prefix }]  (로그인 없이)
// POST { name, instituteId, suffix?, studentPhone?, password, parentPhone }
//   아이디는 서버가 정한다 (학생이 남의 이름 아이디를 못 만들게):
//     · 학원에 접두어가 있으면  접두어 + 이름 (+ 동명이인 숫자 suffix)   예) EDG홍길동, EDG홍길동2
//     · 없으면                 학생 휴대폰 번호                          (엄궁차수학 — 대표 「전화번호 그대로」)
//   가입하면 바로 쓴다 (대표 「바로 사용」). 같은 학원·같은 이름의 명단 학생이 정확히 1명이면 이어 붙인다.
//   → { email } 를 돌려주고, 화면이 그 이메일+비번으로 로그인한다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { nameLoginIdToEmail, normalizeLoginId, phoneToStudentEmail } from '@/lib/students/phone-id';

export const dynamic = 'force-dynamic';

interface InstituteRow { id: string; name: string; student_id_prefix: string | null; organizations: { name: string } | null }

async function loadInstitutes() {
  // ★ institutes↔organizations 관계가 둘(소속·본부)이라 외래키 이름을 꼭 적는다 (PGRST201)
  const { data, error } = await supabaseAdmin!
    .from('institutes')
    .select('id, name, student_id_prefix, organizations!institutes_organization_id_fkey(name)')
    .order('name');
  if (error) console.error('[student-signup] 학원 목록 실패:', error.message);
  return ((data ?? []) as unknown as InstituteRow[]).map((r) => ({
    id: r.id,
    label: [r.organizations?.name, r.name].filter(Boolean).join(' '),
    prefix: r.student_id_prefix ? normalizeLoginId(r.student_id_prefix) : null,
  }));
}

export async function GET() {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  return NextResponse.json({ institutes: await loadInstitutes() });
}

const digitsOf = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }

  const name = String(body.name ?? '').normalize('NFC').replace(/\s+/g, '');
  const instituteId = String(body.instituteId ?? '');
  const suffix = digitsOf(body.suffix).slice(0, 2);
  const password = String(body.password ?? '');
  const parentPhone = digitsOf(body.parentPhone);
  const studentPhone = digitsOf(body.studentPhone);

  if (!/^[가-힣A-Za-z]{2,10}$/.test(name)) return NextResponse.json({ error: '이름은 한글·영문 2~10자로 적어 주세요' }, { status: 400 });
  if (password.length < 4) return NextResponse.json({ error: '비밀번호는 4자 이상으로 정해 주세요' }, { status: 400 });
  if (parentPhone.length < 9 || parentPhone.length > 11) return NextResponse.json({ error: '학부모 전화번호를 확인해 주세요' }, { status: 400 });

  const inst = (await loadInstitutes()).find((i) => i.id === instituteId);
  if (!inst) return NextResponse.json({ error: '학원을 골라 주세요' }, { status: 400 });

  // 아이디 → 로그인 이메일
  let loginId: string;
  let email: string | null;
  if (inst.prefix) {
    loginId = normalizeLoginId(inst.prefix + name + suffix);
    email = nameLoginIdToEmail(loginId);
    if (!email) return NextResponse.json({ error: '이름이 너무 길어 아이디를 만들 수 없습니다' }, { status: 400 });
  } else {
    if (studentPhone.length < 9 || studentPhone.length > 11) {
      return NextResponse.json({ error: '아이디로 쓸 학생 휴대폰 번호를 확인해 주세요' }, { status: 400 });
    }
    loginId = studentPhone;
    email = phoneToStudentEmail(studentPhone)!;
  }

  // 이미 있는 아이디 → 동명이인이면 비어 있는 숫자를 제안
  const { data: existing } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  if (existing) {
    if (!inst.prefix) return NextResponse.json({ error: '이미 가입된 휴대폰 번호입니다. 로그인해 주세요', code: 'exists' }, { status: 409 });
    let suggest: string | null = null;
    for (let n = 2; n <= 20; n++) {
      const cand = normalizeLoginId(inst.prefix + name + n);
      const e = nameLoginIdToEmail(cand);
      if (!e) break;
      const { data: taken } = await sb.from('users').select('id').eq('email', e).maybeSingle();
      if (!taken) { suggest = String(n); break; }
    }
    return NextResponse.json({
      error: `${loginId} 은(는) 이미 있는 아이디입니다. 본인이면 로그인하고, 같은 이름의 다른 학생이면 아이디 뒤에 숫자를 붙여 주세요`,
      code: 'exists', suggestSuffix: suggest,
    }, { status: 409 });
  }

  // 계정 만들기 — user_metadata 에 institute_id 필수 (handle_new_auth_user 트리거가 읽는다)
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: name, role: 'STUDENT', institute_id: inst.id, phone: inst.prefix ? null : studentPhone, signup: 'qr' },
  });
  if (createErr || !created.user) {
    const raw = (createErr?.message || '').toLowerCase();
    return NextResponse.json(
      { error: raw.includes('already') ? '이미 있는 아이디입니다. 로그인해 주세요' : '가입에 실패했습니다. 잠시 뒤 다시 해 주세요', code: raw.includes('already') ? 'exists' : undefined },
      { status: raw.includes('already') ? 409 : 500 },
    );
  }
  const userId = created.user.id;

  const { error: upErr } = await sb.from('users').upsert({
    id: userId, email, full_name: name, phone: inst.prefix ? null : studentPhone,
    role: 'STUDENT', institute_id: inst.id, subject_tracks: ['math'], active_subject_track: 'math',
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (upErr) {
    await sb.auth.admin.deleteUser(userId).catch(() => {});
    console.error('[student-signup] users 저장 실패:', upErr.message);
    return NextResponse.json({ error: '가입에 실패했습니다. 잠시 뒤 다시 해 주세요' }, { status: 500 });
  }
  // 트리거가 먼저 만든 행에도 학부모 번호가 들어가게 따로 쓴다
  const { error: ppErr } = await sb.from('users').update({ parent_phone: parentPhone }).eq('id', userId);
  if (ppErr) console.warn('[student-signup] parent_phone 저장 실패:', ppErr.message);

  // 명단(계정 없이 채점된 학생)과 이어 붙이기 — 같은 학원·같은 이름 미연결 1명일 때만 (동명이인 오연결 차단)
  try {
    const { data: roster } = await sb.from('roster_students').select('id')
      .eq('institute_id', inst.id).eq('full_name', name).is('promoted_user_id', null);
    const rows = (roster ?? []) as Array<{ id: string }>;
    if (rows.length === 1) {
      const { error: mErr } = await sb.rpc('merge_roster_into_user', { p_roster_id: rows[0].id, p_user_id: userId });
      if (mErr) console.warn('[student-signup] 명단 이어 붙이기 실패(가입은 정상):', mErr.message);
    } else if (rows.length > 1) {
      console.warn(`[student-signup] 같은 이름 명단 ${rows.length}명 — 자동 연결 보류`);
    }
  } catch (e) {
    console.warn('[student-signup] 명단 단계 예외(가입은 정상):', (e as Error).message);
  }

  return NextResponse.json({ ok: true, email, loginId });
}
