# Local Video Manager

멤버별 로컬 영상 폴더를 관리하는 Windows Electron 애플리케이션입니다. 개발은 Mac에서 하고, Windows x64 CI와 실제 Windows 장비에서 패키징·검증합니다.

## 현재 구현 범위

- 보안 설정이 적용된 Electron main/preload/renderer 구조
- React + TypeScript UI
- 네이티브 폴더 선택
- 설치별 `library_id` 생성 및 SQLite 영속화
- 선택한 영상 폴더 영속화
- 선택 폴더와 하위 폴더의 영상 재귀 스캔
- SHA-256 영상 식별과 변경되지 않은 파일의 hash cache
- 운영체제 영상 preview 기반 JPEG 썸네일 cache
- 고유 영상 24개 단위 페이지 그리드
- 해시 기반 local byte-range streaming 영상 재생 모달
- 공개 GitHub Releases 기반 Squirrel.Windows 자동 업데이트
- Mac/Windows 품질 검사와 Windows 패키징 CI

Auth, DB 백업·복원, 중앙 API와 Gemini는 아직 구현하지 않았습니다. 현재 범위의 기준은 [제품 범위](docs/product-scope.md)에 있습니다.

## 개발 시작

```bash
nvm install
nvm use
pnpm install
pnpm start
```

개발 표준은 Node.js 24.18.0과 pnpm 10.28.1입니다. 최종 Windows 사용자는 Node.js나 pnpm을 설치하지 않습니다.

## 검증 명령

```bash
pnpm check
pnpm package
```

- `pnpm check`: lint, typecheck, test, format 검사
- `pnpm package`: 현재 운영체제용 Electron package 생성
- Windows installer와 공개 GitHub Release는 `release-windows.yml`에서 생성

## 주요 문서

- [제품 범위](docs/product-scope.md)
- [Phase 1 구현 계획](docs/implementation-plan.md)
- [개발환경과 Windows 검증](docs/development.md)
- [자동 업데이트와 배포 준비](docs/release.md)

## 디렉터리

```text
src/main/       Electron main, SQLite, IPC, updater
src/preload/    renderer에 노출하는 제한된 API
src/renderer/   React UI
src/shared/     main/preload/renderer 공유 계약
docs/           현재 제품 결정과 실행 계획
RESEARCH/       기술 조사 원본
```
