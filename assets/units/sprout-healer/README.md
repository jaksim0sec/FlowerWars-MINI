# 도라가미 · 새싹힐러 (Sprout Healer)

제공된 새싹힐러 시안의 **개별 원화 파츠를 배경 제거 후 분리**했으며, 개나리용사 `rig.json` v5와 **같은 1000×1500 아트보드, 발 피벗, 파츠 역할**을 사용합니다. 옷은 녹차빛 한국 교복 V넥 조끼이고, 넓은 새싹 2장은 머리 장식 파츠입니다. 소매는 몸통에 남고 손목부터 별도 파츠입니다.

## 에셋
- `assets/units/sprout-healer/`: head, head_deco, body, hand_front, hand_back, leg_front, leg_back, shadow, rig.json
- `assets/equipment/weapons/sprout_staff.webp`: **권장 무기**, 교체 가능한 별도 장비
- `assets/equipment/accessories/sprout_satchel.webp`: 별도 가방 장비
- `sprout_healer_assembly_preview.png`: 참고용 조립 시안 (실제 게임 렌더러 실행 화면 아님)

## 게임 통합
범용 캐릭터 엔진과 연결되어 전장 소환과 독립 캐릭터 연구실에서 사용합니다. 원화 파츠와 원래 좌표를 유지하며 리그 v2에 노드·손별 연결점·공통 애니메이션 프로필·양손 자세를 추가했습니다. 권장 지팡이 sprout_staff는 별도 장비이며 생성 시 강제 장착하지 않습니다. 가방 원화는 보존되며 현재 손 장비 UI에는 등록하지 않았습니다.
