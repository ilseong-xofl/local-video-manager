# Local Video Manager 작업 지침

이 파일은 `local-video-manager` 저장소 전체에 적용한다. 현재 제품 범위는
`docs/product-scope.md`, 구현 단계는 `docs/implementation-plan.md`, 개발 및 Windows
검증 방식은 `docs/development.md`를 우선 확인한다.

## 프로젝트 역할

이 프로젝트는 멤버별 로컬 영상 폴더를 관리하고 편집하는 Windows Electron
애플리케이션이다. 영상과 사용자용 히스토리는 사용자 컴퓨터에 보관하고,
`local-video-manager-service`에는 인증·접근 확인과 캡션 생성만 요청한다.

## 담당 기능

- Electron main, 제한된 preload IPC 및 React renderer UI
- 로컬 영상 폴더 선택과 관리 폴더 전환
- 선택 폴더를 포함한 최대 3단계 영상 스캔
- 스트리밍 SHA-256 식별, 파일 위치 이력 및 scan cache
- 로컬 SQLite 기반 영상 메타데이터와 사용자 설정 보관
- 기간·파일명 검색, 정렬, 페이지 단위 영상 목록
- 운영체제 preview 기반 썸네일 cache와 로컬 byte-range 영상 재생
- 영상별 원본 URL·원본 캡션 등록과 변경 이력
- 과거 영상 검색과 URL·캡션 복사
- SQLite 무결성 검사, 백업·복원 및 폴더 재연결
- 영상 편집, 텍스트 영역 조절 및 결과 미리보기
- 캡션 언어, 스타일, 카피라이팅 선택과 랜덤 선택
- 생성 결과의 상단 문구, 하단 문구, 본문 캡션 표시
- 생성 옵션과 캡션 히스토리의 로컬 SQLite 저장
- 로그인 화면, 앱 접근 차단 및 주기적인 권한 재확인
- 로그인 화면은 `@ilscp.net` 앞의 회사 ID만 입력받고 Service 인증 요청 직전에 전체
  이메일 주소로 변환한다.
- Electron main process의 Service API client
- OS `safeStorage`를 사용한 Bearer 세션 보관
- Windows installer와 GitHub Releases 기반 자동 업데이트 코드

## 담당하지 않는 기능

- 관리자 웹과 관리자 계정 운영
- 일반 사용자 생성, 사용 중지, 비밀번호 재설정 및 세션 해제 정책
- 회사 IP/CIDR의 최종 신뢰 판정
- 서버 세션 발급, 계정 권한 원본 및 감사 로그
- OpenAI API 직접 호출과 API 키 보관
- 서버 프롬프트 원본과 캡션 결과 검증 규칙의 원본 관리
- PostgreSQL, 서버 migration 및 AWS 인프라
- 영상 원본·썸네일·전체 로컬 메타데이터의 중앙 저장
- 사용자 간 영상 공유, 팀 통합 영상 목록 또는 중복 비교

## Service 연동 경계

- 네트워크 요청은 Electron main process에서만 수행한다.
- renderer는 제한된 preload IPC만 사용하며 세션 토큰을 볼 수 없어야 한다.
- Bearer 토큰은 `safeStorage`로 암호화하고 localStorage나 일반 SQLite에 저장하지
  않는다.
- 앱 시작과 주기적 재검사에서 Service의 접근 판정을 통과해야 본 화면을 사용한다.
- 회사 네트워크 밖, 계정 사용 중지, 앱 권한 해제 또는 Service 연결 실패 시
  fail-closed로 앱을 잠근다.
- 원본 캡션이 없으면 캡션 생성 버튼과 Service 호출을 모두 막는다.
- 랜덤 옵션은 Electron에서 한 번 확정한 뒤 언어·스타일·카피라이팅의 확정값만
  Service에 전달한다.
- Service에는 이전 캡션 히스토리를 보내지 않는다.
- Service가 반환한 `topText`, `bottomText`, `caption`과 선택 옵션은 로컬 히스토리에
  저장한다.
- API 계약 변경 시 `local-video-manager-service`의 공유 스키마와 문서를 먼저 확인하고
  양쪽 계약 테스트를 함께 갱신한다.

## 로컬 데이터 및 보안 불변 조건

- 영상 파일은 로컬에 유지하며 Service로 업로드하지 않는다.
- 다른 사용자의 영상·썸네일·메타데이터를 조회하는 기능을 만들지 않는다.
- renderer에 Node.js, 파일 시스템, 토큰 또는 서버 비밀값을 직접 노출하지 않는다.
- 인증서 오류를 무시하거나 서버 접근 실패 시 본 화면을 우회해서 열지 않는다.
- DB 복원 전 현재 DB를 보존하고 무결성 및 schema 검사를 유지한다.
- 개발 앱과 설치 앱이 같은 `userData`를 공유할 수 있으므로 디버깅 전에 설치 앱을
  종료하고 개발 앱도 한 인스턴스만 실행한다.

## 변경 및 검증 원칙

- Electron 전용 기능은 이 저장소에서 처리하고 서버 정책을 Electron에 복제하지
  않는다.
- 개발 표준은 Node.js `24.18.0`, pnpm `10.28.1`이다. 명령 실행 전 `nvm use
24.18.0`을 적용한다.
- Service를 `pnpm dev`로 띄운 로컬 개발에서 Electron은 기본으로
  `http://localhost:13080`을 사용한다. 특수한 테스트에서만
  `LOCAL_VIDEO_MANAGER_SERVICE_URL`로 덮어쓴다. Service의 `3000`은 신뢰 프록시 뒤의
  내부 포트이므로 Electron에서 직접 사용하지 않는다.
- Service의 `pnpm dev`와 `compose.smoke.yaml`은 모두 호스트 포트 `13080`을 사용하므로
  동시에 실행하지 않는다.
- 기본 검증은 `pnpm check`다.
- 패키징은 사용자 파일과 기존 `out` 산출물에 영향을 줄 수 있으므로 검증 목적으로
  임의 실행하지 않는다.
- 명시적인 승인 없이 의존성 업데이트, 버전 증가, commit, push, `pnpm package`,
  `pnpm make`, GitHub Release 또는 자동 업데이트 게시를 하지 않는다.

## 문서 유지

반복 적용할 기능 경계, 보안 불변 조건 또는 검증 규칙이 새로 확정되면 이 파일에
반영한다. 일회성 진행 상황, 임시 오류 로그 및 세션별 상태는 넣지 않는다.
