import { describe, it, expect } from 'vitest';
import { decideInputMode, studentSafeAnswerJson, displayCorrectAnswer } from './answer-safe';

describe('studentSafeAnswerJson — 제출 전 학생에게 정답이 새지 않는다', () => {
  it('객관식: 정답 키를 모두 뺀다', () => {
    const safe = studentSafeAnswerJson({
      type: 'multiple_choice', choices: ['① 1', '② 2', '③ 3', '④ 4', '⑤ 5'],
      finalAnswer: '③', correct_answer: '③', choiceLayout: 3,
    })!;
    expect(safe.finalAnswer).toBeUndefined();
    expect(safe.correct_answer).toBeUndefined();
    expect(JSON.stringify(safe)).not.toContain('"③"');
    expect(safe.input_mode).toBe('objective');
    expect(safe.choice_count).toBe(5);
    expect(safe.choiceLayout).toBe(3);
  });

  it('숫자 단답: 입력 방식만 남는다', () => {
    const safe = studentSafeAnswerJson({ type: 'short_answer', finalAnswer: '30' })!;
    expect(safe.input_mode).toBe('numeric');
    expect(JSON.stringify(safe)).not.toContain('30');
  });

  it('서술형 소문제: 번호·배점만, 답 제외', () => {
    const safe = studentSafeAnswerJson({
      type: 'short_answer', finalAnswer: 'x=2', subQuestions: [{ number: '1', answer: 'x=2', points: 3 }],
    })!;
    expect(safe.input_mode).toBe('manual');
    expect(safe.subQuestions).toEqual([{ number: '1', points: 3 }]);
    expect(JSON.stringify(safe)).not.toContain('x=2');
  });

  it('answer_json 없음 → null', () => {
    expect(studentSafeAnswerJson(null)).toBeNull();
  });
});

describe('decideInputMode', () => {
  it('분수 정답은 숫자 입력', () => {
    expect(decideInputMode({ finalAnswer: '3/4' }).mode).toBe('numeric');
  });
  it('보기가 7개면 7칸', () => {
    expect(decideInputMode({ choices: ['1', '2', '3', '4', '5', '6', '7'] }).choiceCount).toBe(7);
  });
  it('수식 정답은 서술(선생님 확인)', () => {
    expect(decideInputMode({ finalAnswer: '$\\sqrt{2}$' }).mode).toBe('manual');
  });
});

describe('displayCorrectAnswer', () => {
  it('finalAnswer 우선', () => {
    expect(displayCorrectAnswer({ finalAnswer: '④', correct_answer: '③' })).toBe('④');
  });
});
