import { describe, it, expect } from 'vitest';
import { detectTabularChoices } from './tabular-choices';

// ============================================================================
// 표 객관식 자동 감지 — content 안 \begin{tabular}(헤더행+①~⑤) → choiceHeaders + choices.
// 사직중 23-2-1 #13 실데이터 기반. PDF/OCR·HML 두 경로 공용.
// ============================================================================

describe('detectTabularChoices — 표 객관식 블록 → choiceHeaders/choices', () => {
  it('★ 사직중 #13 실데이터 (헤더 2셀 + ①~⑤ 5행)', () => {
    const content = String.raw`연립방정식의 해와 $a+c$의 값을 순서대로 배열하면?
\begin{tabular}{|l|l|l|}& 연립방정식의 해 & $a+c$의 값 \\ ① & 해가 무수히 많다. & $0$ \\ ② & 해가 무수히 많다. & $-2$ \\ ③ & 해가 무수히 많다. & $-4$ \\ ④ & 해가 없다. & $0$ \\ ⑤ & 해가 없다. & $-4$ \\ \end{tabular}`;
    const r = detectTabularChoices(content);
    expect(r).not.toBeNull();
    expect(r!.choiceHeaders).toEqual(['연립방정식의 해', '$a+c$의 값']);
    expect(r!.choices).toHaveLength(5);
    expect(r!.choices[0]).toBe('① 해가 무수히 많다. | $0$');
    expect(r!.choices[4]).toBe('⑤ 해가 없다. | $-4$');
    // 표는 본문에서 제거되고 stem 만 남는다
    expect(r!.content).toContain('순서대로 배열하면?');
    expect(r!.content).not.toContain('tabular');
  });

  it('(1)~(5) 괄호 라벨 형식도 인식', () => {
    const content = String.raw`다음 중 옳은 것은? \begin{tabular}{|l|l|l|}& A & B \\ (1) & 5 & 3 \\ (2) & 6 & 2 \\ (3) & 7 & 1 \\ \end{tabular}`;
    const r = detectTabularChoices(content);
    expect(r).not.toBeNull();
    expect(r!.choiceHeaders).toEqual(['A', 'B']);
    expect(r!.choices).toEqual(['① 5 | 3', '② 6 | 2', '③ 7 | 1']);
  });

  it('★ 데이터 표(라벨 아님)는 미발동 — null (오탐 0)', () => {
    // x/y 값 표: 첫 열이 ①②③ 가 아니라 데이터
    const content = String.raw`표를 보고 답하시오. \begin{tabular}{|l|l|l|}$x$ & 1 & 2 \\ $y$ & 3 & 4 \\ \end{tabular}`;
    expect(detectTabularChoices(content)).toBeNull();
  });

  it('헤더 셀 수 ≠ 보기 셀 수면 미발동', () => {
    const content = String.raw`\begin{tabular}{|l|l|}& 값 \\ ① & 1 & 2 \\ ② & 3 & 4 \\ ③ & 5 & 6 \\ \end{tabular}`;
    expect(detectTabularChoices(content)).toBeNull();
  });

  it('라벨 행 2개뿐이면 미발동 (최소 3)', () => {
    const content = String.raw`\begin{tabular}{|l|l|}& A \\ ① & 1 \\ ② & 2 \\ \end{tabular}`;
    expect(detectTabularChoices(content)).toBeNull();
  });

  it('표가 없으면 null', () => {
    expect(detectTabularChoices('그냥 텍스트 문제입니다.')).toBeNull();
  });

  it('★ 설명표(표 안의 표) 뒤의 6열 보기표 — 두 번째 표까지 보고, 설명표는 온전히 남긴다', () => {
    const content = String.raw`[자료1], [자료2]는 각각 직사각형과 마름모의 두 대각선이 서로를 이등분함을 설명하는 과정이다. ㉠~㉥에 들어갈 내용으로 옳은 것은?
\begin{tabular}{|l|l|}\hline [자료1] & \begin{tabular}[t]{l}직사각형은 ㉠ 사각형이다. \\ 따라서 두 대각선은 서로를 이등분한다.\end{tabular} \\ \hline [자료2] & \begin{tabular}[t]{l}마름모는 ㉣ 사각형이다. \\ 따라서 두 대각선은 서로를 이등분한다.\end{tabular} \\ \hline\end{tabular}
\begin{tabular}{ccccccc}& ㉠ & ㉡ & ㉢ & ㉣ & ㉤ & ㉥ \\ ① & Ⓐ & Ⓒ & Ⓔ & Ⓐ & Ⓒ & Ⓕ \\ ② & Ⓐ & Ⓓ & Ⓔ & Ⓑ & Ⓒ & Ⓔ \\ ③ & Ⓐ & Ⓓ & Ⓔ & Ⓑ & Ⓓ & Ⓔ \\ ④ & Ⓑ & Ⓒ & Ⓔ & Ⓐ & Ⓓ & Ⓔ \\ ⑤ & Ⓑ & Ⓓ & Ⓕ & Ⓑ & Ⓒ & Ⓔ \\ \end{tabular}`;
    const r = detectTabularChoices(content);
    expect(r).not.toBeNull();
    expect(r!.choiceHeaders).toEqual(['㉠', '㉡', '㉢', '㉣', '㉤', '㉥']);
    expect(r!.choices).toHaveLength(5);
    expect(r!.choices[0]).toBe('① Ⓐ | Ⓒ | Ⓔ | Ⓐ | Ⓒ | Ⓕ');
    // 설명표는 바깥 \begin 부터 바깥 \end 까지 통째로 남아 있어야 한다
    expect(r!.content).toContain('[자료1]');
    expect(r!.content).toContain('[자료2]');
    expect((r!.content.match(/\\begin\{tabular\}/g) || []).length).toBe(3);
    expect((r!.content.match(/\\end\{tabular\}/g) || []).length).toBe(3);
  });

  it('설명표만 있고 보기표가 없으면 null (중첩 표 오탐 X)', () => {
    const content = String.raw`\begin{tabular}{|l|l|}\hline (1) & \begin{tabular}[t]{l}a\end{tabular} \\ (2) & b \\ (3) & c \\ (4) & d \\ \end{tabular}`;
    expect(detectTabularChoices(content)).toBeNull();
  });
});
