# Demo Lobby Button Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `Demo/LobbyView.xml` 的 5 个 Basic 跨包按钮替换为 Demo 包内自包含的 `LobbyButton.xml`，并通过 FGUI 严格校验。

**Architecture:** 在 Demo 包内创建一个复用的 `LobbyButton.xml`，其根组件实现标准四页 Button controller，up/down 视觉由 Demo 包本地 sprite image 提供。`LobbyView.xml` 保留现有 5 个按钮对象 id、name、坐标和尺寸，仅改为本包组件引用；`btn_card` 可用，其余按钮通过 `grayed="true"` 作为禁用占位，删除重复的禁用背景 image。

**Tech Stack:** FGUI CocosCreator 5.0 源 XML、Demo package manifest、`bun run fgui` CLI、palette-locked ASCII sprite PNG。

## Global Constraints

- 任何组件源 XML 禁止 `<graph>` 节点。
- 不使用 `transition`。
- `LobbyView.xml` 不得含任何 `pkg=` 属性。
- 按钮视觉必须使用 Demo 包内 sprite `<image>`，不得使用纯色 graph。
- 单个 `<relation>` 的 `sidePair` 最多包含 2 项。
- 图片颜色必须来自 `ui/demo/palette.json`。
- 5 个 LobbyView 按钮 name 必须保持 `btn_card`、`btn_fight`、`btn_idle`、`btn_rpg`、`btn_tycoon`。
- 5 个按钮文本 name 必须保持 `txt_card_name`、`txt_fight_name`、`txt_idle_name`、`txt_rpg_name`、`txt_tycoon_name`。
- 不修改 `ui/demo/assets/boot`、`ui/demo/assets/game*`、`tests/`。
- 不手工修改发布产物 `.bin` 或 atlas。

---

### Task 1: Allocate Demo resource ids and generate button sprites

**Files:**

- Create: `ui/demo/assets/Demo/img/lobby_button_up.png`
- Create: `ui/demo/assets/Demo/img/lobby_button_down.png`
- Modify: `ui/demo/assets/Demo/package.xml` via the FGUI CLI registration performed by `fgui sprite`

**Interfaces:**

- Consumes: `ui/demo/palette.json` and the existing Demo package resource manifest.
- Produces: Two registered Demo image resources and their actual PNG files, with ids allocated by `next-id` rather than invented manually.

- [ ] **Step 1: Allocate the next image id prefix values**

Run:

```powershell
bun run fgui next-id --package Demo --prefix btn
```

Record the returned next id/prefix allocation and use only CLI-assigned ids for the generated button images. If the command supports a separate allocation per resource, run it once per image as required by its output; do not invent ids.

- [ ] **Step 2: Generate the up-state sprite with palette-allowed colors**

Run `fgui sprite` with an ASCII rectangle using only palette keys `button`, `button_light`, `button_dark`, and `white`; for example, use `.` as `button_dark`, `+` as `button`, `#` as `button_light`, and leave the center transparent if the CLI syntax supports transparency. The command must use the requested project palette path and Demo package:

```powershell
bun run fgui sprite --package Demo --name lobby_button_up.png --palette ui/demo/palette.json --art "<approved ASCII art>" --path img
```

The generated image must be registered in `Demo/package.xml` and stored at `ui/demo/assets/Demo/img/lobby_button_up.png`.

- [ ] **Step 3: Generate the down-state sprite with palette-allowed colors**

Run the same command for the pressed state, using `button_down` as the primary fill and `button_dark`/`button_light`/`white` only where needed:

```powershell
bun run fgui sprite --package Demo --name lobby_button_down.png --palette ui/demo/palette.json --art "<approved ASCII art>" --path img
```

The generated image must be registered in `Demo/package.xml` and stored at `ui/demo/assets/Demo/img/lobby_button_down.png`.

- [ ] **Step 4: Confirm generated resources are registered and palette-compliant**

Run:

```powershell
bun run fgui list-resources --package Demo
```

Confirm both image names appear under `@/img/`, each has a unique CLI-assigned id, and no unrelated package resources were changed.

### Task 2: Create the local LobbyButton component

**Files:**

- Create: `ui/demo/assets/Demo/LobbyButton.xml`
- Modify: `ui/demo/assets/Demo/package.xml` via `bun run fgui register-component`

**Interfaces:**

- Consumes: The two registered image ids and paths from Task 1.
- Produces: A Demo component resource named `LobbyButton.xml`, registered and exported, with a local four-page Button skeleton.

- [ ] **Step 1: Register the new component through the CLI**

Run:

```powershell
bun run fgui register-component --package Demo --name LobbyButton.xml
```

Use the id returned by the command only for local references from `LobbyView.xml`.

- [ ] **Step 2: Write the self-contained Button XML**

Create `LobbyButton.xml` with this exact structural contract, replacing the image `src` values with the ids confirmed from Task 1:

```xml
<?xml version="1.0" encoding="utf-8"?>
<component size="240,112" extention="Button">
  <controller name="button" pages="0,up,1,down,2,over,3,selectedOver" selected="0"/>
  <displayList>
    <image id="lb_bg_up" name="img_bg_up" src="<up-image-id>" fileName="img/lobby_button_up.png" xy="0,0" size="240,112">
      <gearDisplay controller="button" pages="0,2"/>
      <relation target="" sidePair="width-width,height-height"/>
    </image>
    <image id="lb_bg_down" name="img_bg_down" src="<down-image-id>" fileName="img/lobby_button_down.png" xy="0,0" size="240,112">
      <gearDisplay controller="button" pages="1,3"/>
      <relation target="" sidePair="width-width,height-height"/>
    </image>
  </displayList>
  <Button/>
</component>
```

Do not leave angle-bracket placeholders in the actual XML. Do not add `pkg`, `graph`, `transition`, or `fill` to either image.

- [ ] **Step 3: Validate the standalone component**

Run:

```powershell
bun run fgui validate --package Demo --component LobbyButton.xml --strict
```

Expected: no errors. Fix only resource ids, file paths, controller/gear pairing, or relation syntax if validation reports a problem; do not weaken the validator.

### Task 3: Replace LobbyView cross-package buttons

**Files:**

- Modify: `ui/demo/assets/Demo/LobbyView.xml`

**Interfaces:**

- Consumes: The registered local `LobbyButton.xml` resource id from Task 2.
- Produces: A LobbyView with five local component references, preserved binding names/coordinates/sizes, one enabled card button, and four grayed placeholders.

- [ ] **Step 1: Replace all five button component references**

For each existing button component, replace `src="xualm" fileName="Button/Button.xml" pkg="nk9ejx23"` with the local Demo component id and `fileName="LobbyButton.xml"`; remove the `pkg` attribute entirely. Preserve these attributes:

```text
btn_card   id=lv_btn_card   xy=256,184   size=240,112
btn_fight  id=lv_btn_fight  xy=520,184   size=240,112   grayed=true
btn_idle   id=lv_btn_idle   xy=784,184   size=240,112   grayed=true
btn_rpg    id=lv_btn_rpg    xy=388,320   size=240,112   grayed=true
btn_tycoon id=lv_btn_tycoon xy=652,320   size=240,112   grayed=true
```

Keep each component's existing `<Button title=""/>` child only if the local Button extension accepts it; otherwise use the valid local component instance form required by the existing FGUI XML parser. The final nodes must remain Button components, not bare image/text substitutions.

- [ ] **Step 2: Remove the four duplicated disabled background image nodes**

Delete only these nodes from `LobbyView.xml`:

```text
lv_fight_disabled
lv_idle_disabled
lv_rpg_disabled
lv_tycoon_disabled
```

Do not remove or rename the associated text nodes. Keep the existing text names, positions, sizes, font sizes, alignment, and “敬请期待” copy.

- [ ] **Step 3: Check the resulting source invariants**

Run:

```powershell
rg -n 'pkg=|<graph|<transition|name="btn_(card|fight|idle|rpg|tycoon)"|name="txt_(card|fight|idle|rpg|tycoon)_name"' ui/demo/assets/Demo/LobbyView.xml ui/demo/assets/Demo/LobbyButton.xml
```

Expected: no `pkg=`, `<graph>`, or `<transition>` matches; all five button names and all five text names appear.

### Task 4: Run strict package validation and review the diff

**Files:**

- Verify: `ui/demo/assets/Demo/LobbyView.xml`
- Verify: `ui/demo/assets/Demo/LobbyButton.xml`
- Verify: `ui/demo/assets/Demo/package.xml`
- Verify: `ui/demo/assets/Demo/img/lobby_button_up.png`
- Verify: `ui/demo/assets/Demo/img/lobby_button_down.png`

**Interfaces:**

- Consumes: All outputs from Tasks 1–3.
- Produces: A validated Demo package with no LobbyView cross-package reference.

- [ ] **Step 1: Run strict validation for the whole Demo package**

Run:

```powershell
bun run fgui validate --package Demo --strict
```

Expected: exit code 0. Any remaining warnings must be pre-existing Basic/Builder official-library warnings only; LobbyView and LobbyButton must not produce cross-package warnings or semantic errors.

- [ ] **Step 2: Confirm LobbyView has no package attribute**

Run:

```powershell
rg -n 'pkg=' ui/demo/assets/Demo/LobbyView.xml
```

Expected: no output and exit code 1 from `rg`.

- [ ] **Step 3: Inspect only task-scoped changes**

Run:

```powershell
git status --short
git diff -- ui/demo/assets/Demo/LobbyView.xml ui/demo/assets/Demo/LobbyButton.xml ui/demo/assets/Demo/package.xml
```

Confirm no files under `assets/boot`, `assets/game*`, or `tests/` changed. Do not commit or modify unrelated pre-existing Demo changes.
