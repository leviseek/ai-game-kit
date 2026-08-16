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
    battle_bg_tint: "image",
    battle_bg_scanlines: "image",
    battle_bg_vignette: "image",
    battle_hud_light: "image",
    battle_hud_plate: "image",
    battle_field_shadow: "image",
    battle_field_material: "image",
    battle_field_frame: "image",
    battle_field_surface: "image",
    battle_field_divider: "image",
    battle_deco_chevron_left: "image",
    battle_deco_chevron_right: "image",
    battle_deco_blocks: "image",
    battlefield_slots: "component",
    container_units: "component",
    container_effects: "component",
    battle_title: "text",
    txt_round: "text",
    battle_log_shadow: "image",
    battle_log_panel: "image",
    battle_log_frame: "image",
    battle_log_surface: "image",
    battle_log_divider: "image",
    battle_log_label: "text",
    txt_log: "text",
    battle_action_dock: "image",
    battle_speed_glow: "image",
    battle_speed_frame: "image",
    battle_restart_glow: "image",
    battle_restart_frame: "image",
    battle_action_label: "text",
    result_plate: "image",
    txt_result: "text",
    btn_restart: "button",
    btn_speed: "button",
    vs_bg: "image",
    vs_left: "text",
    vs_right: "text",
    vs_badge: "text",
    battle_deco_stars: "image",
    battle_deco_arrows: "image",
} as const;

export type AutoBattleViewNodes = keyof typeof AutoBattleViewFields;

export interface IAutoBattleView {
    readonly _bg_battle: ITypedImageNode;
    readonly _battle_bg_tint: ITypedImageNode;
    readonly _battle_bg_scanlines: ITypedImageNode;
    readonly _battle_bg_vignette: ITypedImageNode;
    readonly _battle_hud_light: ITypedImageNode;
    readonly _battle_hud_plate: ITypedImageNode;
    readonly _battle_field_shadow: ITypedImageNode;
    readonly _battle_field_material: ITypedImageNode;
    readonly _battle_field_frame: ITypedImageNode;
    readonly _battle_field_surface: ITypedImageNode;
    readonly _battle_field_divider: ITypedImageNode;
    readonly _battle_deco_chevron_left: ITypedImageNode;
    readonly _battle_deco_chevron_right: ITypedImageNode;
    readonly _battle_deco_blocks: ITypedImageNode;
    readonly _battlefield_slots: ITypedComponentNode;
    readonly _container_units: ITypedComponentNode;
    readonly _container_effects: ITypedComponentNode;
    readonly _battle_title: ITypedTextNode;
    readonly _txt_round: ITypedTextNode;
    readonly _battle_log_shadow: ITypedImageNode;
    readonly _battle_log_panel: ITypedImageNode;
    readonly _battle_log_frame: ITypedImageNode;
    readonly _battle_log_surface: ITypedImageNode;
    readonly _battle_log_divider: ITypedImageNode;
    readonly _battle_log_label: ITypedTextNode;
    readonly _txt_log: ITypedTextNode;
    readonly _battle_action_dock: ITypedImageNode;
    readonly _battle_speed_glow: ITypedImageNode;
    readonly _battle_speed_frame: ITypedImageNode;
    readonly _battle_restart_glow: ITypedImageNode;
    readonly _battle_restart_frame: ITypedImageNode;
    readonly _battle_action_label: ITypedTextNode;
    readonly _result_plate: ITypedImageNode;
    readonly _txt_result: ITypedTextNode;
    readonly _btn_restart: ITypedButtonNode;
    readonly _btn_speed: ITypedButtonNode;
    readonly _vs_bg: ITypedImageNode;
    readonly _vs_left: ITypedTextNode;
    readonly _vs_right: ITypedTextNode;
    readonly _vs_badge: ITypedTextNode;
    readonly _battle_deco_stars: ITypedImageNode;
    readonly _battle_deco_arrows: ITypedImageNode;
}

export const LineupEditorViewFields = {
    bg_lineup: "image",
    bg_lineup_tint: "image",
    lineup_bg_scanlines: "image",
    bg_lineup_vignette: "image",
    hud_lineup_title_plate: "image",
    hud_lineup_light: "image",
    shadow_formation_panel: "image",
    bg_formation_panel: "image",
    frame_formation_panel: "image",
    surface_formation_panel: "image",
    shadow_candidates_panel: "image",
    divider_formation: "image",
    shadow_slot_0: "image",
    img_slot_0: "image",
    highlight_slot_0: "image",
    frame_slot_0: "image",
    shadow_slot_1: "image",
    img_slot_1: "image",
    highlight_slot_1: "image",
    frame_slot_1: "image",
    shadow_slot_2: "image",
    img_slot_2: "image",
    highlight_slot_2: "image",
    frame_slot_2: "image",
    shadow_slot_3: "image",
    img_slot_3: "image",
    highlight_slot_3: "image",
    frame_slot_3: "image",
    shadow_slot_4: "image",
    img_slot_4: "image",
    highlight_slot_4: "image",
    frame_slot_4: "image",
    shadow_slot_5: "image",
    img_slot_5: "image",
    highlight_slot_5: "image",
    frame_slot_5: "image",
    shadow_slot_6: "image",
    img_slot_6: "image",
    highlight_slot_6: "image",
    frame_slot_6: "image",
    shadow_slot_7: "image",
    img_slot_7: "image",
    highlight_slot_7: "image",
    frame_slot_7: "image",
    shadow_slot_8: "image",
    img_slot_8: "image",
    highlight_slot_8: "image",
    frame_slot_8: "image",
    shadow_slot_9: "image",
    img_slot_9: "image",
    highlight_slot_9: "image",
    frame_slot_9: "image",
    shadow_slot_10: "image",
    img_slot_10: "image",
    highlight_slot_10: "image",
    frame_slot_10: "image",
    bg_candidates_panel: "image",
    frame_candidates_panel: "image",
    surface_candidates_panel: "image",
    divider_candidates: "image",
    slot_0: "button",
    slot_1: "button",
    slot_2: "button",
    slot_3: "button",
    slot_4: "button",
    slot_5: "button",
    slot_6: "button",
    slot_7: "button",
    slot_8: "button",
    slot_9: "button",
    slot_10: "button",
    slot_selected_0: "image",
    slot_selected_1: "image",
    slot_selected_2: "image",
    slot_selected_3: "image",
    slot_selected_4: "image",
    slot_selected_5: "image",
    slot_selected_6: "image",
    slot_selected_7: "image",
    slot_selected_8: "image",
    slot_selected_9: "image",
    slot_selected_10: "image",
    nameplate_slot_0: "image",
    nameplate_slot_1: "image",
    nameplate_slot_2: "image",
    nameplate_slot_3: "image",
    nameplate_slot_4: "image",
    nameplate_slot_5: "image",
    nameplate_slot_6: "image",
    nameplate_slot_7: "image",
    nameplate_slot_8: "image",
    nameplate_slot_9: "image",
    nameplate_slot_10: "image",
    txt_slot_0_name: "text",
    txt_slot_1_name: "text",
    txt_slot_2_name: "text",
    txt_slot_3_name: "text",
    txt_slot_4_name: "text",
    txt_slot_5_name: "text",
    txt_slot_6_name: "text",
    txt_slot_7_name: "text",
    txt_slot_8_name: "text",
    txt_slot_9_name: "text",
    txt_slot_10_name: "text",
    candidate_list: "list",
    txt_title: "text",
    txt_hud_meta: "text",
    txt_hud_status: "text",
    txt_formation_title: "text",
    txt_candidates_title: "text",
    dock_lineup_actions: "image",
    glow_idle_rewards: "image",
    frame_idle_rewards: "image",
    glow_start_battle: "image",
    frame_start_battle: "image",
    btn_idle_rewards: "button",
    btn_start: "button",
    deco_lineup_chevron: "image",
    deco_lineup_chevron_right: "image",
    deco_lineup_blocks: "image",
    deco_lineup_stars: "image",
    deco_lineup_arrows: "image",
} as const;

export type LineupEditorViewNodes = keyof typeof LineupEditorViewFields;

export interface ILineupEditorView {
    readonly _bg_lineup: ITypedImageNode;
    readonly _bg_lineup_tint: ITypedImageNode;
    readonly _lineup_bg_scanlines: ITypedImageNode;
    readonly _bg_lineup_vignette: ITypedImageNode;
    readonly _hud_lineup_title_plate: ITypedImageNode;
    readonly _hud_lineup_light: ITypedImageNode;
    readonly _shadow_formation_panel: ITypedImageNode;
    readonly _bg_formation_panel: ITypedImageNode;
    readonly _frame_formation_panel: ITypedImageNode;
    readonly _surface_formation_panel: ITypedImageNode;
    readonly _shadow_candidates_panel: ITypedImageNode;
    readonly _divider_formation: ITypedImageNode;
    readonly _shadow_slot_0: ITypedImageNode;
    readonly _img_slot_0: ITypedImageNode;
    readonly _highlight_slot_0: ITypedImageNode;
    readonly _frame_slot_0: ITypedImageNode;
    readonly _shadow_slot_1: ITypedImageNode;
    readonly _img_slot_1: ITypedImageNode;
    readonly _highlight_slot_1: ITypedImageNode;
    readonly _frame_slot_1: ITypedImageNode;
    readonly _shadow_slot_2: ITypedImageNode;
    readonly _img_slot_2: ITypedImageNode;
    readonly _highlight_slot_2: ITypedImageNode;
    readonly _frame_slot_2: ITypedImageNode;
    readonly _shadow_slot_3: ITypedImageNode;
    readonly _img_slot_3: ITypedImageNode;
    readonly _highlight_slot_3: ITypedImageNode;
    readonly _frame_slot_3: ITypedImageNode;
    readonly _shadow_slot_4: ITypedImageNode;
    readonly _img_slot_4: ITypedImageNode;
    readonly _highlight_slot_4: ITypedImageNode;
    readonly _frame_slot_4: ITypedImageNode;
    readonly _shadow_slot_5: ITypedImageNode;
    readonly _img_slot_5: ITypedImageNode;
    readonly _highlight_slot_5: ITypedImageNode;
    readonly _frame_slot_5: ITypedImageNode;
    readonly _shadow_slot_6: ITypedImageNode;
    readonly _img_slot_6: ITypedImageNode;
    readonly _highlight_slot_6: ITypedImageNode;
    readonly _frame_slot_6: ITypedImageNode;
    readonly _shadow_slot_7: ITypedImageNode;
    readonly _img_slot_7: ITypedImageNode;
    readonly _highlight_slot_7: ITypedImageNode;
    readonly _frame_slot_7: ITypedImageNode;
    readonly _shadow_slot_8: ITypedImageNode;
    readonly _img_slot_8: ITypedImageNode;
    readonly _highlight_slot_8: ITypedImageNode;
    readonly _frame_slot_8: ITypedImageNode;
    readonly _shadow_slot_9: ITypedImageNode;
    readonly _img_slot_9: ITypedImageNode;
    readonly _highlight_slot_9: ITypedImageNode;
    readonly _frame_slot_9: ITypedImageNode;
    readonly _shadow_slot_10: ITypedImageNode;
    readonly _img_slot_10: ITypedImageNode;
    readonly _highlight_slot_10: ITypedImageNode;
    readonly _frame_slot_10: ITypedImageNode;
    readonly _bg_candidates_panel: ITypedImageNode;
    readonly _frame_candidates_panel: ITypedImageNode;
    readonly _surface_candidates_panel: ITypedImageNode;
    readonly _divider_candidates: ITypedImageNode;
    readonly _slot_0: ITypedButtonNode;
    readonly _slot_1: ITypedButtonNode;
    readonly _slot_2: ITypedButtonNode;
    readonly _slot_3: ITypedButtonNode;
    readonly _slot_4: ITypedButtonNode;
    readonly _slot_5: ITypedButtonNode;
    readonly _slot_6: ITypedButtonNode;
    readonly _slot_7: ITypedButtonNode;
    readonly _slot_8: ITypedButtonNode;
    readonly _slot_9: ITypedButtonNode;
    readonly _slot_10: ITypedButtonNode;
    readonly _slot_selected_0: ITypedImageNode;
    readonly _slot_selected_1: ITypedImageNode;
    readonly _slot_selected_2: ITypedImageNode;
    readonly _slot_selected_3: ITypedImageNode;
    readonly _slot_selected_4: ITypedImageNode;
    readonly _slot_selected_5: ITypedImageNode;
    readonly _slot_selected_6: ITypedImageNode;
    readonly _slot_selected_7: ITypedImageNode;
    readonly _slot_selected_8: ITypedImageNode;
    readonly _slot_selected_9: ITypedImageNode;
    readonly _slot_selected_10: ITypedImageNode;
    readonly _nameplate_slot_0: ITypedImageNode;
    readonly _nameplate_slot_1: ITypedImageNode;
    readonly _nameplate_slot_2: ITypedImageNode;
    readonly _nameplate_slot_3: ITypedImageNode;
    readonly _nameplate_slot_4: ITypedImageNode;
    readonly _nameplate_slot_5: ITypedImageNode;
    readonly _nameplate_slot_6: ITypedImageNode;
    readonly _nameplate_slot_7: ITypedImageNode;
    readonly _nameplate_slot_8: ITypedImageNode;
    readonly _nameplate_slot_9: ITypedImageNode;
    readonly _nameplate_slot_10: ITypedImageNode;
    readonly _txt_slot_0_name: ITypedTextNode;
    readonly _txt_slot_1_name: ITypedTextNode;
    readonly _txt_slot_2_name: ITypedTextNode;
    readonly _txt_slot_3_name: ITypedTextNode;
    readonly _txt_slot_4_name: ITypedTextNode;
    readonly _txt_slot_5_name: ITypedTextNode;
    readonly _txt_slot_6_name: ITypedTextNode;
    readonly _txt_slot_7_name: ITypedTextNode;
    readonly _txt_slot_8_name: ITypedTextNode;
    readonly _txt_slot_9_name: ITypedTextNode;
    readonly _txt_slot_10_name: ITypedTextNode;
    readonly _candidate_list: ITypedListNode;
    readonly _txt_title: ITypedTextNode;
    readonly _txt_hud_meta: ITypedTextNode;
    readonly _txt_hud_status: ITypedTextNode;
    readonly _txt_formation_title: ITypedTextNode;
    readonly _txt_candidates_title: ITypedTextNode;
    readonly _dock_lineup_actions: ITypedImageNode;
    readonly _glow_idle_rewards: ITypedImageNode;
    readonly _frame_idle_rewards: ITypedImageNode;
    readonly _glow_start_battle: ITypedImageNode;
    readonly _frame_start_battle: ITypedImageNode;
    readonly _btn_idle_rewards: ITypedButtonNode;
    readonly _btn_start: ITypedButtonNode;
    readonly _deco_lineup_chevron: ITypedImageNode;
    readonly _deco_lineup_chevron_right: ITypedImageNode;
    readonly _deco_lineup_blocks: ITypedImageNode;
    readonly _deco_lineup_stars: ITypedImageNode;
    readonly _deco_lineup_arrows: ITypedImageNode;
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

export const BattleSlotComFields = {
    battle_slot_surface: "image",
} as const;

export type BattleSlotComNodes = keyof typeof BattleSlotComFields;

export interface IBattleSlotCom {
    readonly _battle_slot_surface: ITypedImageNode;
}

export const BattlefieldSlotsComFields = {
    battle_slot_0_0: "component",
    battle_slot_0_1: "component",
    battle_slot_0_2: "component",
    battle_slot_1_n1: "component",
    battle_slot_1_0: "component",
    battle_slot_1_1: "component",
    battle_slot_1_2: "component",
    battle_slot_2_0: "component",
    battle_slot_2_1: "component",
    battle_slot_2_2: "component",
    battle_slot_3_n1: "component",
    battle_slot_3_0: "component",
    battle_slot_3_1: "component",
    battle_slot_3_2: "component",
    battle_slot_4_0: "component",
    battle_slot_4_1: "component",
    battle_slot_4_2: "component",
    battle_slot_5_n1: "component",
    battle_slot_5_0: "component",
    battle_slot_5_1: "component",
    battle_slot_5_2: "component",
    battle_slot_6_0: "component",
    battle_slot_6_1: "component",
    battle_slot_6_2: "component",
    battle_slot_7_n1: "component",
    battle_slot_7_0: "component",
    battle_slot_7_1: "component",
    battle_slot_7_2: "component",
    battle_slot_8_0: "component",
    battle_slot_8_1: "component",
    battle_slot_8_2: "component",
    battle_slot_9_n1: "component",
    battle_slot_9_0: "component",
    battle_slot_9_1: "component",
    battle_slot_9_2: "component",
    battle_slot_10_0: "component",
    battle_slot_10_1: "component",
    battle_slot_10_2: "component",
} as const;

export type BattlefieldSlotsComNodes = keyof typeof BattlefieldSlotsComFields;

export interface IBattlefieldSlotsCom {
    readonly _battle_slot_0_0: ITypedComponentNode;
    readonly _battle_slot_0_1: ITypedComponentNode;
    readonly _battle_slot_0_2: ITypedComponentNode;
    readonly _battle_slot_1_n1: ITypedComponentNode;
    readonly _battle_slot_1_0: ITypedComponentNode;
    readonly _battle_slot_1_1: ITypedComponentNode;
    readonly _battle_slot_1_2: ITypedComponentNode;
    readonly _battle_slot_2_0: ITypedComponentNode;
    readonly _battle_slot_2_1: ITypedComponentNode;
    readonly _battle_slot_2_2: ITypedComponentNode;
    readonly _battle_slot_3_n1: ITypedComponentNode;
    readonly _battle_slot_3_0: ITypedComponentNode;
    readonly _battle_slot_3_1: ITypedComponentNode;
    readonly _battle_slot_3_2: ITypedComponentNode;
    readonly _battle_slot_4_0: ITypedComponentNode;
    readonly _battle_slot_4_1: ITypedComponentNode;
    readonly _battle_slot_4_2: ITypedComponentNode;
    readonly _battle_slot_5_n1: ITypedComponentNode;
    readonly _battle_slot_5_0: ITypedComponentNode;
    readonly _battle_slot_5_1: ITypedComponentNode;
    readonly _battle_slot_5_2: ITypedComponentNode;
    readonly _battle_slot_6_0: ITypedComponentNode;
    readonly _battle_slot_6_1: ITypedComponentNode;
    readonly _battle_slot_6_2: ITypedComponentNode;
    readonly _battle_slot_7_n1: ITypedComponentNode;
    readonly _battle_slot_7_0: ITypedComponentNode;
    readonly _battle_slot_7_1: ITypedComponentNode;
    readonly _battle_slot_7_2: ITypedComponentNode;
    readonly _battle_slot_8_0: ITypedComponentNode;
    readonly _battle_slot_8_1: ITypedComponentNode;
    readonly _battle_slot_8_2: ITypedComponentNode;
    readonly _battle_slot_9_n1: ITypedComponentNode;
    readonly _battle_slot_9_0: ITypedComponentNode;
    readonly _battle_slot_9_1: ITypedComponentNode;
    readonly _battle_slot_9_2: ITypedComponentNode;
    readonly _battle_slot_10_0: ITypedComponentNode;
    readonly _battle_slot_10_1: ITypedComponentNode;
    readonly _battle_slot_10_2: ITypedComponentNode;
}

export const IdleRewardsViewFields = {
    bg_idle_rewards: "image",
    rewards_bg_tint: "image",
    rewards_bg_scanlines: "image",
    rewards_bg_vignette: "image",
    idle_rewards_panel_shadow: "image",
    idle_rewards_panel_material: "image",
    idle_rewards_panel_frame: "image",
    bg_rewards_panel: "image",
    rewards_hud_light: "image",
    rewards_hud_plate: "image",
    txt_title: "text",
    rewards_hud_meta: "text",
    rewards_hud_status: "text",
    rewards_panel_divider: "image",
    rewards_claim_focus: "image",
    rewards_row_divider_0: "image",
    rewards_row_divider_1: "image",
    rewards_deco_chevron: "image",
    rewards_deco_blocks: "image",
    txt_offline_label: "text",
    txt_offline_minutes: "text",
    txt_claimable_label: "text",
    txt_claimable: "text",
    txt_total_label: "text",
    txt_total_rewards: "text",
    rewards_action_dock: "image",
    rewards_claim_glow: "image",
    rewards_claim_frame: "image",
    rewards_back_glow: "image",
    rewards_back_frame: "image",
    btn_claim: "button",
    btn_back: "button",
    rewards_deco_stars: "image",
    rewards_deco_arrows: "image",
} as const;

export type IdleRewardsViewNodes = keyof typeof IdleRewardsViewFields;

export interface IIdleRewardsView {
    readonly _bg_idle_rewards: ITypedImageNode;
    readonly _rewards_bg_tint: ITypedImageNode;
    readonly _rewards_bg_scanlines: ITypedImageNode;
    readonly _rewards_bg_vignette: ITypedImageNode;
    readonly _idle_rewards_panel_shadow: ITypedImageNode;
    readonly _idle_rewards_panel_material: ITypedImageNode;
    readonly _idle_rewards_panel_frame: ITypedImageNode;
    readonly _bg_rewards_panel: ITypedImageNode;
    readonly _rewards_hud_light: ITypedImageNode;
    readonly _rewards_hud_plate: ITypedImageNode;
    readonly _txt_title: ITypedTextNode;
    readonly _rewards_hud_meta: ITypedTextNode;
    readonly _rewards_hud_status: ITypedTextNode;
    readonly _rewards_panel_divider: ITypedImageNode;
    readonly _rewards_claim_focus: ITypedImageNode;
    readonly _rewards_row_divider_0: ITypedImageNode;
    readonly _rewards_row_divider_1: ITypedImageNode;
    readonly _rewards_deco_chevron: ITypedImageNode;
    readonly _rewards_deco_blocks: ITypedImageNode;
    readonly _txt_offline_label: ITypedTextNode;
    readonly _txt_offline_minutes: ITypedTextNode;
    readonly _txt_claimable_label: ITypedTextNode;
    readonly _txt_claimable: ITypedTextNode;
    readonly _txt_total_label: ITypedTextNode;
    readonly _txt_total_rewards: ITypedTextNode;
    readonly _rewards_action_dock: ITypedImageNode;
    readonly _rewards_claim_glow: ITypedImageNode;
    readonly _rewards_claim_frame: ITypedImageNode;
    readonly _rewards_back_glow: ITypedImageNode;
    readonly _rewards_back_frame: ITypedImageNode;
    readonly _btn_claim: ITypedButtonNode;
    readonly _btn_back: ITypedButtonNode;
    readonly _rewards_deco_stars: ITypedImageNode;
    readonly _rewards_deco_arrows: ITypedImageNode;
}

