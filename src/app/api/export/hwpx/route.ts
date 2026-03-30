// ============================================================================
// HWPX Export API Route
// Python HWP COM을 호출하여 HWPX 시험지 생성
// POST /api/export/hwpx
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  let inputPath = '';
  let outputPath = '';

  try {
    const body = await req.json();

    // 임시 파일 경로 (한글 경로 문제 방지를 위해 프로젝트 내 .tmp 사용)
    const tmpDir = path.join(process.cwd(), '.tmp');
    await fs.mkdir(tmpDir, { recursive: true });
    const timestamp = Date.now();
    inputPath = path.join(tmpDir, `input_${timestamp}.json`);
    outputPath = path.join(tmpDir, `output_${timestamp}.hwpx`);

    // JSON 데이터를 임시 파일로 저장
    await fs.writeFile(inputPath, JSON.stringify(body, null, 2), 'utf-8');

    // 디버그: 입력 데이터 저장
    const debugPath = path.join(process.cwd(), 'temp_hwpx_debug.json');
    await fs.writeFile(debugPath, JSON.stringify(body, null, 2), 'utf-8');
    console.log('[HWPX] Debug input saved to', debugPath);

    // Python 스크립트 경로
    const scriptPath = path.join(process.cwd(), 'scripts', 'generate-hwpx.py');

    // Python 실행
    const { stdout, stderr } = await execFileAsync('python', [
      scriptPath,
      inputPath,
      outputPath,
    ], {
      timeout: 60000,
      windowsHide: false, // HWP COM은 GUI 윈도우 필요
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    if (stderr) {
      console.error('[HWPX] Python stderr:', stderr);
    }

    // 결과 파싱
    const result = JSON.parse(stdout.trim());
    if (!result.success) {
      throw new Error('HWPX generation failed');
    }

    // 파일 읽기
    const fileBuffer = await fs.readFile(outputPath);

    // 파일명
    const filename = body.title
      ? `${body.title}.hwpx`
      : 'exam.hwpx';

    // 응답
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/hwp+zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  } catch (error: any) {
    // execFile 에러에는 stderr가 포함됨
    const stderr = error.stderr || '';
    const stdout = error.stdout || '';
    console.error('[HWPX] Generation error:', error.message);
    console.error('[HWPX] stderr:', stderr);
    console.error('[HWPX] stdout:', stdout);
    return NextResponse.json(
      { error: `${error.message}\n${stderr}`.slice(0, 500) },
      { status: 500 }
    );
  } finally {
    // 임시 파일 정리
    try { if (inputPath) await fs.unlink(inputPath); } catch {}
    try { if (outputPath) await fs.unlink(outputPath); } catch {}
  }
}
