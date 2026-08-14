/**
 * 分层暂停域：动画/表现层暂停的粒度。menu（菜单/设置 UI）与 combat（战斗表现）
 * 为独立暂停域——menu 暂停不冻结 combat（悬浮菜单时战斗背景继续动）；应用级暂停
 * （切后台）由调用方冻结全部域（freezeAll）。
 */
export enum EnumPauseDomain {
    Menu = "menu",
    Combat = "combat",
}
