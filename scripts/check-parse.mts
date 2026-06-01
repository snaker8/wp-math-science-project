// 13번 실제 content 파싱 검증 — 본문이 안 먹히는지
import { parseContent } from '../src/lib/export/hwpx-generator';

const content = `상수 $k(-1<k<1)$에 대하여 $x$에 대한 방정식
$$\\cos x=k \\ (0 \\leq x<2\\pi)$$

의 두 근을 각각 $\\alpha, \\beta \\ (\\alpha<\\beta)$라 할 때, <보기>에서 옳은 것만을 있는 대로 고른 것은?
<보기>

ㄱ. $\\alpha+\\frac{\\beta-\\alpha}{2}=\\pi$
ㄴ. $0<k<1$ 이면 $\\cos \\frac{\\beta-\\alpha}{2}>0$이다.
ㄷ. $\\cos \\frac{\\beta-\\alpha}{2}=\\frac{5}{13}$ 이면 $\\sin \\alpha=\\frac{12}{13}$이다.`;

const segs = parseContent(content);
console.log('세그먼트 수:', segs.length);
for (const s of segs) {
  console.log(`[${s.type}] ${JSON.stringify(s.value).slice(0, 90)}`);
}
// 핵심 검증: 본문 텍스트가 살아있나
const allText = segs.filter(s => s.type === 'text').map(s => s.value).join(' ');
console.log('\n본문 보존 체크:');
console.log('  "두 근을 각각" 살아있나:', allText.includes('두 근을 각각'));
console.log('  "이면" 살아있나:', allText.includes('이면'));
console.log('  "<보기>" 살아있나:', allText.includes('<보기>'));
console.log('  equation에 "0 < k < 1" 있나:', segs.some(s => s.type === 'equation' && s.value.includes('0 < k < 1') || s.value.includes('0<k<1')));
