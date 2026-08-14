// 由 `bun run fgui gen-types` 生成，禁止手改；源 XML 变更后重跑刷新。
// 包: Common (id=cmn00001)

import type {
    ITypedButtonNode,
    ITypedImageNode,
    ITypedProgressNode,
    ITypedTextNode,
} from "../../framework";

export const CommonButtonFields = {
    img_bg_up: "image",
    img_bg_down: "image",
    img_bg_over: "image",
    title: "text",
} as const;

export type CommonButtonNodes = keyof typeof CommonButtonFields;

export interface ICommonButton {
    readonly _img_bg_up: ITypedImageNode;
    readonly _img_bg_down: ITypedImageNode;
    readonly _img_bg_over: ITypedImageNode;
    readonly _title: ITypedTextNode;
}

export const CommonProgressBarFields = {
    img_track: "image",
    bar: "image",
} as const;

export type CommonProgressBarNodes = keyof typeof CommonProgressBarFields;

export interface ICommonProgressBar {
    readonly _img_track: ITypedImageNode;
    readonly _bar: ITypedImageNode;
}

export const CommonProgressBarHpFields = {
    img_track: "image",
    bar: "image",
} as const;

export type CommonProgressBarHpNodes = keyof typeof CommonProgressBarHpFields;

export interface ICommonProgressBarHp {
    readonly _img_track: ITypedImageNode;
    readonly _bar: ITypedImageNode;
}

export const UnitSlotFields = {
    txt_name: "text",
    txt_hp: "text",
    bar_hp: "progress",
    bar_energy: "progress",
} as const;

export type UnitSlotNodes = keyof typeof UnitSlotFields;

export interface IUnitSlot {
    readonly _txt_name: ITypedTextNode;
    readonly _txt_hp: ITypedTextNode;
    readonly _bar_hp: ITypedProgressNode;
    readonly _bar_energy: ITypedProgressNode;
}

export const CandidateItemFields = {
    btn_candidate: "button",
    txt_candidate_name: "text",
    mark_deployed: "text",
} as const;

export type CandidateItemNodes = keyof typeof CandidateItemFields;

export interface ICandidateItem {
    readonly _btn_candidate: ITypedButtonNode;
    readonly _txt_candidate_name: ITypedTextNode;
    readonly _mark_deployed: ITypedTextNode;
}

