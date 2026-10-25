# 도라가미 · 첫 번째 전장

승인된 잔디·흙 입체 타일과 파츠 조립 캐릭터로 만든 10열 × 16행(160칸)의 2.5D 전장입니다. 별도 패키지 설치·빌드·백엔드 없이 정적 호스팅으로 실행합니다.

Vercel에서는 Framework Preset을 **Other**, Output Directory를 **.**으로 설정하고 Build Command를 비웁니다. 저장소 루트의 `index.html`이 진입점입니다. GitHub Pages 등 일반 정적 호스팅도 사용할 수 있습니다. 모든 게임 이미지가 저장소에 포함되어 외부 이미지 호스트나 API 키가 필요하지 않습니다. 로컬 미리보기는 기존 정적 파일 미리보기 도구에서 저장소 루트를 열면 됩니다. ES 모듈과 이미지 설정을 불러오므로 `file://`로 직접 열지는 않습니다.

플레이 방법:

- **⚙ 디버그 → 기존 하단 조작 바 표시**를 켠 뒤 **소환**을 누르고 빈칸을 선택합니다. 시작 시 개나리 방패병와 개나리소환사가 배치됩니다. 캐릭터 선택으로 소환할 종류를 바꿀 수 있습니다. 기존 개나리용사·새싹힐러는 숨김 상태로 보관하며 현재 목록에는 새 캐릭터 6종을 표시합니다.
- 용사를 선택하고 빈칸을 누르면 다른 용사를 피해 한 칸씩 걸어갑니다.
- **공격**을 누른 뒤 다른 용사를 선택합니다. 멀리 있으면 인접한 칸까지 이동한 뒤 검을 휘두릅니다. 명중 시 체력이 25 감소하며, 체력 0이면 파츠가 무너지는 연출 뒤 퇴장합니다. 선택한 용사의 정확한 체력과 건강·부상·빈사 상태는 하단에서 확인합니다.
- 마우스/한 손가락 드래그로 보드 이동, 휠/두 손가락 핀치로 확대·축소합니다. 오른쪽 버튼으로 확대, 축소, 전장 맞춤을 할 수도 있습니다.
- 용사 선택을 해제한 뒤 빈 타일을 선택하면 해당 칸의 잔디·흙을 바꿀 수 있습니다. 보드 바깥이나 `Esc`로 선택을 해제합니다.
- 초기화는 지형과 용사, 진행 중인 동작을 처음 상태로 되돌립니다.
- 키보드: 전장에 포커스 후 방향키로 칸 탐색, `Enter`로 선택, `S`로 소환 모드, `A`로 공격 모드, `Esc`로 해제.

구성:

- `src/model.mjs`: 타일, 점유, 경로 탐색, 이동 보간, 명중 타이밍. 브라우저와 독립된 모델입니다.
- `src/combat.mjs`: 테스트 진영·공격 범위·주변 적 조회·공속과 공격 시간 변환.
- `src/navigation.mjs`: 공유 거리장, 한 칸 예약, 경로 재사용·대기·우회와 탐색 예산.
- `src/movement-scenarios.mjs`: 선택적으로 사용하는 재현용 동시 이동 배치.
- `src/render.mjs`: 보드 타일 보정·깊이 정렬 및 캐릭터 엔진 호출.
- `src/characters/`: 보드와 독립된 인스턴스·장비·리그·애니메이션·카탈로그. `characters.html`에서 같은 엔진으로 미리보기합니다.
- 자세한 API와 확장 방법은 `docs/character-engine.md`를 참고하세요.
- `src/app.mjs`: 포인터·터치·키보드 입력, 카메라, 선택과 최소 UI.
- `assets/`: 기존 승인 이미지와 리그 메타데이터. 검은 손과 독립된 이미지로 유지합니다.
- `legacy/index.html`: 이전 게임 원본 보관.

직접 파츠를 조정하려면 캐릭터 연구실의 **리그 직접 조정 · JSON 내보내기**를 엽니다. `rig-editor.html`에서 순서대로 캐릭터를 편집하고 개별·전체 JSON을 저장할 수 있습니다. 사용법과 적용 방법은 `docs/rig-editor.md`를 참고하세요.

검증:

```sh
node --test tests/*.test.mjs
# Python Playwright + Chromium을 설치한 검증 환경에서 정적 호스팅 주소 지정:
BASE_URL=https://your-static-host.example python3 tests/browser.py
BASE_URL=https://your-static-host.example python3 tests/mobile-layout.py
BASE_URL=https://your-static-host.example python3 tests/rig-browser.py
BASE_URL=https://your-static-host.example python3 tests/characters-browser.py
BASE_URL=https://your-static-host.example python3 tests/rig-editor-browser.py
BASE_URL=https://your-static-host.example python3 tests/equipment-grips-browser.py
BASE_URL=https://your-static-host.example python3 tests/character-visibility-browser.py
BASE_URL=https://your-static-host.example python3 tests/health-browser.py
BASE_URL=https://your-static-host.example python3 tests/terrain-browser.py
BASE_URL=https://your-static-host.example python3 tests/immersive-browser.py
BASE_URL=https://your-static-host.example python3 tests/navigation-browser.py
node scripts/benchmark_navigation.mjs
BASE_URL=https://your-static-host.example python3 tests/combat-browser.py
node scripts/benchmark_combat.mjs
```

브라우저 검증은 기본적으로 `/usr/bin/chromium`을 사용합니다. 다른 설치 경로는 `CHROMIUM`, 호스팅 주소는 `BASE_URL` 환경 변수로 지정할 수 있습니다. 데스크톱과 모바일 터치에서 소환·선택·실제 보행·공격·피격·드래그·핀치·초기화, 지형 변경, 이미지 누락 안내를 검사합니다. 모바일 레이아웃 검증은 다섯 화면 크기에서 확대·이동해도 전장이 헤더·조작부 영역을 침범하지 않는지, 화면 높이가 바뀌어도 배치가 유지되는지 검사합니다.

이번 버전은 조작 시연용입니다. 서로 다른 용사는 동시에 이동·공격할 수 있으며, 각 개체는 충돌을 피하며 대기·우회합니다. 동작 중인 해당 용사는 동작을 마친 후 새 명령을 받습니다. 오른쪽 위 **이동 테스트**에서 교차·병목·장애물 상황을 최대 1,000개체로 배치해 검증할 수 있습니다. 알고리즘·확장 API·측정 한계는 `docs/concurrent-navigation.md`를 참고하세요. 체력·부상·빈사·사망 연출을 지원하며, 테스트 배치에서는 A/B 진영이 등록된 사거리 안의 적과 자동 교전합니다. 시드·좌우 교환, 병종별 이동 성격과 원거리 탐색은 `docs/tactical-foundation.md`를 참고하세요. 기본 전장은 기존 중립 수동 시연을 유지하며 승패 판정·자동 추격은 없습니다. 임시 병종 능력치와 조작법은 `docs/test-combat.md`를 참고하세요. 방향 전환은 제공된 파츠의 좌우 반전을 사용합니다. 별도의 후면 원화는 현재 저장소에 없습니다. 화면을 구성하는 모든 필수 이미지가 실제로 존재하며, 누락 시 파일 경로를 안내하고 대체 디자인을 사용하지 않습니다.

지형과 그림자는 화면 크기의 캐시로 그리며 카메라·지형이 바뀔 때만 다시 만듭니다. 화면 밖 타일은 재생성 대상에서도 제외합니다. 측정 결과와 재현 방법은 `docs/render-performance.md`를 참고하세요.

전장은 화면 전체를 사용하며 테스트 조작부만 작게 겹쳐 표시합니다. 화면 밖 캐릭터는 파츠 계산과 정렬에서 제외하고 대기·보행 포즈는 화면 배율에 따라 15~30Hz로 재사용합니다. 보이는 대기 모션은 30Hz로 그리며 변화 없는 빈 화면은 다시 그리지 않습니다. 카메라 조작 중에는 지형 캐시의 여유 영역을 재사용하고 조작 종료 후 원래 품질로 갱신합니다.

오프라인 실행: HTTPS 또는 localhost에서 처음 한 번 접속해 서비스워커 캐시 설치가 끝나면 전장·캐릭터 연구실·리그 편집기를 네트워크 없이 다시 열 수 있습니다. `manifest.json`은 홈 화면 설치 정보를 제공합니다. 코드·리그·어셋·HTML 변경 후에는 **`python3 scripts/build_offline.py`로 `sw.js`를 재생성하고 함께 커밋**합니다. 새 버전 설치 후 기존 앱 탭을 모두 닫고 다시 열면 갱신됩니다. 브라우저 저장공간을 지우면 온라인에서 다시 캐시해야 합니다. 검증: `BASE_URL=http://127.0.0.1:8019 python3 tests/offline-browser.py`.

소대/분대 묶음 생성과 배치: 상단 **⚙ 디버그 → 소대/분대 배치**에서 설정 후 앞줄 기준 칸을 선택합니다. 데이터 형식과 API는 `docs/unit-groups.md`, 검증은 `tests/groups.test.mjs`와 `tests/groups-browser.py`를 참고하세요.

승리 방향 편향의 1,000개 시드 재검증과 활 발사 모션 변경은 `docs/win-bias-and-bow.md`를 참고하세요.

**전장 설정**에서 가로/세로4~256칸을 변경할 수 있습니다. 기존 병력·진행 중인 이동·기존 영역의 지형을 유지하며 병력이나 이동 목표가 잘리는 축소는 거절합니다. **전체 공격 활성**은 현재 생존 유닛의 자동 공격을 켜고, 무진영 유닛만 A/B로 균형 배정합니다. **공격 중지**는 새 자동 공격을 멈추며 이미 시작한 타격은 마무리합니다. 개나리 보병(기존 개나리 기사)의 권장 무기는 기본 검입니다.


분대 지휘 UI: 기존 하단 조작 바는 기본 숨김이며 상단 **⚙ 디버그**에서 다시 표시할 수 있습니다. 이동 테스트·소대/분대 배치·전장 설정도 해당 메뉴에 통합했습니다. 편성된 분대는 PC에서 오른쪽 세로 목록, 모바일에서 하단 가로 목록에 **실제 기수 초상·A/B 팀·잔존 병력**으로 표시됩니다. 목록을 누르면 분대 명령·태세·진형 패널이 열립니다. 기존 개별 조작·데이터 모델은 유지합니다.


2026-10-26 편성/명령 개편: **이동 테스트 → 양군 대대 전투 편성**은 진영별 대대-소대-특화 분대를 생성합니다. PC 오른쪽/모바일 하단의 기수 카드를 누르면 작고 닫기 쉬운 분대 명령창이 표시됩니다. **명령 아이콘 누름 즉시 적용**(목표 지정 명령은 전장에서 한 번 더 위치/대상 선택). 태세/진형은 한 번 눌러 반영됩니다. 디버그 패널은 열림 시에도 높이가 제한되고 바깥을 누르면 닫힙니다.
