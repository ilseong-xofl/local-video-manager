# 개발환경과 Windows 검증

## 버전 기준

- Node.js 24.18.0 LTS
- pnpm 10.28.1
- Electron 43.3.0
- Electron Forge 7.11.2

`.node-version`, `.nvmrc`, `packageManager`, lockfile을 기준으로 Mac과 CI의 도구 버전을 맞춘다.

## Mac 개발

Mac에서는 UI, SQLite, 폴더 선택, scan domain logic과 단위 테스트를 개발한다.

```bash
nvm install
nvm use
pnpm install
pnpm start
```

`better-sqlite3`는 native module이므로 Mac에서는 Mac용으로 설치되고, Forge가 Windows packaging 시 Windows용으로 다시 빌드한다. Mac의 `node_modules`를 Windows artifact에 복사하지 않는다.

## Windows 검증

GitHub Actions의 `windows-latest` x64 runner에서 다음을 새로 실행한다.

1. Node·pnpm 설치
2. lockfile 기반 의존성 설치
3. lint·typecheck·test·format 검사
4. Electron package 생성
5. release tag에서는 Squirrel.Windows installer 생성

실제 Windows 장비에서는 다음을 수동 점검한다.

- C/D 드라이브 및 한글·일본어·공백 path
- 외장 디스크 분리
- 복사 중 파일과 Windows file lock
- ffprobe·SQLite native binary
- 영상 codec 재생
- 설치·업데이트·삭제 후 사용자 데이터 보존

## 경로 규칙

- app data는 `app.getPath('userData')` 아래에 둔다.
- path는 Node `path` API로 조합한다.
- DB에는 선택 root와 상대 path를 분리해 저장한다.
- renderer에는 절대 path file API를 노출하지 않는다.
