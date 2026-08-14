/**
 * 重复打开策略：在导航建立时全局锁定。
 * - `focus-existing`：已存在同 route 页面时提升到其层级内的最高位置，不新增实例；
 *   仍受七层层级覆盖关系约束，不会压过更高层页面。
 * - `reject`：已存在同 route 页面时拒绝本次打开并返回原因。
 * - `allow-stack`：允许同 route 页面多实例堆叠。
 */
export enum EnumDuplicateOpenPolicy {
    FocusExisting = "focus-existing",
    Reject = "reject",
    AllowStack = "allow-stack",
}
