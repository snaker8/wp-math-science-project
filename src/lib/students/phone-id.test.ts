import { describe, it, expect } from 'vitest';
import { nameLoginIdToEmail, normalizeLoginId, stripStudentDomain, studentLoginInputToEmail, isValidNameLoginId } from './phone-id';

describe('이름 아이디 (EDG홍길동)', () => {
  it('정규화: 공백·대소문자 차이는 같은 아이디', () => {
    expect(normalizeLoginId(' edg 홍길동 ')).toBe('EDG홍길동');
    expect(nameLoginIdToEmail('edg홍길동')).toBe(nameLoginIdToEmail('EDG 홍길동'));
  });
  it('이메일로 바꿨다가 화면용으로 되돌리면 원래 아이디', () => {
    const e = nameLoginIdToEmail('EDG홍길동')!;
    expect(e).toMatch(/^u[0-9a-f]+@local\.suzag\.com$/);
    expect(stripStudentDomain(e)).toBe('EDG홍길동');
  });
  it('로그인 칸: 전화번호·이메일·이름 아이디 구분', () => {
    expect(studentLoginInputToEmail('010-1234-5678')).toBe('01012345678@local.suzag.com');
    expect(studentLoginInputToEmail('a@b.com')).toBe('a@b.com');
    expect(studentLoginInputToEmail('EDG홍길동')).toBe(nameLoginIdToEmail('EDG홍길동'));
  });
  it('쓸 수 없는 아이디', () => {
    expect(isValidNameLoginId('홍')).toBe(false);
    expect(isValidNameLoginId('EDG홍길동!')).toBe(false);
    expect(isValidNameLoginId('EDG' + '가'.repeat(9))).toBe(false); // 3+27=30바이트 > 28
    expect(isValidNameLoginId('EDG홍길동2')).toBe(true);
  });
  it('기존 전화번호·임의 아이디 표시는 그대로', () => {
    expect(stripStudentDomain('01012345678@local.suzag.com')).toBe('01012345678');
    expect(stripStudentDomain('student-ab12cd34@local.suzag.com')).toBe('student-ab12cd34');
  });
});
