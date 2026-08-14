// 由 `bun run fgui gen-types` 生成，禁止手改；源 XML 变更后重跑刷新。
// 包: AutoBattle (id=abpk0001)

import type {
    ITypedButtonNode,
    ITypedComponentNode,
    ITypedImageNode,
    ITypedListNode,
    ITypedTextNode,
} from "../../framework";

export const AutoBattleViewFields = {
    bg_battle: "image",
    container_units: "component",
    container_effects: "component",
    txt_round: "text",
    txt_log: "text",
    txt_result: "text",
    btn_restart: "button",
    btn_speed: "button",
    vs_left: "text",
    vs_right: "text",
    vs_badge: "text",
} as const;

export type AutoBattleViewNodes = keyof typeof AutoBattleViewFields;

export interface IAutoBattleView {
    readonly _bg_battle: ITypedImageNode;
    readonly _container_units: ITypedComponentNode;
    readonly _container_effects: ITypedComponentNode;
    readonly _txt_round: ITypedTextNode;
    readonly _txt_log: ITypedTextNode;
    readonly _txt_result: ITypedTextNode;
    readonly _btn_restart: ITypedButtonNode;
    readonly _btn_speed: ITypedButtonNode;
    readonly _vs_left: ITypedTextNode;
    readonly _vs_right: ITypedTextNode;
    readonly _vs_badge: ITypedTextNode;
}

export const LineupEditorViewFields = {
    bg_lineup: "image",
    bg_formation_panel: "image",
    img_slot_0: "image",
    img_slot_1: "image",
    img_slot_2: "image",
    img_slot_3: "image",
    img_slot_4: "image",
    img_slot_5: "image",
    img_slot_6: "image",
    img_slot_7: "image",
    img_slot_8: "image",
    bg_candidates_panel: "image",
    slot_0: "button",
    slot_1: "button",
    slot_2: "button",
    slot_3: "button",
    slot_4: "button",
    slot_5: "button",
    slot_6: "button",
    slot_7: "button",
    slot_8: "button",
    slot_selected_0: "image",
    slot_selected_1: "image",
    slot_selected_2: "image",
    slot_selected_3: "image",
    slot_selected_4: "image",
    slot_selected_5: "image",
    slot_selected_6: "image",
    slot_selected_7: "image",
    slot_selected_8: "image",
    txt_slot_0_name: "text",
    txt_slot_1_name: "text",
    txt_slot_2_name: "text",
    txt_slot_3_name: "text",
    txt_slot_4_name: "text",
    txt_slot_5_name: "text",
    txt_slot_6_name: "text",
    txt_slot_7_name: "text",
    txt_slot_8_name: "text",
    candidate_list: "list",
    txt_title: "text",
    txt_formation_title: "text",
    txt_candidates_title: "text",
    btn_idle_rewards: "button",
    btn_start: "button",
} as const;

export type LineupEditorViewNodes = keyof typeof LineupEditorViewFields;

export interface ILineupEditorView {
    readonly _bg_lineup: ITypedImageNode;
    readonly _bg_formation_panel: ITypedImageNode;
    readonly _img_slot_0: ITypedImageNode;
    readonly _img_slot_1: ITypedImageNode;
    readonly _img_slot_2: ITypedImageNode;
    readonly _img_slot_3: ITypedImageNode;
    readonly _img_slot_4: ITypedImageNode;
    readonly _img_slot_5: ITypedImageNode;
    readonly _img_slot_6: ITypedImageNode;
    readonly _img_slot_7: ITypedImageNode;
    readonly _img_slot_8: ITypedImageNode;
    readonly _bg_candidates_panel: ITypedImageNode;
    readonly _slot_0: ITypedButtonNode;
    readonly _slot_1: ITypedButtonNode;
    readonly _slot_2: ITypedButtonNode;
    readonly _slot_3: ITypedButtonNode;
    readonly _slot_4: ITypedButtonNode;
    readonly _slot_5: ITypedButtonNode;
    readonly _slot_6: ITypedButtonNode;
    readonly _slot_7: ITypedButtonNode;
    readonly _slot_8: ITypedButtonNode;
    readonly _slot_selected_0: ITypedImageNode;
    readonly _slot_selected_1: ITypedImageNode;
    readonly _slot_selected_2: ITypedImageNode;
    readonly _slot_selected_3: ITypedImageNode;
    readonly _slot_selected_4: ITypedImageNode;
    readonly _slot_selected_5: ITypedImageNode;
    readonly _slot_selected_6: ITypedImageNode;
    readonly _slot_selected_7: ITypedImageNode;
    readonly _slot_selected_8: ITypedImageNode;
    readonly _txt_slot_0_name: ITypedTextNode;
    readonly _txt_slot_1_name: ITypedTextNode;
    readonly _txt_slot_2_name: ITypedTextNode;
    readonly _txt_slot_3_name: ITypedTextNode;
    readonly _txt_slot_4_name: ITypedTextNode;
    readonly _txt_slot_5_name: ITypedTextNode;
    readonly _txt_slot_6_name: ITypedTextNode;
    readonly _txt_slot_7_name: ITypedTextNode;
    readonly _txt_slot_8_name: ITypedTextNode;
    readonly _candidate_list: ITypedListNode;
    readonly _txt_title: ITypedTextNode;
    readonly _txt_formation_title: ITypedTextNode;
    readonly _txt_candidates_title: ITypedTextNode;
    readonly _btn_idle_rewards: ITypedButtonNode;
    readonly _btn_start: ITypedButtonNode;
}

export const UnitHitFeedbackComFields = {
    fx_flash: "image",
    loader_effect: "component",
    fx_float: "text",
} as const;

export type UnitHitFeedbackComNodes = keyof typeof UnitHitFeedbackComFields;

export interface IUnitHitFeedbackCom {
    readonly _fx_flash: ITypedImageNode;
    readonly _loader_effect: ITypedComponentNode;
    readonly _fx_float: ITypedTextNode;
}

export const IdleRewardsViewFields = {
    bg_idle_rewards: "image",
    bg_rewards_panel: "image",
    txt_title: "text",
    txt_offline_label: "text",
    txt_offline_minutes: "text",
    txt_claimable_label: "text",
    txt_claimable: "text",
    txt_total_label: "text",
    txt_total_rewards: "text",
    btn_claim: "button",
    btn_back: "button",
} as const;

export type IdleRewardsViewNodes = keyof typeof IdleRewardsViewFields;

export interface IIdleRewardsView {
    readonly _bg_idle_rewards: ITypedImageNode;
    readonly _bg_rewards_panel: ITypedImageNode;
    readonly _txt_title: ITypedTextNode;
    readonly _txt_offline_label: ITypedTextNode;
    readonly _txt_offline_minutes: ITypedTextNode;
    readonly _txt_claimable_label: ITypedTextNode;
    readonly _txt_claimable: ITypedTextNode;
    readonly _txt_total_label: ITypedTextNode;
    readonly _txt_total_rewards: ITypedTextNode;
    readonly _btn_claim: ITypedButtonNode;
    readonly _btn_back: ITypedButtonNode;
}

