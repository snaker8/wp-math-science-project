/**
 * 신수학의 바이블 미적분 풀이집 PDF에서 해설 텍스트 추출
 * 실행: npx tsx scripts/extract-bible-solutions.ts
 */
import * as fs from 'fs';
import * as path from 'path';

// pdfjs-dist legacy API for Node.js
async function extractPdfText(pdfPath: string, maxPages = 20): Promise<string[]> {
  // @ts-expect-error - legacy build path
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  console.log(`📄 총 ${pdf.numPages}페이지`);
  const pages: string[] = [];
  const limit = Math.min(maxPages, pdf.numPages);

  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push(text);
    if (i % 10 === 0) console.log(`  ${i}/${limit} 페이지 완료`);
  }
  return pages;
}

async function main() {
  const PDF_PATH = 'C:/Users/임세현/OneDrive/Documents/ClassIn Files/클래스 수업 자료/(♥미적분) 신수학의바이블 [PDF+HWP]/新수학의 바이블 미적분_풀이집.pdf';

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ PDF 파일 없음: ${PDF_PATH}`);
    process.exit(1);
  }

  console.log(`🔍 PDF 추출 시작: ${path.basename(PDF_PATH)}`);
  const pages = await extractPdfText(PDF_PATH, 30); // 처음 30페이지만 (샘플링)

  // 출력 디렉토리
  const OUT_DIR = path.join(process.cwd(), 'curriculum_data', 'textbook_solutions');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 페이지별 텍스트 저장
  const fullText = pages.map((t, i) => `\n\n========== Page ${i + 1} ==========\n${t}`).join('\n');
  const outPath = path.join(OUT_DIR, 'shinbible-mijeokbun-pulijip-sample.txt');
  fs.writeFileSync(outPath, fullText, 'utf8');

  console.log(`\n✅ 저장 완료: ${outPath}`);
  console.log(`📊 총 ${pages.length}페이지, ${fullText.length}자`);
  console.log(`\n샘플 (1페이지):`);
  console.log(pages[0]?.substring(0, 500) + '...');
}

main().catch(err => {
  console.error('❌ 에러:', err);
  process.exit(1);
});
