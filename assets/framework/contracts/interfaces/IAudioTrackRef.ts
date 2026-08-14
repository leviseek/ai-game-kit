/** 音频资源键：归属 Bundle 与路径，与资源层 `kind: "asset"` 加载对齐。 */
export interface IAudioTrackRef {
    readonly bundle: string;
    readonly path: string;
}
