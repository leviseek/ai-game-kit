import type { GameFixture, IResourceProvider, IInputContextId, IInputSample, IInputSource, IModule, IResourceScope } from "../../framework";
import { createGameFixture, createInputMapper, createResourceProvider } from "../../framework";
import { createFightAudio, createFightAudioModule, type FightAudioHandle } from "./logic/audio";
import { createFightBattle, createFightBattleModule, type FightBattleHandle } from "./logic/battle";
import { createFightClock, createFightClockModule, type FightClock } from "./logic/clock";
import { createFightInputModule, createFightInputSource } from "./logic/input";
import type { FightAction, FightFrameData } from "./models";
import { createFightEffectPool, createFightPoolModule, type FightEffectPool } from "./logic/pool";
import { createFightResourceModule } from "./logic/resource";

// branded 上下文无运行期值：把业务字符串收窄为品牌类型
function toContext(context: string): IInputContextId {
    return context as unknown as IInputContextId;
}
/**
 * 格斗组合夹具的注入选项：测试可注入受控替身驱动协作行为；
 * 缺省项由夹具内部以引擎无关实现兜底，不依赖 cc/fgui。
 */
export interface FightFixtureOptions {
    /** 可控模拟时钟：缺省为内建时钟（从 0 开始，测试经 fixture.clock.advance 推进）。 */
    readonly clock?: FightClock;
    /** 底层输入源：缺省为可控输入源（测试经 fixture.input.push 注入事件）。 */
    readonly inputSource?: IInputSource;
    /** 音频后端：缺省为不可用后端（整体降级 no-op）；注入以观察命中播放与作用域停止。 */
    readonly audioBackend?: import("../../framework").IAudioBackend;
    /** 资源提供者：缺省为内存资源提供者；观察资源按作用域释放。 */
    readonly provider?: IResourceProvider;
}

/** 格斗组合夹具：在 GameFixture 生命周期接缝之上暴露各能力钩子。 */
export interface FightFixture extends GameFixture {
    /** 战斗控制器：固定步长逐帧推进，命中经对象池产生特效并播放音频。 */
    readonly battle: {
        readonly state: {
            readonly frame: number;
            readonly playerHp: number;
            readonly enemyHp: number;
            readonly combo: number;
            readonly activeMoveId: string | null;
        };
        tick(): void;
        /** 招式帧数据清单：判定盒/连招/帧数据只存在于游戏层。 */
        readonly moves: readonly FightFrameData[];
    };
    /** 可控模拟时钟：now() 供输入采样与帧推进。 */
    readonly clock: FightClock;
    /** 对象池：特效对象复用而非反复创建。 */
    readonly pool: {
        acquire(): unknown;
        release(item: unknown): void;
        /** 工厂累计创建次数：复用断言依赖。 */
        readonly created: number;
    };
    /** 输入上下文：切换激活上下文并路由类型化 action 采样，联动出招。 */
    readonly input: {
        readonly activeContext: string;
        setActiveContext(context: string): void;
        push(sourceId: string, pressed: boolean, value?: number): void;
        readonly samples: readonly IInputSample<FightAction>[];
    };
    /** 资源作用域：持有战斗资源，dispose 时释放。 */
    readonly resource: {
        readonly scope: IResourceScope | undefined;
        canUnload(bundle: string): boolean;
    };
    /** 音频服务：命中经作用域播放，dispose 时停止。 */
    readonly audio: {
        readonly degraded: boolean;
    };
}

function createDefaultProvider(): IResourceProvider {
    return createResourceProvider({
        loader: async (key) => key,
        unloadBundle: () => {},
    });
}

/**
 * 格斗组合夹具装配：显式声明模块清单，构造统一生命周期接缝，并把各能力
 * 钩子暴露给测试驱动。组合逻辑留在游戏层夹具内，AppRoot 只做薄转发
 * （design decision 3/4）。可控时钟、战斗、对象池、输入、资源、音频六类
 * 能力协作。
 */
export function createFightFixture(options: FightFixtureOptions = {}): FightFixture {
    const clock = options.clock ?? createFightClock();
    const provider = options.provider ?? createDefaultProvider();
    // 品类级资源作用域：暴露于 fixture.resource.scope，dispose 时释放
    const scope = provider.createScope();

    // 对象池：战斗命中借出、招式结束归还，复用而非反复创建
    const pool: FightEffectPool = createFightEffectPool();

    // 音频：命中播放 sfx，dispose 时作用域释放停止
    const audio: FightAudioHandle = createFightAudio({
        backend: options.audioBackend,
    });

    // 战斗：固定步长逐帧推进，命中借出特效并通知音频
    const battle: FightBattleHandle = createFightBattle({
        pool,
        onHit: () => {
            audio.playHit();
        },
    });

    // 输入：可控源 + InputMapper，push 注入事件，samples 记录采样；
    // onSample 按 action 联动出招（punch/kick/block → startMove）
    const inputHandle = createFightInputSource();
    const samples: IInputSample<FightAction>[] = [];
    const inputMapper = createInputMapper<FightAction>({
        timeSource: clock,
        activeContext: toContext("gameplay"),
        mappings: {
            gameplay: {
                "keyboard.j": "punch",
                "keyboard.k": "kick",
                "keyboard.l": "block",
            },
            ui: {},
        },
        source: options.inputSource ?? inputHandle.source,
        onSample: (sample) => {
            samples.push(sample);

            // 只有按下事件联动出招，释放事件只记录采样
            if (!sample.pressed) {
                return;
            }
            battle.startMove(sample.action);
        },
    });

    const modules: IModule[] = [
        createFightClockModule(clock),
        createFightBattleModule(battle),
        createFightPoolModule(pool),
        createFightInputModule(inputHandle),
        createFightResourceModule(provider, scope),
        createFightAudioModule(audio),
    ];

    const base = createGameFixture({
        id: "fight",
        modules,
        scope,
    });

    let disposed = false;

    return {
        ...base,
        battle: {
            get state() {
                return battle.state;
            },
            tick: () => battle.tick(),
            moves: battle.moves,
        },
        clock,
        pool: {
            acquire: () => pool.acquire(),
            release: (item: unknown) => pool.release(item as never),
            get created() {
                return pool.created;
            },
        },
        input: {
            get activeContext() {
                return String(inputMapper.activeContext);
            },
            setActiveContext: (context: string) => {
                inputMapper.setActiveContext(toContext(context));
            },
            push: (sourceId: string, pressed: boolean, value?: number) => {
                inputHandle.push(sourceId, pressed, value);
            },
            get samples() {
                // 返回快照，避免调用方持有内部数组引用绕过 readonly 约束
                return [...samples];
            },
        },
        resource: {
            scope,
            canUnload: (bundle: string) => provider.canUnload(bundle),
        },
        audio: {
            get degraded() {
                return audio.service.degraded;
            },
        },
        dispose: async () => {
            if (disposed) {
                return;
            }
            disposed = true;
            // 统一释放组合根持有的共享能力：模块 dispose 保持无副作用，
            // 避免 failRollback 探针复用模块实例时提前销毁夹具自身能力
            inputMapper.dispose();
            battle.dispose();
            audio.dispose();
            pool.dispose();
            scope.release();
            await base.dispose();
        },
    };
}
