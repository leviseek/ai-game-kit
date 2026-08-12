// 由 `bun run fgui gen-types` 生成，禁止手改；源 XML 变更后重跑刷新。
// 包: Demo (id=4q9x2uij)

import type {
    TypedButtonNode,
    TypedComponentNode,
    TypedImageNode,
    TypedListNode,
    TypedProgressNode,
    TypedTextNode,
} from "../../framework";

export const LobbyViewFields = {
    img_bg: "image",
    txt_title: "text",
    btn_card: "button",
    txt_card_name: "text",
    btn_fight: "button",
    txt_fight_name: "text",
    btn_idle: "button",
    txt_idle_name: "text",
    btn_rpg: "button",
    txt_rpg_name: "text",
    btn_tycoon: "button",
    txt_tycoon_name: "text",
    btn_auto_battle: "button",
    txt_auto_battle_name: "text",
} as const;

export type LobbyViewNodes = keyof typeof LobbyViewFields;

export interface ILobbyView {
    readonly _img_bg: TypedImageNode;
    readonly _txt_title: TypedTextNode;
    readonly _btn_card: TypedButtonNode;
    readonly _txt_card_name: TypedTextNode;
    readonly _btn_fight: TypedButtonNode;
    readonly _txt_fight_name: TypedTextNode;
    readonly _btn_idle: TypedButtonNode;
    readonly _txt_idle_name: TypedTextNode;
    readonly _btn_rpg: TypedButtonNode;
    readonly _txt_rpg_name: TypedTextNode;
    readonly _btn_tycoon: TypedButtonNode;
    readonly _txt_tycoon_name: TypedTextNode;
    readonly _btn_auto_battle: TypedButtonNode;
    readonly _txt_auto_battle_name: TypedTextNode;
}

export const SettingsPanel2Fields = {
    img_mask: "image",
    bg_panel: "image",
    title: "text",
    txt_music: "text",
    sld_music: "component",
    txt_sfx: "text",
    bar_sfx: "progress",
    txt_quality: "text",
    cbx_quality: "component",
    txt_players: "text",
    list_players: "list",
    btn_return: "button",
} as const;

export type SettingsPanel2Nodes = keyof typeof SettingsPanel2Fields;

export interface ISettingsPanel2 {
    readonly _img_mask: TypedImageNode;
    readonly _bg_panel: TypedImageNode;
    readonly _title: TypedTextNode;
    readonly _txt_music: TypedTextNode;
    readonly _sld_music: TypedComponentNode;
    readonly _txt_sfx: TypedTextNode;
    readonly _bar_sfx: TypedProgressNode;
    readonly _txt_quality: TypedTextNode;
    readonly _cbx_quality: TypedComponentNode;
    readonly _txt_players: TypedTextNode;
    readonly _list_players: TypedListNode;
    readonly _btn_return: TypedButtonNode;
}

export const SettingsSliderGrip2Fields = {
    img_up: "image",
    img_down: "image",
} as const;

export type SettingsSliderGrip2Nodes = keyof typeof SettingsSliderGrip2Fields;

export interface ISettingsSliderGrip2 {
    readonly _img_up: TypedImageNode;
    readonly _img_down: TypedImageNode;
}

export const CloseDialogFields = {
    img_mask: "image",
    img_panel: "image",
    txt_title: "text",
    txt_content: "text",
    btn_cancel_bg: "image",
    txt_cancel: "text",
    btn_confirm_bg: "image",
    txt_confirm: "text",
} as const;

export type CloseDialogNodes = keyof typeof CloseDialogFields;

export interface ICloseDialog {
    readonly _img_mask: TypedImageNode;
    readonly _img_panel: TypedImageNode;
    readonly _txt_title: TypedTextNode;
    readonly _txt_content: TypedTextNode;
    readonly _btn_cancel_bg: TypedImageNode;
    readonly _txt_cancel: TypedTextNode;
    readonly _btn_confirm_bg: TypedImageNode;
    readonly _txt_confirm: TypedTextNode;
}

export const SettingsComboItem2Fields = {
    img_hover: "image",
    img_selected: "image",
    title: "text",
} as const;

export type SettingsComboItem2Nodes = keyof typeof SettingsComboItem2Fields;

export interface ISettingsComboItem2 {
    readonly _img_hover: TypedImageNode;
    readonly _img_selected: TypedImageNode;
    readonly _title: TypedTextNode;
}

export const HealthBarComFields = {
    txt_label: "text",
    hp_track: "image",
    bar: "image",
} as const;

export type HealthBarComNodes = keyof typeof HealthBarComFields;

export interface IHealthBarCom {
    readonly _txt_label: TypedTextNode;
    readonly _hp_track: TypedImageNode;
    readonly _bar: TypedImageNode;
}

export const DemoViewFields = {
    img_bg: "image",
    txt_title: "text",
} as const;

export type DemoViewNodes = keyof typeof DemoViewFields;

export interface IDemoView {
    readonly _img_bg: TypedImageNode;
    readonly _txt_title: TypedTextNode;
}

export const SettingsReturnButton2Fields = {
    img_up: "image",
    img_down: "image",
    title: "text",
} as const;

export type SettingsReturnButton2Nodes = keyof typeof SettingsReturnButton2Fields;

export interface ISettingsReturnButton2 {
    readonly _img_up: TypedImageNode;
    readonly _img_down: TypedImageNode;
    readonly _title: TypedTextNode;
}

export const SettingsComboPopup2Fields = {
    bg_panel: "image",
    list_items: "list",
} as const;

export type SettingsComboPopup2Nodes = keyof typeof SettingsComboPopup2Fields;

export interface ISettingsComboPopup2 {
    readonly _bg_panel: TypedImageNode;
    readonly _list_items: TypedListNode;
}

export const SettingsSlider2Fields = {
    bg: "image",
    bar: "image",
    grip: "component",
} as const;

export type SettingsSlider2Nodes = keyof typeof SettingsSlider2Fields;

export interface ISettingsSlider2 {
    readonly _bg: TypedImageNode;
    readonly _bar: TypedImageNode;
    readonly _grip: TypedComponentNode;
}

export const SettingsComboBox2Fields = {
    img_up: "image",
    img_down: "image",
    title: "text",
    img_arrow: "text",
} as const;

export type SettingsComboBox2Nodes = keyof typeof SettingsComboBox2Fields;

export interface ISettingsComboBox2 {
    readonly _img_up: TypedImageNode;
    readonly _img_down: TypedImageNode;
    readonly _title: TypedTextNode;
    readonly _img_arrow: TypedTextNode;
}

export const SettingsProgress2Fields = {
    bg_track: "image",
    bar: "image",
} as const;

export type SettingsProgress2Nodes = keyof typeof SettingsProgress2Fields;

export interface ISettingsProgress2 {
    readonly _bg_track: TypedImageNode;
    readonly _bar: TypedImageNode;
}

export const SettingsPlayerItem2Fields = {
    img_hover: "image",
    img_selected: "image",
    title: "text",
} as const;

export type SettingsPlayerItem2Nodes = keyof typeof SettingsPlayerItem2Fields;

export interface ISettingsPlayerItem2 {
    readonly _img_hover: TypedImageNode;
    readonly _img_selected: TypedImageNode;
    readonly _title: TypedTextNode;
}

export const StartButtonFields = {
    img_up: "image",
    img_down: "image",
    txt_start: "text",
} as const;

export type StartButtonNodes = keyof typeof StartButtonFields;

export interface IStartButton {
    readonly _img_up: TypedImageNode;
    readonly _img_down: TypedImageNode;
    readonly _txt_start: TypedTextNode;
}

