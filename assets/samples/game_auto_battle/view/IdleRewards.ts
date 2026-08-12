import type { Binding } from "../../../framework";
import type { IdleRewardState } from "../models";

/** 挂机页面 ViewModel：离线预览 + 累计收益 + 领取命令。 */
export interface IdleRewardsViewModel {
    /** 自上次结算起的离线分钟数（展示用，按当前墙钟预计算）。 */
    readonly offlineMinutes: number;
    /** 当前可领取的收益（预计算；领取后归零）。 */
    readonly claimableRewards: number;
    /** 累计已入账收益。 */
    readonly totalRewards: number;
    /** 是否可领取：存在待领收益时按钮可点。 */
    readonly canClaim: boolean;
}

/** 挂机页面命令：领取入账与返回，由调用方注入结算与导航操作。 */
export interface IdleRewardsCommands {
    /** 领取当前离线收益（幂等：结算即推进 lastSeenAt，重复领取不重复入账）。 */
    claim(): void;
    /** 返回编队页。 */
    back(): void;
}

/**
 * 挂机页 VM 派生：离线预览直接委托控制器 previewOffline（与 settleOffline 用
 * 同一速率与墙钟，保证"预览 = 实际入账"，不推进 lastSeenAt）。领取由命令执行。
 */
export function createIdleRewardsViewModel(
    state: IdleRewardState,
    preview: () => { readonly minutes: number; readonly earned: number },
): IdleRewardsViewModel {
    const p = preview();
    return {
        offlineMinutes: p.minutes,
        claimableRewards: p.earned,
        totalRewards: state.totalRewards,
        canClaim: p.earned > 0,
    };
}

/**
 * 挂机页绑定声明：离线时长/收益文本与领取/返回按钮（节点名对齐
 * IdleRewardsView 的约定：`txt_offline_minutes` / `txt_claimable` /
 * `txt_total_rewards` / `btn_claim` / `btn_back`）。
 */
export function createIdleRewardsBindings(
    commands: IdleRewardsCommands,
): readonly Binding<IdleRewardsViewModel>[] {
    return [
        {
            kind: "text",
            node: "txt_offline_minutes",
            get: (vm) => String(vm.offlineMinutes),
        },
        {
            kind: "text",
            node: "txt_claimable",
            get: (vm) => String(vm.claimableRewards),
        },
        {
            kind: "text",
            node: "txt_total_rewards",
            get: (vm) => String(vm.totalRewards),
        },
        {
            kind: "command",
            node: "btn_claim",
            run: () => commands.claim(),
        },
        {
            kind: "command",
            node: "btn_back",
            run: () => commands.back(),
        },
    ];
}
