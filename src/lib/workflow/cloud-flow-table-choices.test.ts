// 보기표가 OCR 한 줄(\begin{tabular}…①…⑤…)로 올 때 — ① 때문에 보기 줄로 먼저 잡혀 choices 가 표 토막으로
// 채워지고 표 객관식 감지가 건너뛰어졌다. 2026-10-29 대표: "표로 읽었는데 저걸 객관식으로 바로 들어가게 해야지".
import { describe, it, expect } from 'vitest';
import { groupLinesIntoQuestions } from './cloud-flow';

function line(text: string, y: number): any {
  return { text, text_display: text, type: 'text', region: { top_left_x: 10, top_left_y: y, width: 500, height: 20 } };
}

describe('groupLinesIntoQuestions — 한 줄 보기표', () => {
  it('㉠~㉥ 6열 보기표가 표 객관식(choiceHeaders + 5보기)으로 들어간다', () => {
    const explain = String.raw`\begin{tabular}{|l|l|}\hline [자료1] & \begin{tabular}[t]{l}직사각형은 ㉠ 사각형이다.\end{tabular} \\ \hline [자료2] & \begin{tabular}[t]{l}마름모는 ㉣ 사각형이다.\end{tabular} \\ \hline\end{tabular}`;
    const choiceTable = String.raw`\begin{tabular}{|c|c|c|c|c|c|c|}\hline & ㉠ & ㉡ & ㉢ & ㉣ & ㉤ & ㉥ \\ \hline ① & Ⓐ & Ⓒ & Ⓔ & Ⓐ & Ⓒ & Ⓕ \\ \hline ② & Ⓐ & Ⓓ & Ⓔ & Ⓑ & Ⓒ & Ⓔ \\ \hline ③ & Ⓐ & Ⓓ & Ⓔ & Ⓑ & Ⓓ & Ⓔ \\ \hline ④ & Ⓑ & Ⓒ & Ⓔ & Ⓐ & Ⓓ & Ⓔ \\ \hline ⑤ & Ⓑ & Ⓓ & Ⓕ & Ⓑ & Ⓒ & Ⓔ \\ \hline\end{tabular}`;
    const page: any = {
      pageWidth: 1000, pageHeight: 1400,
      lineData: [
        line('12. [자료1], [자료2]는 두 대각선이 서로를 이등분함을 설명하는 과정이다. ㉠~㉥에 들어갈 내용으로 옳은 것은?', 100),
        line(explain, 130),
        line(choiceTable, 300),
        line('13. 다음 문제', 600),
      ],
    };
    const q = groupLinesIntoQuestions([page]).find((r) => r.questionNumber === 12)!;
    expect(q.choiceHeaders).toEqual(['㉠', '㉡', '㉢', '㉣', '㉤', '㉥']);
    expect(q.choices).toHaveLength(5);
    expect(q.choices[0]).toBe('① Ⓐ | Ⓒ | Ⓔ | Ⓐ | Ⓒ | Ⓕ');
    expect(q.choices[4]).toBe('⑤ Ⓑ | Ⓓ | Ⓕ | Ⓑ | Ⓒ | Ⓔ');
    // 설명표는 본문에 남고, 보기표는 빠진다
    expect(q.contentMmd).toContain('[자료1]');
    expect(q.contentMmd).toContain('[자료2]');
    expect(q.contentMmd).not.toContain('Ⓕ');
  });

  it('보기가 따로 ①~⑤ 줄로 오면 종전대로 (데이터 표는 본문에 남음)', () => {
    const dataTable = String.raw`\begin{tabular}{|c|c|c|}\hline $x$ & 1 & 2 \\ \hline $y$ & 3 & 4 \\ \hline\end{tabular}`;
    const page: any = {
      pageWidth: 1000, pageHeight: 1400,
      lineData: [
        line('3. 표를 보고 옳은 것은?', 100),
        line(dataTable, 130),
        line('① 1 ② 2 ③ 3 ④ 4 ⑤ 5', 250),
        line('4. 다음 문제', 600),
      ],
    };
    const q = groupLinesIntoQuestions([page]).find((r) => r.questionNumber === 3)!;
    expect(q.choiceHeaders).toBeUndefined();
    expect(q.choices).toEqual(['1', '2', '3', '4', '5']);
    expect(q.contentMmd).toContain('tabular');
  });
});
