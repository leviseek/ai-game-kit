import { EnumUiLayer } from "../enums/EnumUiLayer";

/**
 * 七层层级运行时常量：从低到高 scene < normal < popup < guide < toast <
 * loading < system。与 EnumUiLayer 同模块命名（constants 承载运行期值，
 * enums 承载类型），导航实现按此顺序推导层级覆盖关系。
 */
export const UI_LAYER_ORDER: readonly EnumUiLayer[] = [EnumUiLayer.Scene, EnumUiLayer.Normal, EnumUiLayer.Popup, EnumUiLayer.Guide, EnumUiLayer.Toast, EnumUiLayer.Loading, EnumUiLayer.System];
