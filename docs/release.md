# Windows 배포와 자동 업데이트

## 현재 구현

- 공개 GitHub 저장소의 GitHub Releases 사용
- Squirrel.Windows installer maker
- package된 Windows 앱에서만 updater 활성화
- 실행 후 한 번 자동 update check
- background download
- 사용자 승인 dialog 없음
- download 완료 후 자동 재시작·설치
- GitHub 저장소 정보가 없으면 안전하게 비활성화

`update-electron-app`의 `ElectronPublicUpdateService`와 사용자 dialog를 만들지 않는 custom update callback을 사용한다. 앱 DB는 설치 directory가 아니라 Electron user-data directory에 있으므로 binary 교체와 분리된다.

GitHub Actions가 제공하는 `GITHUB_REPOSITORY` 값을 Windows 앱에 빌드 시 삽입한다. 따라서 GitHub owner와 repository 이름을 소스에 하드코딩하거나 별도 Repository variable로 등록하지 않는다.

## 릴리스 절차

1. `package.json`의 `version`을 올린다.
2. 변경사항을 커밋하고 원격 저장소에 push한다.
3. 같은 버전의 태그를 push한다. 예: 버전 `0.2.0`이면 `v0.2.0`.
4. `release-windows.yml`이 Windows x64 installer를 생성한다.
5. workflow가 `RELEASES`, `.nupkg`, installer `.exe`를 공개 GitHub Release에 올린다.

```bash
git tag v0.2.0
git push origin v0.2.0
```

태그와 `package.json` 버전이 다르면 workflow가 릴리스를 중단한다. GitHub Release 게시에는 Actions 기본 `GITHUB_TOKEN`만 사용하며 별도 AWS 계정, bucket, secret은 필요하지 않다.

## 자동 업데이트 흐름

1. 설치된 앱이 `update.electronjs.org/<owner>/<repo>/win32-x64/<version>`을 확인한다.
2. Electron 공식 서비스가 공개 GitHub Releases에서 최신 Windows artifact를 찾는다.
3. 새 버전이면 Squirrel이 `.nupkg`를 background로 다운로드한다.
4. 다운로드가 끝나면 앱이 자동 재시작되고 새 버전이 적용된다.

첫 릴리스는 설치 기준점이다. 실제 업데이트 검증은 첫 릴리스를 설치한 Windows 장비에서 더 높은 두 번째 버전을 게시해 수행한다.

## 아직 필요한 외부 준비

- GitHub 공개 저장소 생성과 remote 연결
- Windows code-signing certificate
- 실제 Windows x64 acceptance 장비

코드 서명이 없으면 prototype installer는 실행할 수 있지만 Windows 경고가 표시될 수 있다. 경영진 승인 후 정식 배포 전에 code signing을 release gate로 추가한다.
