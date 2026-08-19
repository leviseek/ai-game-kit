import { ListViewDirection } from "./ListViewTypes";

export interface ListViewLayoutOptions {
    readonly direction: ListViewDirection;
    /** item 主轴尺寸；必须 > 0（为 0 时 stride 为 0，布局退化）。 */
    readonly itemSize: number;
    /** item 主轴间距；>= 0。 */
    readonly spacing: number;
    /** 可见区外预渲染缓冲（主轴像素）；>= 0，防滚动抖动。 */
    readonly buffer: number;
}

export interface ListViewLayout {
    /** 单个 item 的主轴步长（itemSize + spacing）。 */
    readonly stride: number;
    /** item 主轴尺寸（与 options.itemSize 一致，组件便捷读取）。 */
    readonly itemSize: number;
    /** count 个 item 的主轴内容总尺寸；count <= 0 时为 0。 */
    contentSize(count: number): number;
    /** 第 index 个 item 的主轴起始位置。 */
    itemPosition(index: number): number;
    /** 给定主轴偏移与视口尺寸，返回应渲染的闭区间 [first, last]；无可渲染项时 last = -1。 */
    visibleRange(offset: number, viewportSize: number, count: number): { first: number; last: number };
    /** 把主轴偏移钳制到合法范围 [0, max(0, 内容尺寸 - 视口)]（内容缩小后防越界）。 */
    clampOffset(offset: number, count: number, viewportSize: number): number;
}

/**
 * ListView 布局数学：纯函数、无引擎依赖，可脱离 Cocos 单测。
 * 坐标系约定：主轴偏移从内容起点（首项位置）起算，可见区为 [offset, offset + viewport]；
 * item i 占据 [i*stride, i*stride + itemSize]，与可见区（含 buffer 外扩）相交即视为可见。
 * 尾边界按 floor(end/stride) 取首项起点 <= end 的最大索引，精确落在边界上的 item 会被
 * 多渲染一个（安全方向：宁可多渲染也不在滚动中闪缺）。
 */
export function createListViewLayout(options: ListViewLayoutOptions): ListViewLayout {
    const stride = options.itemSize + options.spacing;
    const buffer = options.buffer;

    function contentSize(count: number): number {
        if (count <= 0) {
            return 0;
        }
        return count * options.itemSize + (count - 1) * options.spacing;
    }

    function itemPosition(index: number): number {
        return index * stride;
    }

    function visibleRange(offset: number, viewportSize: number, count: number): { first: number; last: number } {
        if (count <= 0) {
            return { first: 0, last: -1 };
        }
        const start = offset - buffer;
        const end = offset + viewportSize + buffer;
        const first = Math.max(0, Math.ceil((start - options.itemSize) / stride));
        const last = Math.min(count - 1, Math.floor(end / stride));
        return first <= last ? { first, last } : { first: 0, last: -1 };
    }

    function clampOffset(offset: number, count: number, viewportSize: number): number {
        const max = Math.max(0, contentSize(count) - viewportSize);
        return Math.min(Math.max(offset, 0), max);
    }

    return {
        stride,
        itemSize: options.itemSize,
        contentSize,
        itemPosition,
        visibleRange,
        clampOffset,
    };
}
