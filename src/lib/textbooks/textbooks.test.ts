import { describe, expect, it } from 'vitest';
import { allowedLevels, isExpired, isTextbookManager, todayKst, validateAccessInput } from './access';
import { buildCatalog, formatSize, type TextbookFileRow } from './catalog';

const row = (p: Partial<TextbookFileRow>): TextbookFileRow => ({
  id: Math.random().toString(36).slice(2), level: '고등', course: '공통수학1', book: '쎈', kind: '본문',
  edition: null, file_name: 'x.pdf', size_bytes: 1, ...p,
});

describe('교재 권한', () => {
  it('관리자는 언제나 중등·고등 전부', () => {
    expect(isTextbookManager('ADMIN', false)).toBe(true);
    expect(isTextbookManager('TEACHER', true)).toBe(true);
    expect(isTextbookManager('ORG_ADMIN', false)).toBe(false);
    expect(allowedLevels({ manager: true, access: null })).toEqual(['중등', '고등']);
  });

  it('권한 줄이 없으면 아무것도 못 받는다', () => {
    expect(allowedLevels({ manager: false, access: null })).toEqual([]);
  });

  it('체크한 학교급만', () => {
    expect(allowedLevels({ manager: false, access: { can_middle: true, can_high: false, expires_at: null } }))
      .toEqual(['중등']);
  });

  it('만료일 당일까지는 되고 다음 날(한국 시각)부터 막힌다', () => {
    const access = { can_middle: true, can_high: true, expires_at: '2026-12-31' };
    // 2026-12-31 23:30 KST = 14:30 UTC
    expect(allowedLevels({ manager: false, access, now: new Date('2026-12-31T14:30:00Z') })).toEqual(['중등', '고등']);
    // 2027-01-01 00:10 KST = 2026-12-31 15:10 UTC
    expect(allowedLevels({ manager: false, access, now: new Date('2026-12-31T15:10:00Z') })).toEqual([]);
    expect(isExpired(null, '2030-01-01')).toBe(false);
    expect(todayKst(new Date('2026-12-31T15:10:00Z'))).toBe('2027-01-01');
  });

  it('관리 화면 입력 검사', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(validateAccessInput({ userId: id, canMiddle: true, canHigh: false, expiresAt: '' }))
      .toEqual({ ok: true, value: { userId: id, canMiddle: true, canHigh: false, expiresAt: null } });
    expect(validateAccessInput({ userId: 'x', canMiddle: true, canHigh: false }).ok).toBe(false);
    expect(validateAccessInput({ userId: id, canMiddle: 'y', canHigh: false }).ok).toBe(false);
    expect(validateAccessInput({ userId: id, canMiddle: true, canHigh: false, expiresAt: '2026-13-40' }).ok).toBe(false);
  });
});

describe('교재 목록 묶기', () => {
  it('과정은 학년 순, 중등이 먼저', () => {
    const cat = buildCatalog([
      row({ course: '대수' }), row({ course: '공통수학1' }), row({ level: '중등', course: '중2-1' }),
    ]);
    expect(cat.map((c) => c.course)).toEqual(['중2-1', '공통수학1', '대수']);
  });

  it('본문이 맨 앞, 같은 종류 여러 개는 판이나 번호로 구분', () => {
    const cat = buildCatalog([
      row({ book: '개념원리', kind: '해설', edition: null, file_name: 'a.pdf' }),
      row({ book: '개념원리', kind: '본문', edition: '2023', file_name: 'b.pdf' }),
      row({ book: '개념원리', kind: '본문', edition: null, file_name: 'c.pdf' }),
      row({ book: '개념원리', kind: '정답', edition: null, file_name: 'd.zip' }),
    ]);
    const labels = cat[0].books[0].files.map((f) => f.label);
    expect(labels).toEqual(['본문 1', '본문 2023', '정답', '해설']);
    expect(cat[0].books[0].files.find((f) => f.kind === '정답')?.ext).toBe('zip');
  });

  it('같은 판이 두 개면 번호까지 붙는다', () => {
    const cat = buildCatalog([
      row({ kind: '본문', edition: '22개정' }), row({ kind: '본문', edition: '22개정' }),
    ]);
    expect(cat[0].books[0].files.map((f) => f.label)).toEqual(['본문 22개정 1', '본문 22개정 2']);
  });

  it('크기 표기', () => {
    expect(formatSize(765_000_000)).toBe('765MB');
    expect(formatSize(1_200_000_000)).toBe('1.2GB');
    expect(formatSize(210_389)).toBe('210KB');
  });
});
