// 由 `bun run fgui gen-types` 生成，禁止手改；源 XML 变更后重跑刷新。
// 包: CardGame (id=cgpk0001)

import type {
    ITypedButtonNode,
    ITypedImageNode,
    ITypedProgressNode,
    ITypedTextNode,
} from "../../framework";

export const CardBattleViewFields = {
    bg_battle: "image",
    bar_enemy_hp: "progress",
    txt_enemy_hp: "text",
    txt_player_hp: "text",
    txt_mana: "text",
    btn_card_0: "button",
    btn_card_1: "button",
    btn_card_2: "button",
    btn_end_turn: "button",
    txt_result: "text",
    btn_restart: "button",
} as const;

export type CardBattleViewNodes = keyof typeof CardBattleViewFields;

export interface ICardBattleView {
    readonly _bg_battle: ITypedImageNode;
    readonly _bar_enemy_hp: ITypedProgressNode;
    readonly _txt_enemy_hp: ITypedTextNode;
    readonly _txt_player_hp: ITypedTextNode;
    readonly _txt_mana: ITypedTextNode;
    readonly _btn_card_0: ITypedButtonNode;
    readonly _btn_card_1: ITypedButtonNode;
    readonly _btn_card_2: ITypedButtonNode;
    readonly _btn_end_turn: ITypedButtonNode;
    readonly _txt_result: ITypedTextNode;
    readonly _btn_restart: ITypedButtonNode;
}

