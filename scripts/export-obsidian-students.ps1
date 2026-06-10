# 학생 옵시디언 볼트 매일 자동 내보내기 (Windows 작업 스케줄러용 래퍼)
# 등록: schtasks /Create /SC DAILY /ST 06:00 /TN "과사람 학생볼트 내보내기"
#       /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File <이 파일 절대경로>"
$ErrorActionPreference = 'Continue'
Set-Location "C:\과사람 프로젝트\과사람 수학프로그램"
$vault = Join-Path $env:USERPROFILE "Documents\과사람학생볼트"
New-Item -ItemType Directory -Force $vault | Out-Null
$log = Join-Path $vault ".export.log"
"===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Out-File $log -Append -Encoding utf8
npx tsx scripts/export-obsidian-students.ts 2>&1 | Out-File $log -Append -Encoding utf8
