# 도라가미 캐릭터 엔진

`src/characters/engine.mjs`는 보드, DOM, 카메라, 타일을 import하지 않습니다. 인스턴스 생성과 장비 관리는 Node에서도 사용하며 Canvas 렌더링은 전달받은 context만 사용합니다. `catalog.mjs`만 브라우저 이미지 로딩을 담당합니다.

## 생성 및 장착

```js
import {loadCatalog} from './src/characters/catalog.mjs';
import {createCharacter, equip, unequip, drawCharacter} from './src/characters/engine.mjs';
const catalog = await loadCatalog();
const hero = createCharacter(catalog, 'sprout-healer'); // 양손 모두 빈 상태
// recommendedWeapon은 표시용 추천 정보이며 생성 시 장착하지 않습니다.
equip(catalog, hero, 'clover_staff', 'left');
equip(catalog, hero, 'basic_sword', 'right'); // 서로 다른 무기
unequip(hero, 'both');
equip(catalog, hero, 'clover_staff', 'both'); // 하나의 장착 객체를 두 손이 공유
hero.animation.state = 'walk';
hero.animation.elapsed = .2;
hero.animation.facing = 1;
ctx.save();
ctx.translate(160, 260); // 표시 UI가 정하는 발 위치
// 크기는 카드/미리보기/전장 각각 지정 가능합니다.
drawCharacter(ctx, catalog, hero, .2, {scale: .2});
ctx.restore();
```

`equipment`, `appearance.parts`, `appearance.animations`, `animation`은 인스턴스 소유입니다. 기본 애셋과 정의는 카탈로그에서 공유하고 렌더러는 수정하지 않습니다. `appearance.parts`는 리그의 파츠 이름을 같은 캐릭터 이미지 목록의 다른 이름으로 매핑합니다. `animation`에는 state, elapsed(초), facing, phase, 선택적 attackVector가 있습니다. UI/시뮬레이션이 시간을 갱신합니다.

왼손/오른손은 캐릭터 기준이며 좌우 반전에도 유지됩니다. 양손 무기를 한 손에서 교체하거나 해제하면 이전 공유 장착을 두 손에서 함께 제거합니다. 유효하지 않은 장착 요청은 기존 장비를 유지한 채 오류를 냅니다.

## 리그와 애니메이션

- `parts`: asset 상대 경로, x/y/w/h, 정규화 origin, rotation, 선택적 clip/front_clip.
- `nodes`: 순서가 곧 레이어입니다. `children` 그룹, `transforms`(translate 또는 pivot+rotate), `part`, `socket`을 조합합니다. 파츠의 rotation/dy에도 애니메이션 채널 이름을 지정할 수 있습니다.
- `sockets.left/right`: 손 파츠, 정규화 grip, 그 손의 상위 group ID. 손별 연결점은 무기 정의와 독립입니다.
- `animationProfile`: 재사용할 JSON 채널 경로. `animations`로 캐릭터별 채널을 덮어씁니다.
- 애니메이션 값은 숫자, 변수/채널 이름, 또는 `[연산자, 인자…]`입니다. +, -, *, /, sin, abs, min, max, state, negativeY, curve를 지원합니다. curve는 `["curve", "elapsed", [[0,0],[0.3,1],[0.65,0]]]` 형태의 선형 키프레임입니다. 채널은 선언 순서로 평가하므로 참조 채널을 먼저 선언합니다.
- `twoHandedPoses`: 장비가 요청하는 자세별 primary 손과 노드 transform overrides. 보조 손 그룹은 장비 secondaryGrip에 맞춰 함께 이동하므로 동작 중에도 두 손잡이가 연결됩니다. 원본에 상완 파츠가 없으므로 현재 두 캐릭터는 손목 파츠만 이동합니다. 상완을 추가하면 같은 손 그룹 아래 배치할 수 있습니다.

공통 프로필은 `assets/animations/humanoid.json`에 있습니다. 캐릭터 override, 인스턴스 `appearance.animations`를 적용합니다. 각 장비의 motion은 해당 장비의 `animation` override를 추가한 별도 채널 집합으로 평가하므로 다른 손의 무기 동작에 영향을 주지 않습니다. 장비를 바꿔도 캐릭터 상태는 변경하지 않습니다.

## 새 캐릭터·장비 추가

새 캐릭터는 독립 리그와 파츠를 추가하고 `assets/characters.json`의 characters에 name/rig/recommendedWeapon을 등록합니다. manifest 항목을 순회하는 미리보기는 자동 표시됩니다. 보드 소환 UI의 선택 항목은 표시 UI 책임으로 추가합니다. 공통 엔진에 캐릭터 분기를 넣지 않습니다.

새 장비는 `assets/equipment/catalog.json`에 name, asset, w/h, grip, hands를 등록합니다. 양손 잡기를 지원하려면 secondaryGrip과 twoHandedPose를 추가하고 캐릭터 리그에 해당 자세를 정의합니다. rotation 또는 손별 socketRotations로 기본 방향을, motion 채널과 animation override로 동작 변형을 정합니다. 장착 객체의 overrides.rotation으로 인스턴스별 각도를 더할 수 있습니다.

## 표시 UI와 호환

`characters.html`은 캐릭터 연구실입니다. 보드 모듈을 로드하지 않고 같은 엔진을 사용합니다. 미장착으로 시작하며 권장 장착은 명시적인 사용자 동작입니다. 전장 데모는 앱에서 장비를 명시적으로 골라 두 캐릭터를 배치합니다. 보드 모델은 캐릭터 인스턴스를 운반하며 이동·점유·명중만 관리합니다.

`drawWarrior`는 예전의 검을 든 개나리용사 호출을 유지하는 호환 어댑터입니다. 신규 UI는 이 어댑터 대신 `drawCharacter`를 사용합니다. 개나리용사의 파츠 크기·목·손목·검 연결점·레이어는 기존 회귀 테스트로 검증합니다.

새싹힐러는 원격 main에 추가된 독립 WebP 원화 파츠와 리그 좌표를 사용합니다. 녹색 잎·로브 SVG는 대체 외형 제작 자료로 보존합니다. 리그·크기·장식·애니메이션 변형은 별도 설정이며 지팡이는 완전히 독립된 장비입니다. 치유 수치·체력 시스템은 이 렌더링 엔진의 책임에 포함하지 않습니다.

## Empty-hand and equipped poses

`rig.slotPoses` selects node transform overrides per equipment slot: `{ "right": { "empty": { "rightArm": { "transforms": [...] } }, "equipped": {...} } }`. Empty hands can rest down rather than retaining a staff/bow grip angle. A two-handed equipment pose takes precedence over slot overrides. Switching equipment does not overwrite animation or shared rig data. The selected-pack registration script derives these transforms from each character's `emptyHands` definition in `reference-poses.json`.

`docs/mobile-neutral.jpg` records the actual 390px mobile portrait canvases, unarmed, in the preview's default facing. This complements the equipped reference comparison; neither view substitutes for testing the other. `tests/mobile-hand-poses.py` checks lower empty-hand positions, equip/clear restoration, both facings and all four animation states. The scout has two complete equal-size legs. The source reference hides one leg by perspective; that occlusion is not used as a smaller or missing physical limb.

## Shared physical body standard

`assets/units/body-standard.json` defines the warrior-based physical frame for the six new heroes. All six use a 548-unit face width, a torso core close to 358 units, and two 115-unit-wide short boots. Cape margins are excluded from the core torso measurement. Armour changes appearance and bulk, not limb count or perspective-derived size. Both arms have comparable lengths and areas (185-unit length, 200 for the armoured near arm), preserving source aspect ratios. Shoulder placement, crown size, source alpha masks and holding angles remain character-specific. `register_assets.py` applies this final physical frame after importing source art positions.

`docs/body-standard.jpg` shows the warrior alongside the other seven characters at the same render scale and ground. `tests/body-standard.test.mjs` guards warrior-relative proportions, bilateral arm size and two full legs. Source reference poses define costume and equipment placement rather than physical limb scale.
