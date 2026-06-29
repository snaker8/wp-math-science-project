import { describe, it, expect } from 'vitest';

// stripOrphanTabular 실제 구현 복제(검증용) — .tsx 비export 함수와 동일 로직
function stripOrphanTabular(text: string): string {
  if (!text || text.indexOf('\\begin{tabular}') < 0 && text.indexOf('\\end{tabular}') < 0 && text.indexOf('\\hline') < 0) return text;
  if (text.includes('[도형]')) {
    text = text.replace(/\\begin\{tabular\}\s*\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g, (full, inner: string) =>
      inner.includes('[도형]')
        ? inner.replace(/\\hline/g, '').replace(/\s*&\s*/g, ' ').replace(/\\\\(?![A-Za-z])/g, ' ').replace(/[ \t]{2,}/g, ' ').trim()
        : full);
  }
  const begins = (text.match(/\\begin\{tabular\}/g) || []).length;
  const ends = (text.match(/\\end\{tabular\}/g) || []).length;
  if (begins === ends && begins > 0) return text;
  if (begins === 0 && ends === 0) return text.replace(/\\hline/g, '').replace(/[ \t]{2,}/g, ' ').trim();
  return text
    .replace(/\\begin\{tabular\}\s*\{[^}]*\}/g, '')
    .replace(/\\end\{tabular\}/g, '')
    .replace(/\\hline/g, '')
    .replace(/\s*&\s*/g, ' ')
    .replace(/\\\\(?![A-Za-z])/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const imgTable = '\\begin{tabular}{|l|l|l|}\\hline [도형] & [도형] & [도형] \\\\ \\hline [1개] & [2개] & [3개] \\\\ \\hline\\end{tabular}';
const dataTable = '\\begin{tabular}{|l|l|}\\hline $x$ & $1$ \\\\ \\hline\\end{tabular}';
const feeBox = '\\begin{tabular}{|c|}\\hline $A$원 \\\\ \\hline $B$원 \\\\ \\hline\\end{tabular}';
const orphanOpen = '적절한 것은?\n\\begin{tabular}{|l|l|l|l|}\\hline';

describe('stripOrphanTabular', () => {
  it('★ 이미지 표 → 인라인(마크업 제거, 도형·캡션 보존)', () => {
    const out = stripOrphanTabular(imgTable);
    expect(out).not.toContain('tabular');
    expect(out).not.toContain('\\hline');
    expect(out).toContain('[도형]');
    expect(out).toContain('1개');
  });
  it('★★ 텍스트 데이터 표(도형 없음) → 그대로 보존(격자)', () => {
    expect(stripOrphanTabular(dataTable)).toBe(dataTable);
  });
  it('★★ 요금박스(도형 없음) → 그대로 보존', () => {
    expect(stripOrphanTabular(feeBox)).toBe(feeBox);
  });
  it('★ orphan(짝 안 맞음) → 마크업 제거', () => {
    const out = stripOrphanTabular(orphanOpen);
    expect(out).not.toContain('tabular');
    expect(out).toContain('적절한 것은?');
  });
  it('★ 이미지 표 + 데이터 표 혼합 → 이미지만 인라인, 데이터표 보존', () => {
    const mixed = `${imgTable} 그리고 ${dataTable}`;
    const out = stripOrphanTabular(mixed);
    expect(out).toContain(dataTable); // 데이터 표 보존
    expect(out).toContain('[도형]');
    expect(out.match(/\\begin\{tabular\}/g)?.length).toBe(1); // 데이터표 1개만 남음
  });
});

// 디스플레이 승격 가드(경남고 #5) — $...\begin{array}...\end{array}...$ → $$ 승격하되,
//   \left( / \left[ / \left| 로 감싼 인라인 행렬·행벡터는 승격 금지(문장 중간 가로 유지).
//   MixedContentRenderer.tsx 2-4a 단계 로직과 동일.
function promoteDisplay(result: string): string {
  return result.replace(
    /(?<!\$)\$([^$\n]*?\\begin\{(?:array|cases|aligned)\}[\s\S]*?\\end\{(?:array|cases|aligned)\}[^$\n]*?)\$(?!\$)/g,
    (_m, inner: string) => {
      if (/\\left\s*[([|]\s*\\begin\{array\}/.test(inner)) return _m;
      return `$$${inner}$$`;
    }
  );
}
describe('디스플레이 승격 가드 (인라인 행렬 vs 연립방정식)', () => {
  it('★ \\left( 로 감싼 행벡터 보기는 인라인 유지($$ 승격 X)', () => {
    const s = '제 3 행은 $\\left(\\begin{array}{lll}6 & 8 & 0\\end{array}\\right)$이다.';
    expect(promoteDisplay(s)).toBe(s); // 변화 없음 = 인라인
  });
  it('★ \\left[ 로 감싼 행렬도 인라인 유지', () => {
    const s = '$\\left[\\begin{array}{cc}1 & 2\\\\3 & 4\\end{array}\\right]$';
    expect(promoteDisplay(s)).toBe(s);
  });
  it('★★ 맨몸 array(연립방정식)는 디스플레이로 승격', () => {
    const s = '$\\begin{array}{l}x+y=1\\\\x-y=3\\end{array}$';
    expect(promoteDisplay(s)).toContain('$$');
  });
  it('★★ cases(연립방정식)는 디스플레이로 승격', () => {
    const s = '$\\begin{cases}x+y=1\\\\x-y=3\\end{cases}$';
    expect(promoteDisplay(s)).toContain('$$');
  });
});

// 테두리 조건박스 isChoiceTabular 변환(예문여고 #16) — \hline 제거 + 문장끝 "다." 오인 금지.
//   MixedContentRenderer.tsx isChoiceTabular 변환부와 동일 로직.
function convertChoiceTabular(m: string): string {
  const MTX = String.fromCharCode(1);
  const nestedEnvs: string[] = [];
  const mProtected = m.replace(
    /\\begin\{((?:p|b|v|B|V)?matrix|cases|aligned)\}[\s\S]*?\\end\{\1\}/g,
    (env) => { nestedEnvs.push(env); return MTX + (nestedEnvs.length - 1) + MTX; }
  );
  let converted = mProtected
    .replace(/\\begin\{(?:tabular|array)\}(?:\{[^}]*\})?/, '')
    .replace(/\\end\{(?:tabular|array)\}/, '')
    .replace(/\\hline\s*/g, ' ')
    .replace(/\s*###\s*/g, ' ')
    .replace(/\s*\\\\\s*/g, '\n')
    .replace(/\s*&\s*/g, ' ')
    .replace(/<?\s*보기\s*>?\s*/g, '')
    .replace(/\\quad\s*/g, ' ')
    .trim();
  converted = converted.replace(/\\text\s*\{([^}]*)\}/g, '$1');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])가\s*([.)])/g, 'ㄱ$1');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])나\s*([.)])/g, 'ㄴ$1');
  converted = converted.replace(/(?<![가-힣A-Za-z0-9(（])다\s*([.)])/g, 'ㄷ$1');
  converted = converted.replace(/([ㄱㄴㄷㄹㅁ])\s*([.)])/g, '\n$1$2');
  converted = converted.replace(/(^|\n)[ \t]*[\(（\)）][ \t]*(?=\n|$)/g, '$1');
  converted = converted.replace(/\n{2,}/g, '\n');
  converted = converted.replace(new RegExp(MTX + '(\\d+)' + MTX, 'g'), (_m, i) => nestedEnvs[Number(i)] || '');
  return '\n' + converted.trim() + '\n';
}
describe('테두리 조건박스 변환 (예문여고 #16/#18 실제 원본=괄호형 (가)(나)(다))', () => {
  // 실제 parseHml 결과: 라벨은 (가)(나) — ㄱ/ㄴ 아님. \hline 테두리 박스.
  const box = '\\begin{tabular}{|c|}\\hline (가) 부등식 $P \\left(x \\right) \\geq -x-4$의 해는 $1 \\le x \\le 2$이다. \\\\ \\hline (나) 방정식 $P \\left(x \\right)=2x-7$은 중근을 가진다. \\\\ \\hline\\end{tabular}';
  const out = convertChoiceTabular(box);
  it('★ \\hline 이 raw 로 남지 않음', () => {
    expect(out).not.toContain('hline');
  });
  it('★★ 원본 괄호 라벨 (가)(나) 보존 — ㄱ/ㄴ 로 안 바뀜', () => {
    expect(out).toContain('(가)');
    expect(out).toContain('(나)');
    expect(out).not.toContain('ㄱ');
    expect(out).not.toContain('ㄴ');
  });
  it('★ 단독 "(" 잔재 줄 없음 (괄호 보존이라 애초에 안 쪼개짐)', () => {
    expect(out).not.toMatch(/(^|\n)[ \t]*\([ \t]*(\n|$)/);
  });
  it('★★ 문장 끝 "이다."/"가진다." 온전', () => {
    expect(out).toContain('이다.');
    expect(out).toContain('가진다.');
  });
});

// 조건박스 보기라벨 오인 회귀(온천중 #5) — 문장 끝 "…것이다." 의 "다." 를 보기 라벨로 보면 안 됨.
const hasGanaLabels = (s: string) => /(?<![가-힣A-Za-z0-9])[가나다라마]\s*[.)]/.test(s);
describe('hasGanaLabels (조건박스 vs 진짜 보기)', () => {
  it('★ 문장 끝 "…이다." "…것이다." 는 보기 라벨 아님', () => {
    expect(hasGanaLabels('평행이동한 것이다.')).toBe(false);
    expect(hasGanaLabels('기울기는 $b$이다.')).toBe(false);
    expect(hasGanaLabels('점을 지난다.')).toBe(false);
  });
  it('★ 줄/셀 시작 "가./나./다." 진짜 보기 라벨은 잡음', () => {
    expect(hasGanaLabels('가. 자연수 $x$')).toBe(true);
    expect(hasGanaLabels('\\hline 가. $x$ & 나. $y$')).toBe(true);
  });
});

describe('동인고 #16 — (가)(나)(다) 조건박스 안 행렬 보존', () => {
  // 실제 parseHml 결과 형태
  const box = '\\begin{tabular}{|c|}\\hline (가) 양수 $k$에 대하여 $A \\left( \\begin{matrix}1 & 2 \\\\ -1 & 1\\end{matrix} \\right)= \\left( \\begin{matrix}0 & k \\\\ 0 & 2k\\end{matrix} \\right)$ \\\\ \\hline (나) $B \\left( \\begin{matrix}1 \\\\ -1\\end{matrix} \\right)= \\left( \\begin{matrix}0 \\\\ 0\\end{matrix} \\right)$이다. \\\\ \\hline (다) $A B =4A$이고, $B A =6B$이다. \\\\ \\hline\\end{tabular}';
  const out = convertChoiceTabular(box);
  it('★ 행렬 \\begin{matrix} 가 보존됨', () => {
    expect(out).toContain('\\begin{matrix}');
    expect(out).toContain('\\end{matrix}');
  });
  it('★★ 행렬 안 열구분 & · 행구분 \\\\ 가 살아있음', () => {
    expect(out).toContain('1 & 2');     // 열구분 보존
    expect(out).toContain('1 \\\\ -1'); // 행구분 보존
  });
  it('★ (가)(나)(다) 라벨 보존(ㄱ/ㄴ/ㄷ 로 안 바뀜)', () => {
    expect(out).toContain('(가)');
    expect(out).toContain('(나)');
    expect(out).toContain('(다)');
  });
  it('★ \\hline raw 노출 없음', () => {
    expect(out).not.toContain('hline');
  });
});
