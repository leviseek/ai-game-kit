// 由 `bun run fgui gen-types` 生成，禁止手改；源 XML 变更后重跑刷新。
// 包: DevOverlay (id=ipgg4xdn)

import type {
    TypedComponentNode,
    TypedImageNode,
    TypedTextNode,
} from "../../framework";

export const DevOverlayPanelFields = {
    bg_panel: "image",
    info_uptime: "text",
    info_device: "text",
    info_network: "text",
    info_fps: "text",
    info_memory: "text",
} as const;

export type DevOverlayPanelNodes = keyof typeof DevOverlayPanelFields;

export interface IDevOverlayPanel {
    readonly _bg_panel: TypedImageNode;
    readonly _info_uptime: TypedTextNode;
    readonly _info_device: TypedTextNode;
    readonly _info_network: TypedTextNode;
    readonly _info_fps: TypedTextNode;
    readonly _info_memory: TypedTextNode;
}

export const DevOverlayBallFields = {
    img_ball: "image",
    badge_fps: "text",
    panel: "component",
} as const;

export type DevOverlayBallNodes = keyof typeof DevOverlayBallFields;

export interface IDevOverlayBall {
    readonly _img_ball: TypedImageNode;
    readonly _badge_fps: TypedTextNode;
    readonly _panel: TypedComponentNode;
}

