# CornField

로컬 비디오 전용 브라우저 플레이어입니다. 파일명은 유지한 채 메타데이터(DB)를 관리하고, 필요시 실제 파일명 변경까지 지원합니다.

## 주요 기능

- 로컬 비디오 폴더 스캔 및 자동 인덱싱
- 제목/설명/업로드일/태그/starring/카테고리/조회수 메타데이터 관리
- 화질 자동 판별(해상도 기반) 및 `720p 이상`, `1080p 이상` 필터
- 검색/정렬/페이지네이션
- 비디오 재생, pause, theater mode, fullscreen
- 좌우 방향키 스킵(5/10/15초, Settings에서 변경)
- 썸네일 업로드 + 현재 pause 프레임 캡처
- 태그/starring 클릭 탐색
- 관련 영상 추천(태그/starring/카테고리 기반)
- 댓글 추가/수정/삭제
- 플레이바 시점 메모 추가/수정/삭제

## 설치

```bash
npm install
```

## 실행

```bash
npm run dev
```

실행 후 브라우저에서 [http://127.0.0.1:4300](http://127.0.0.1:4300) 접속.

## 터미널 없이 실행(맥)

`scripts/start-player.command`를 더블클릭하면 자동으로:

1. 의존성 설치(최초 1회)
2. 서버 실행
3. 브라우저 열기

명령:

```bash
chmod +x scripts/start-player.command
```

## 사용 순서

1. 우측 상단 `⚙ Settings` 열기
2. `Library Folder Path` 입력 (절대 경로)
3. `Scan Library` 실행
4. 라이브러리에서 검색/필터/재생

## 프로젝트 구조

- `src/server.js`: Fastify API + 스트리밍 + 파일 작업
- `src/db.js`: SQLite 스키마/설정/관계 테이블 유틸
- `src/media-indexer.js`: 비디오 스캔 + ffprobe 해상도 추출
- `public/`: 브라우저 UI (`index.html`, `app.js`, `styles.css`)

## API 요약

- `PUT /api/settings`: 라이브러리 경로/스킵초/페이지 크기 저장
- `POST /api/library/scan`: 라이브러리 스캔
- `GET /api/videos`: 검색/필터/정렬 목록 조회
- `GET /api/videos/:id`: 상세 조회
- `PUT /api/videos/:id/metadata`: 메타데이터 저장
- `POST /api/videos/:id/rename`: 실제 파일명 변경
- `POST /api/videos/:id/thumbnail/upload`: 썸네일 업로드
- `POST /api/videos/:id/thumbnail/capture`: 현재 프레임 썸네일 저장
- 댓글/메모/관련영상/조회수 증가 엔드포인트 포함
