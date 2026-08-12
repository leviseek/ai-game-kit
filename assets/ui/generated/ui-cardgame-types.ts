// 由 `bun run fgui gen-types` 生成，禁止手改；源 XML 变更后重跑刷新。
// 包: CardGame (id=cgpk0001)

import type {
    TypedButtonNode,
    TypedImageNode,
    TypedProgressNode,
    TypedTextNode,
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
    readonly _bg_battle: TypedImageNode;
    readonly _bar_enemy_hp: TypedProgressNode;
    readonly _txt_enemy_hp: TypedTextNode;
    readonly _txt_player_hp: TypedTextNode;
    readonly _txt_mana: TypedTextNode;
    readonly _btn_card_0: TypedButtonNode;
    readonly _btn_card_1: TypedButtonNode;
    readonly _btn_card_2: TypedButtonNode;
    readonly _btn_end_turn: TypedButtonNode;
    readonly _txt_result: TypedTextNode;
    readonly _btn_restart: TypedButtonNode;
}

