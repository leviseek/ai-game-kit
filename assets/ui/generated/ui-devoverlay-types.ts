// 由 `bun run fgui gen-types` 生成，禁止手改；源 XML 变更后重跑刷新。
// 包: DevOverlay (id=ipgg4xdn)

import type {
    ITypedComponentNode,
    ITypedImageNode,
    ITypedTextNode,
} from "../../framework";

export const DevOverlayPanelFields = {
    bg_panel: "image",
    info_uptime: "text",
    info_device: "text",
    info_network: "text",
    info_fps: "text",
    info_memory: "text",
    info_viewport: "text",
    info_resolution: "text",
} as const;

export type DevOverlayPanelNodes = keyof typeof DevOverlayPanelFields;

export interface IDevOverlayPanel {
    readonly _bg_panel: ITypedImageNode;
    readonly _info_uptime: ITypedTextNode;
    readonly _info_device: ITypedTextNode;
    readonly _info_network: ITypedTextNode;
    readonly _info_fps: ITypedTextNode;
    readonly _info_memory: ITypedTextNode;
    readonly _info_viewport: ITypedTextNode;
    readonly _info_resolution: ITypedTextNode;
}

export const DevOverlayBallFields = {
    img_ball: "image",
    badge_fps: "text",
    panel: "component",
} as const;

export type DevOverlayBallNodes = keyof typeof DevOverlayBallFields;

export interface IDevOverlayBall {
    readonly _img_ball: ITypedImageNode;
    readonly _badge_fps: ITypedTextNode;
    readonly _panel: ITypedComponentNode;
}

export const SafeAreaFrameFields = {
    frame_top: "image",
    frame_bottom: "image",
    frame_left: "image",
    frame_right: "image",
} as const;

export type SafeAreaFrameNodes = keyof typeof SafeAreaFrameFields;

export interface ISafeAreaFrame {
    readonly _frame_top: ITypedImageNode;
    readonly _frame_bottom: ITypedImageNode;
    readonly _frame_left: ITypedImageNode;
    readonly _frame_right: ITypedImageNode;
}

export const HexSlotComFields = {
    edge_top: "image",
    edge_upper_right: "image",
    edge_lower_right: "image",
    edge_bottom: "image",
    edge_lower_left: "image",
    edge_upper_left: "image",
} as const;

export type HexSlotComNodes = keyof typeof HexSlotComFields;

export interface IHexSlotCom {
    readonly _edge_top: ITypedImageNode;
    readonly _edge_upper_right: ITypedImageNode;
    readonly _edge_lower_right: ITypedImageNode;
    readonly _edge_bottom: ITypedImageNode;
    readonly _edge_lower_left: ITypedImageNode;
    readonly _edge_upper_left: ITypedImageNode;
}

