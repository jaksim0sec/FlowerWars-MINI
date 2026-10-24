# 도라가미 · 새싹힐러 (Sprout Healer)

제공된 새싹힐러 시안의 **개별 원화 파츠를 배경 제거 후 분리**했으며, 개나리용사 `rig.json` v5와 **같은 1000×1500 아트보드, 발 피벗, 파츠 역할**을 사용합니다. 옷은 녹차빛 한국 교복 V넥 조끼이고, 넓은 새싹 2장은 머리 장식 파츠입니다. 소매는 몸통에 남고 손목부터 별도 파츠입니다.

## 에셋
- `assets/units/sprout-healer/`: head, head_deco, body, hand_front, hand_back, leg_front, leg_back, shadow, rig.json
- `assets/equipment/weapons/sprout_staff.webp`: **권장 무기**, 교체 가능한 별도 장비
- `assets/equipment/accessories/sprout_satchel.webp`: 별도 가방 장비
- `sprout_healer_assembly_preview.png`: 참고용 조립 시안 (실제 게임 렌더러 실행 화면 아님)

## 게임 통합 전 주의
현재 `src/render.mjs`는 `gynari-warrior`와 `basic_sword`를 하드코딩합니다. 새싹힐러 에셋만 넣어서는 게임에 등장하지 않으며 **유닛 type 별로 rig.json을 로드하고, 무기 슬롯을 장비 데이터로 선택하도록** 렌더러 범용화가 필요합니다. 이번 커밋은 에셋/개별 리그만 등록하며 `src/`는 건드리지 않습니다.

이미지 생성 설명 패널 자체가 원본이어서 자동 크롭/배경 제거를 사용했으며, 원본과 다르게 알파 가장자리의 미세한 픽셀이 정리될 수 있습니다.
