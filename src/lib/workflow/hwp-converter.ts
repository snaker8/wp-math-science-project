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
 * Windows에서는 soffice.com을 우선 사용 (콘솔 출력이 올바르게 동작)
 */
async function findLibreOffice(): Promise<string> {
  const isWindows = process.platform === 'win32';

  const candidates = isWindows
    ? [
        // Windows: .com이 콘솔 모드에서 더 안정적
        'C:\\Program Files\\LibreOffice\\program\\soffice.com',
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
      ]
    : [
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
  // ★ 고유 사용자 프로필 디렉토리 (다른 LibreOffice 인스턴스와 충돌 방지)
  const userInstallDir = path.join(tmpDir, 'user');
  const ext = fileName?.toLowerCase().endsWith('.hwpx') ? '.hwpx' : '.hwp';
  const inputPath = path.join(tmpDir, `input${ext}`);
  const outputPath = path.join(tmpDir, 'input.pdf');

  try {
    // 임시 파일에 HWP 저장
    await writeFile(inputPath, Buffer.from(fileBuffer));

    // LibreOffice 경로 찾기
    const soffice = await findLibreOffice();
    console.log(`[HWP→PDF] LibreOffice: ${soffice}`);

    // ★ 기존 좀비 프로세스 정리 (Windows에서 이전 headless 인스턴스가 남아있으면 새 변환이 행됨)
    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        exec('taskkill /F /IM soffice.bin 2>NUL', { timeout: 5000 }, () => resolve());
      });
      // 프로세스 종료 대기
      await new Promise(r => setTimeout(r, 500));
    }

    // ★ 변환 실행 (-env:UserInstallation으로 프로필 충돌 방지)
    const userInstallUrl = process.platform === 'win32'
      ? `file:///${userInstallDir.replace(/\\/g, '/')}`
      : `file://${userInstallDir}`;

    await new Promise<void>((resolve, reject) => {
      const cmd = `"${soffice}" --headless --norestore --nolockcheck "-env:UserInstallation=${userInstallUrl}" --convert-to pdf --outdir "${tmpDir}" "${inputPath}"`;
      console.log(`[HWP→PDF] Command: ${cmd}`);

      // ★ Python 환경변수 격리: 시스템 Python(3.14)이 LibreOffice 내장 Python(3.12)과 충돌 방지
      const cleanEnv = { ...process.env };
      delete cleanEnv.PYTHONSTARTUP;
      delete cleanEnv.PYTHONPATH;
      delete cleanEnv.PYTHON_BASIC_REPL;
      // LibreOffice 내장 Python 경로 설정
      const loDir = soffice.replace(/[/\\](soffice\.(com|exe))$/i, '');
      const loPythonCore = path.join(loDir, 'python-core-3.12.12');
      cleanEnv.PYTHONHOME = loPythonCore;
      // UNO_PATH도 설정 (LibreOffice UNO 런타임용)
      cleanEnv.UNO_PATH = loDir;
      // PATH에서 시스템 Python 경로 제거 + LibreOffice program 디렉토리 우선 추가
      const pathKey = cleanEnv.PATH ? 'PATH' : (cleanEnv.Path ? 'Path' : 'PATH');
      cleanEnv[pathKey] = [loDir, ...(cleanEnv[pathKey] || '').split(path.delimiter)
        .filter(p => !p.toLowerCase().includes('python'))
      ].join(path.delimiter);

      const child = exec(cmd, { timeout: 60000, env: cleanEnv }, async (error, stdout, stderr) => {
        // stderr에서 실제 에러만 필터 (dep-*.d 파일 경고는 node-gyp 잔여물이므로 무시)
        const realStderr = (stderr || '').split('\n')
          .filter(line => !line.includes('Could not open file:') || !line.includes('.d'))
          .join('\n').trim();

        if (error) {
          console.error('[HWP→PDF] Conversion error:', error.message);
          if (realStderr) console.error('[HWP→PDF] stderr:', realStderr);

          // exit code 에러지만 PDF가 생성되었을 수 있음 (stderr 경고가 있어도 변환은 성공할 수 있음)
          try {
            await access(outputPath);
            console.log('[HWP→PDF] exit code 에러지만 PDF 파일 존재 → 성공 처리');
            resolve();
            return;
          } catch {
            reject(new Error(`LibreOffice 변환 실패: ${realStderr || error.message}`));
          }
        } else {
          console.log('[HWP→PDF] Conversion output:', stdout.trim());
          resolve();
        }
      });

      // ★ 안전장치: 50초 후에도 안 끝나면 강제 종료
      const killTimer = setTimeout(() => {
        console.warn('[HWP→PDF] 50초 타임아웃, 프로세스 강제 종료');
        child.kill('SIGKILL');
      }, 50000);

      child.on('exit', () => clearTimeout(killTimer));
    });

    // PDF 읽기
    const pdfBuffer = await readFile(outputPath);
    console.log(`[HWP→PDF] 변환 완료: ${pdfBuffer.length} bytes`);
    return pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength);
  } finally {
    // 임시 파일 정리
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
    // 사용자 프로필 디렉토리 정리 (재귀)
    const { rm } = await import('fs/promises');
    await rm(userInstallDir, { recursive: true, force: true }).catch(() => {});
    await rmdir(tmpDir).catch(() => {});
  }
}
