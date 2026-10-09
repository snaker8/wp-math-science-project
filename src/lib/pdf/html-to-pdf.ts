// ============================================================================
// HTML → PDF (서버, 헤드리스 크롬)
//
// ★ 2026-10-10 대표: "우리도 PDF 다운 버튼 만들자. 인쇄 들어가 하지 말고 매쓰홀릭처럼."
//   시험지 출력은 화면의 .exam-page DOM 을 복제해 window.print() 하는 구조(ExamPaperView.doPrint).
//   같은 복제 DOM(+스타일)을 그대로 받아 크롬 인쇄 엔진으로 PDF 를 만든다 → 브라우저 「PDF 로 저장」과
//   같은 벡터 PDF, 화면 = 인쇄 = PDF. 인쇄 파이프라인은 건드리지 않는다(불가침).
//
//   - Vercel(linux): @sparticuz/chromium (람다용 크롬) + puppeteer-core
//   - 로컬(win32/mac): 시스템 크롬 (PUPPETEER_EXECUTABLE_PATH 로 덮어쓰기 가능)
// ============================================================================

import fs from 'node:fs';
import type { Browser } from 'puppeteer-core';

const LOCAL_CHROME_CANDIDATES: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import('puppeteer-core');
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (!isServerless) {
    const candidates = envPath ? [envPath] : (LOCAL_CHROME_CANDIDATES[process.platform] || []);
    const found = candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
    if (found) {
      return puppeteer.launch({
        executablePath: found,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
      });
    }
    // 로컬에 크롬이 없으면 람다용 크롬으로 폴백 (linux 에서만 동작)
  }

  const chromium = (await import('@sparticuz/chromium')).default;
  return puppeteer.launch({
    args: [...chromium.args, '--font-render-hinting=none'],
    executablePath: await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 1200, height: 1600, deviceScaleFactor: 1 },
  });
}

export interface HtmlToPdfOptions {
  /** 페이지 로드·폰트·이미지 대기 상한(ms) */
  timeoutMs?: number;
}

/**
 * 완성된 HTML 문서(스타일 포함)를 A4 PDF 로.
 * - print 미디어로 렌더(puppeteer page.pdf 기본) → ExamPaperView 의 @media print 규칙이 그대로 적용.
 * - @page { size: A4; margin: 0 } 을 문서가 들고 있으므로 preferCSSPageSize.
 */
export async function htmlToPdf(html: string, opts: HtmlToPdfOptions = {}): Promise<Buffer> {
  const timeout = opts.timeoutMs ?? 60_000;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: ['load', 'networkidle0'], timeout } as Parameters<typeof page.setContent>[1]);
    // 폰트(Pretendard·KaTeX) 로드 완료 — 안 기다리면 수식 폭이 깨진 채 찍힌다 (doPrint 의 fonts.ready 와 동일)
    await page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready);
    // 이미지 디코드 완료
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); }))));
    });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout,
    });
    return Buffer.from(pdf);
  } finally {
    try { await browser.close(); } catch { /* ignore */ }
  }
}
