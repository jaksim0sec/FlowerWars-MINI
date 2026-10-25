# 도라가미 전장 터치/분대 명령 UX

## 외부 게임에서 참고한 조작 규칙

- **Bad North**: 선택한 소규모 부대에 전장 목적지를 지정하는 간단한 명령 흐름. 명령 중 느린 시간 흐름이 추가되지만 도라가미에서는 전투 타임스케일 변경을 하지 않는다.
  - https://www.148apps.com/bad-north-jotunn-edition/bad-north-jotunn-edition-guide/
- **Iron Marines**: 탭·더블탭으로 그룹을 선택하고 위치를 지정하는 조작. 드래그와 그룹 이동의 충돌은 기기별로 주의.
  - https://www.pocketgamer.com/iron-marines/iron-marines-tips-and-tricks-a-beginners-guide-to-successful-space-ops/
- **Company of Heroes mobile (Feral Interactive)**: PC형 명령 패널과 모바일용 길게 누르기 명령 휠. 작은 타깃을 확대해 오입력을 줄이는 Tap Assist도 제공.
  - https://www.feralinteractive.com/en/faqs/companyofheroes/1.0.2/ios/
  - https://www.feralinteractive.com/en/news/feature-highlight-button-overlay-in-company-of-heroes-for-iphone-and-android/
- **Iron Marines PC**: 숫자 그룹 단축키를 두 번 누르면 그룹 위치로 카메라 이동.
  - https://steamcommunity.com/app/931280/discussions/0/1637536330462471905/

## 도라가미 적용 규칙

| 사용자 입력 | 결과 | 기존 동작과의 충돌 방지 |
| --- | --- | --- |
| 기수 아이콘 한 번 누르기 | 해당 분대 선택 + 소형 명령창 열기 | 분대 선택 모드를 명시적으로 시작 |
| 선택 중 빈 전장 터치 | 해당 분대 전체에 **이동** | 기존 개별 유닛 이동은 분대 모드 밖에서 그대로 작동 |
| 선택 중 적 분대 터치 | **집중 공격** | 친군과 중립은 적으로 취급하지 않음 |
| 선택 중 다른 아군 분대 터치 | 그 분대를 선택하고 명령창 열기 | 오명령 대신 선택 전환 |
| 전장 유닛을 460ms 길게 누르기 | 그 유닛이 속한 분대 명령창 열기 | 손가락 이동 8px 이상 또는 두 손가락이면 길게 누르기 취소 |
| 전장 드래그 | 기존 카메라 팬 | 탭 명령은 손가락 이동 중 실행되지 않음 |
| 두 손가락 핀치 | 기존 카메라 줌/팬 | 길게 누르기 타이머를 취소 |
| PC 오른쪽 클릭 | 선택 중인 분대의 위치/적 대상 명령 | 별도 이동·전투 엔진 없이 같은 탭 해석 사용 |
| 기수 아이콘 두 번 클릭 | 해당 기수 위치로 카메라 초점 이동 | 선택 동작은 유지 |
| 분대 메뉴 아이콘 | 해당 명령 즉시, 목표가 필요하면 그다음 전장 클릭 | 사용자의 명시적 특수 명령 우선 |
| ×/바깥 탭/Esc | 명령창만 닫기 | 선택한 분대와 후속 직접 명령은 유지 |

명령 성공 시 터치한 전장 위치에 650ms 이내 사라지는 표시를 띄운다. 분대 선택이 유지되는 동안 해당 기수 아이콘의 선택선도 유지한다. 첫 분대 선택에서 한 번만 짧은 조작 힌트를 보여준다. 실제 클릭 가능한 기수 영역은 얼굴 그림보다 넓게 유지한다.

## 구현 및 제한

- **UI 통합**: `src/app.mjs`, `index.html`, `src/style.css`.
- **순수 선택 해석기**: `src/gesture-commands.mjs`의 `squadTapIntent`. 전장 및 유닛 상태를 변경하지 않는다.
- **실제 명령**: 기존 `orderSquad`로 위임하고 `Board`·Navigation·Combat 구현은 보존.
- 분대를 명시적으로 선택한 상태가 아닐 때, 기존 개별 유닛 클릭/소환/공격은 그대로 동작한다.
- **미구현**: 전투 시간 감속, 전체화면 방사형 명령 휠, 드래그를 통한 부대 이동(기존 화면 팬과 충돌), 피드백을 위한 새 능력치 효과.
- 테스트: `tests/gesture-commands.test.mjs`, `tests/squad-interface-browser.py`. 실제 모바일 체감 검증은 브라우저 테스트 수행 여부와 구분해서 기록.
