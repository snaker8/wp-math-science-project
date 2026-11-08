# 학교 기출 분석 → 옵시디언 「과사람 지식창고/기출 분석」 매일 자동 내보내기 (Windows 작업 스케줄러용 래퍼)
# 등록: schtasks /Create /SC DAILY /ST 06:10 /TN "과사람 기출분석 볼트 내보내기"
#       /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File <이 파일 절대경로>"
# ★ npx 가 설치 확인을 물어 멈추던 사고(학생볼트 8/7~) → --yes 로 묻지 않게 한다.
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location "C:\과사람 프로젝트\과사람 수학프로그램"
$vault = "C:\옵시디언\과사람지식창고\과사람_지식창고\기출 분석"
New-Item -ItemType Directory -Force $vault | Out-Null
$log = Join-Path $vault ".export.log"
"===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Out-File $log -Append -Encoding utf8
npx --yes tsx scripts/export-obsidian-exams.ts 2>&1 | Out-File $log -Append -Encoding utf8
