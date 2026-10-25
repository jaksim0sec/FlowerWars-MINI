# Doragami — Gynari Warrior prototype assets

Transparent image layers cut from an original generated sprite sheet, prepared for the FlowerWars-MINI remake.

## Structure

- `assets/units/gynari-warrior/`: head, head_deco, torso with built-in yellow sleeves, separate wrist/hand sources, alternate wrist poses, separate feet, shadow, and `rig.json`.
- `assets/equipment/weapons/basic_sword.webp`: standalone sword. Do **not** merge sword pixels into the hand asset.
- `.webp` files retain the approved painted artwork. `hand_back.webp` has an alpha-only trim to remove the duplicate sleeve and the two protruding wrist outline ends, preserving its dimensions and retained pixels in lossless WebP.

## Rendering

- Treat the **bottom of the feet** as the board cell pivot.
- `rig.json` v6 matches the supplied character motif on a 1000×1500 artboard: a head slightly smaller than the reference relative to the tunic, a steeper leaf, compact cuffs and a wider short-boot stance. Preserve source image aspect ratios when resizing parts. Canvas assembly lives in `src/render.mjs`.
- The torso already has yellow sleeves. The weapon-hand source still includes a yellow sleeve, while the free-hand source is trimmed to the wrist. Normalized `clip` polygons keep both draws within the cuff/palm boundary so no duplicate shoulder is drawn.
- The free wrist mask also trims the two protruding ends of the old sleeve outline. Its image is tucked farther under the torso sleeve while its pivot stays at the same sleeve attachment, keeping the trimmed edge covered during motion.
- `hand_back` and `hand_front` identify assembly roles; each role chooses the source image whose wrist points outward on that side.
- Wrists rotate at their sleeve attachment; the weapon forearm passes behind the tunic and the free cuff overlaps its front edge. The separate sword rotates around the palm grip and inherits the same arm transformation. The face and leaf hair share one neck transformation.
- Head decoration is drawn behind the face, then its `front_clip` region is drawn over the crown. This keeps the rear petal/stem behind the head without changing the artwork or leaf size.
- The decoration is registered inward and downward so the small rear petal's inner edge overlaps the head outline instead of leaving a transparent wedge at the join.
- Boots are partly covered by the tunic; walk rotation and lift keep their roots inside it. Shadow stays on the foot contact plane.
- Runtime states `idle`, `walk`, `attack`, `hit` animate this rig; the board model owns positions and impact timing.
- Render board tilt separately. Do **not** skew characters with the board.

Validate both facings and enlarged idle/walk/attack/hit poses when changing these coordinates. `tests/rig.test.mjs` covers motif silhouette proportions and arm order, head decoration occlusion, sleeve masks, shoulder/neck attachments, boot overlap and sword grip continuity. `tests/rig-browser.py` checks actual rendered pixels at the ornament seam and wrist outline in both facings and all four states. There is no separate rear-view artwork.

## Character engine catalog

`assets/characters.json` registers both independent rigs and the equipment catalog. Scene nodes, sockets, layering, shared animation profile and rig-specific overrides are defined in each rig JSON. Weapons are no longer character rig parts. `src/characters/engine.mjs` renders any registered rig without board imports.

The sprout healer uses its independent WebP artwork and rig. Its sprout staff is a separate optional equipment asset; the earlier leaf/robe SVGs remain alternate source material. See `docs/character-engine.md`.

## Selected merged pack (2026-10-25)

신규 6종: 방패수호자(`shield-guard`), 꽃잎학자(`scholar`), 깃발기수(`banner-bearer`), 클로버마법사(`clover-mage`), 잎새궁수(`archer`), 꽃잎정찰병(`scout`). 적용 기준은 마지막 첨부 `flowerwars_selected_merged.zip`입니다. 기존 두 캐릭터의 리그·원화는 유지합니다.

첨부본과 저장소에 기존 `register_assets.py`가 없어 `scripts/register_assets.py`를 추가했습니다. Python Pillow·NumPy가 있는 환경에서 `python3 scripts/register_assets.py /path/to/extracted-pack`으로 재등록합니다. 정적 게임 실행에는 Python 의존성이 필요 없습니다. `source.json`에 원본 manifest 항목을 보존합니다. origin_xy는 분해도 좌표로 보관하고 실제 조립은 독립 rig.json 좌표를 사용합니다.

원본 PNG는 변경하지 않고 복사했습니다. 얼굴 조각이 포함된 잎 장식은 RGB를 유지하고 알파만 정리한 `head_deco_overlay.png`를 별도로 사용합니다. 깃발은 얼굴 뒤에 가려지지 않도록 원본을 보존한 별도 좌우 반전 장비를 사용합니다. 원본 비율을 유지하고 머리·소매·발 접합 좌표와 접지 그림자를 보정했습니다.

방패·책·깃발·마법봉·활은 독립 손 장비입니다. 궁수의 화살통·가방은 각각 back/waist 슬롯으로 분리하고 미리보기와 명시적 권장 장착에서 선택합니다. 생성기는 권장 장비를 강제하지 않습니다. 정찰병은 첨부에 무기가 없어 기본 맨손입니다. 기본 전장 두 캐릭터는 그대로 두며 소환 목록과 캐릭터 연구실에서 총 8종을 선택합니다.

검증: `node --test tests/*.test.mjs`, 기존 브라우저 검사 4종, `BASE_URL=http://127.0.0.1:8002 python3 tests/selected-pack-browser.py`. 신규 6종의 실제 알파 중첩으로 머리·팔·부츠의 접합을 검사하고 모든 8종에 대해 애니메이션 중 양손/개별 손의 무기 연결점을 검사합니다. 신규 직업 전용 전투 규칙(원거리 투사체 등)은 추가하지 않으며 기존 공통 동작을 사용합니다.

## Reference proportion calibration (2026-10-25)

`units/reference-poses.json` defines each of the six supplied reference poses individually: head/body/arm sizes, shoulder origins, resting arm angles and equipment positions. The mage, archer, scholar and scout use larger face circles positioned under their own crowns. The banner hand is raised to its pole; the mage and archer forearms extend toward their equipment instead of hanging down. Source aspect ratios remain unchanged.

The scholar draws the full forearm behind the book and only its clipped palm in front. The guard draws the shield over its forearm; the banner arm sits in front of the torso. Equipment grip coordinates are computed from the actual rotated palm, with resting arm rotation compensated on the equipment so the staff, bow and pole stay at the reference angle. These definitions are reapplied by `scripts/register_assets.py` and are not engine-specific character branches.

`docs/rig-comparison.jpg` shows the supplied reference on the left and actual Canvas rendering on the right for all six. Regenerate with `BASE_URL=http://127.0.0.1:8003 python3 scripts/compare_reference_rigs.py EXTRACTED_PACK`. Unit tests constrain individual head/body and near-arm/body ratios and painter order, while browser tests still inspect physical attachment overlap and animation behavior.
