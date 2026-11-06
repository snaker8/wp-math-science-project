import { describe, it, expect } from 'vitest';
import { detectPreviewExam, shouldBlockPreviewExam } from './exam-preview-guard';

describe('detectPreviewExam — 예상 문제지 표시 감지', () => {
  it('★ 현대청운고 사고 파일명 — [미리보는중간] 태그', () => {
    expect(detectPreviewExam('1554296_[26년][1-1][중간][현대청운고][공통수학1][미리보는중간].hml')).toBe('미리보는');
  });
  it('PDF 업로드 파일명 — [미리보는중간][25사직중]', () => {
    expect(detectPreviewExam('[2026][2-1-M][미리보는중간][25사직중][문제].pdf')).toBe('미리보는');
  });
  it('예상 문제·시험대비·족보', () => {
    expect(detectPreviewExam('26-1-1-M 동래중 예상문제')).toBe('예상문제');
    expect(detectPreviewExam('동래중 1학기 중간 시험대비')).toBe('시험대비');
    expect(detectPreviewExam('동래중 족보 2026')).toBe('족보');
  });
  it('실제 내신·모의고사·교재는 통과', () => {
    expect(detectPreviewExam('내신 2026년 울산 동구 현대청운고 고1공통 1학기중간 공통수학1__db-514309.hml')).toBeNull();
    expect(detectPreviewExam('[22년][1-1][기말][해운대고][수학상]')).toBeNull();
    expect(detectPreviewExam('2026년 3월 고1 학력평가 수학')).toBeNull();
    expect(detectPreviewExam('쎈 공통수학1 2단원')).toBeNull();
    expect(detectPreviewExam(null, undefined, '')).toBeNull();
  });
  it('여러 이름 중 하나라도 걸리면 잡는다', () => {
    expect(detectPreviewExam('26-1-1-M 현대청운고 공통수학1', '…[미리보는중간].hml')).toBe('미리보는');
  });
});

describe('shouldBlockPreviewExam — 시중교재 명시만 통과', () => {
  const f = '[26년][1-1][중간][현대청운고][공통수학1][미리보는중간].hml';
  it('auto / school / 미지정 은 차단', () => {
    expect(shouldBlockPreviewExam('auto', f)).toBe('미리보는');
    expect(shouldBlockPreviewExam('school', f)).toBe('미리보는');
    expect(shouldBlockPreviewExam(undefined, f)).toBe('미리보는');
  });
  it('textbook 명시는 통과', () => {
    expect(shouldBlockPreviewExam('textbook', f)).toBeNull();
  });
});
