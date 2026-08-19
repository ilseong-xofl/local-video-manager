# Local Video Manager 구현 계획

각 단계는 동작 가능한 수직 슬라이스와 검증 결과를 남긴다.

## 0. 데스크톱 기반 — 현재 단계

- Electron Forge + React + TypeScript 구성
- sandboxed renderer와 typed preload IPC 구성
- SQLite와 `library_id` 영속화
- native folder picker와 폴더별 scan snapshot 연결
- Mac/Windows CI와 Squirrel updater 진입점 구성

검증:

- `library_id`가 DB 재실행 후 유지된다.
- 선택한 폴더가 DB에 유지된다.
- 폴더를 변경했다가 다시 선택해도 기존 scan cache가 유지된다.
- lint, typecheck, unit test가 Mac과 Windows에서 통과한다.
- Windows CI가 packaged app을 생성한다.

## 1. 폴더 스캔과 exact identity

- 지원 확장자 열거
- 선택 폴더를 포함한 최대 3단계 재귀 탐색
- 파일 크기·mtime cache
- 제한된 동시성의 streaming SHA-256
- 복사 중 파일의 stat 전후 변경 감지
- ffprobe 기술 metadata 추출
- scan run 진행률·취소·재시작

검증:

- 이름 변경은 같은 hash로 판정된다.
- 1 byte 변경은 다른 hash로 판정된다.
- 복사 중인 파일은 저장하지 않고 다음 스캔으로 미룬다.
- 한 파일 실패가 전체 스캔을 중단하지 않는다.

## 2. 목록·썸네일·재생

- 첫 유효 프레임 썸네일 생성과 cache
- 가상화된 영상 grid
- 파일명 부분검색
- 등록일·수정일 기간 filter와 오름차순·내림차순 정렬
- 승인된 root 안에서만 동작하는 local media protocol
- 플레이 팝업

검증:

- 1,000개 항목 목록을 메모리 급증 없이 탐색한다.
- root 밖 path와 변조된 IPC 요청을 거부한다.
- 현재 PC에 없는 파일은 재생 불가 상태로 표시한다.
- 모달을 닫으면 재생 스트림과 로컬 파일 handle을 해제한다.

## 3. 로컬 DB 백업·복원 — 구현 완료

- SQLite online backup으로 실행 중에도 일관된 백업 파일 생성
- schema version과 app version을 포함한 backup manifest
- 복원 전 백업 파일 무결성·schema 호환성 검사
- 복원 후 새 컴퓨터의 영상 root 재지정과 hash 기반 재연결
- DB 교체 전 현재 DB 자동 보존

검증:

- WAL에 미반영된 변경까지 하나의 백업 파일에 포함된다.
- 손상되었거나 호환되지 않는 백업은 현재 DB를 변경하지 않는다.
- 영상 root와 파일명이 달라져도 내용이 같은 영상은 기존 metadata에 다시 연결된다.
- 재인코딩되어 hash가 달라진 영상은 새 영상으로 판정된다.

## 4. 영상 편집과 서버 캡션 생성 — 구현 완료

- 로컬 영상 편집과 화면 텍스트 교체
- 영상 content hash 하나에 여러 캡션 생성 이력을 연결하는 1:N 구조
- 언어·스타일·카피라이팅 선택과 요청마다 새 캡션 생성
- 상단·하단 화면 문구와 본문 캡션 저장
- 관리자 등록 계정 로그인과 캡션 요청의 회사 네트워크 접근 검사
- 설정 메뉴에서 새 비밀번호 하나를 입력하는 본인 비밀번호 변경과 성공 후 자동 로그아웃
- OpenAI API 키를 별도 서비스에만 두는 호출 구조
- 사용자별 KST 하루 10회 생성 제한의 서버 사용량 표시와 10/10 버튼 비활성화

검증:

- 같은 영상에서 여러 번 생성해도 각 결과가 별도 이력으로 남는다.
- 새 요청이 과거 결과를 cache로 반환하지 않는다.
- 미인증 또는 앱 권한 없음 상태에서는 본 화면을 사용할 수 없다.
- 비밀번호 변경은 8~24자만 허용하고 대상 사용자 ID나 세션 토큰을 renderer에 노출하지
  않으며, 성공 시 로그인 화면으로 전환된다.
- 회사 밖에서도 본 화면은 사용할 수 있고 캡션 생성만 안내와 함께 거부된다.
- 성공 생성만 `n/10`에 반영되고 서버가 안내한 KST 자정 이후 다시 활성화된다.
- OpenAI API key와 Bearer 토큰이 renderer bundle에 포함되지 않는다.

사용자·권한·캡션 요청 관리는 `local-video-manager-service`가 담당한다.

## 5. Windows 배포

- Windows x64 installer
- 자동 업데이트 feed
- 앱 데이터 보존 migration
- 실제 Windows 폴더·외장 디스크·파일 잠금 점검
- 코드 서명과 release runbook

검증:

- 개발환경 없는 Windows PC에 설치된다.
- 새 버전을 자동 다운로드하고 다음 실행 시 적용한다.
- 업데이트 후 SQLite와 폴더 설정이 유지된다.
- 이전 버전에서 migration 실패 시 원본 DB를 보존한다.
