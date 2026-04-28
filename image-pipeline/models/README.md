# YOLO 모델 폴더

`image-pipeline/models/best.pt` 를 여기에 두면 server.py 가 자동 로드.

## 설치 방법

1. Colab 학습 결과(`runs/detect/train-2/weights/best.pt`) 다운로드
2. **이 폴더(`image-pipeline/models/`)에 `best.pt` 파일 배치**
3. `pip install -U ultralytics` 실행 (requirements.txt 갱신됨)
4. server.py 재시작 — 콘솔에 `[YOLO] Loaded model: ./models/best.pt` 출력

## 환경 변수

```
YOLO_MODEL_PATH=./models/best.pt   # 기본값. 다른 경로 쓰려면 .env 에 설정
```

## 동작 확인

```bash
curl -X POST http://localhost:8200/detect-problems-yolo \
  -F "file=@/path/to/test.png" -F "imgsz=1024" -F "conf=0.25"
```

→ JSON 응답에 `detections` 배열. 정규화된 (x,y,w,h) 좌상단 좌표.

## 모델 파일 git 제외

`.gitignore` 로 `*.pt` 제외. 모델은 별도로 배포(각 개발자가 로컬에 배치).
파일이 작으면(<10MB) 직접 commit 도 가능.
