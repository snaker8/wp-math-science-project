// ============================================================================
// HWP → PDF 변환 (LibreOffice headless) — 서버 사이드 전용
// ★ 이 파일은 API Route에서만 import해야 합니다 (클라이언트 번들 X)
// ============================================================================

import { exec } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp, rmdir, access } from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * LibreOffice 실행 파일 경로 탐색
 */
async function findLibreOffice(): Promise<string> {
  const candidates = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ];

  for (const p of candidates) {
    try {
      await access(p);
      return p;
    } catch {
      // 이 경로에 없음
    }
  }

  // PATH에서 찾기 시도
  return 'soffice';
}

/**
 * HWP/HWPX 파일을 LibreOffice로 PDF로 변환
 * @returns PDF ArrayBuffer
 * @throws LibreOffice가 없거나 변환 실패 시 에러
 */
export async function convertHWPtoPDF(fileBuffer: ArrayBuffer, fileName?: string): Promise<ArrayBuffer> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'hwp-'));
  const ext = fileName?.toLowerCase().endsWith('.hwpx') ? '.hwpx' : '.hwp';
  const inputPath = path.join(tmpDir, `input${ext}`);
  const outputPath = path.join(tmpDir, 'input.pdf');

  try {
    // 임시 파일에 HWP 저장
    await writeFile(inputPath, Buffer.from(fileBuffer));

    // LibreOffice 경로 찾기
    const soffice = await findLibreOffice();
    console.log(`[HWP→PDF] LibreOffice: ${soffice}`);

    // 변환 실행
    await new Promise<void>((resolve, reject) => {
      const cmd = `"${soffice}" --headless --convert-to pdf --outdir "${tmpDir}" "${inputPath}"`;
      exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
        if (error) {
          console.error('[HWP→PDF] Conversion error:', error.message);
          if (stderr) console.error('[HWP→PDF] stderr:', stderr);
          reject(new Error(`LibreOffice 변환 실패: ${error.message}`));
        } else {
          console.log('[HWP→PDF] Conversion output:', stdout.trim());
          resolve();
        }
      });
    });

    // PDF 읽기
    const pdfBuffer = await readFile(outputPath);
    console.log(`[HWP→PDF] 변환 완료: ${pdfBuffer.length} bytes`);
    return pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength);
  } finally {
    // 임시 파일 정리
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
    await rmdir(tmpDir).catch(() => {});
  }
}
