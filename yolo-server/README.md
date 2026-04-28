---
title: 과사람 YOLO 문제 영역 검출
emoji: 📐
colorFrom: blue
colorTo: green
sdk: docker
app_port: 8100
pinned: false
license: mit
short_description: 수학 시험지 PDF에서 문제 영역을 자동 검출하는 YOLOv8 추론 서버
---

# 과사람 YOLO 문제 영역 검출 서버

수학 시험지 PDF 페이지 이미지에서 문제 영역을 자동 검출하는 FastAPI + YOLOv8 추론 서버.

## 구조

- `server.py` — FastAPI 엔드포인트 (`/health`, `/detect`)
- `models/best.pt` — 학습된 YOLOv8n 단일 클래스(`problem`) 모델
- `Dockerfile` — Python 3.11-slim + CPU PyTorch + ultralytics

## 엔드포인트

- `GET /health` — `{ ok, model_loaded, model_path, classes }`
- `POST /detect` — multipart/form-data: `image_base64`, `confidence`, `page_number`

## 학습 데이터

수학비서 시험지·내신 시험지 자동크롭 워크플로우의 사용자 보정 bbox(`detection_annotations`) 누적 → YOLOv8n epochs=80 학습. mAP50 ≈ 0.98.

## 사용처

[과사람 수학프로그램](https://github.com/snaker8/wp-math-science-project) 의 자산화 워크플로우에서 자동 영역 검출용으로 호출됨. 환경변수 `YOLO_SERVER_URL` 로 연결.
