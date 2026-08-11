import type { TimeSource } from "../../contracts/time/TimeSource";
import { PauseDomain } from "../../contracts/time/PauseDomain";

export { PauseDomain } from "../../contracts/time/PauseDomain";

export interface GameClockOptions {
    readonly initialTime?: number;
    readonly timeScale?: number;
}

/** 倍率必须为有限正数（对齐 SimulationClock 语义，禁止 0/负数/NaN）。 */
function isValidRate(rate: number): boolean {
    return Number.isFinite(rate) && rate > 0;
}

/**
 * 表现时间控制点：动画/表现层唯一 timeSource 注入物，支持全局倍率、分层暂停、
 * 受控推进与显式跳跃。per-domain elapsed 模型：各域独立累计已推进量（elapsed），
 * 暂停域 elapsed 不增 → now(domain) 冻结；未暂停域正常推进。baseTime 供 jumpTo
 * 统一跳跃，各域 now = baseTime + domainElapsed[domain]。
 *
 * 与 SimulationClock 保持双轨：本钟连续推进（服务动画插值），SimulationClock
 * 离散 tick（服务确定性逻辑）；本钟可被 rate/pause/jump 控制，逻辑层仍只读
 * SimulationClock（确定性不回归）。
 */
export class GameClock implements TimeSource {
    private readonly domainElapsed: Record<PauseDomain, number> = {
        [PauseDomain.Menu]: 0,
        [PauseDomain.Combat]: 0,
    };
    private readonly domainPaused: Record<PauseDomain, boolean> = {
        [PauseDomain.Menu]: false,
        [PauseDomain.Combat]: false,
    };
    /** 应用级冻结标志：独立于分层暂停，thawAll 只清本标志（C-17 叠加语义）。 */
    private appFrozen = false;
    private baseTime: number;
    private rate: number;

    constructor(options: GameClockOptions = {}) {
        this.baseTime = options.initialTime ?? 0;
        this.rate = options.timeScale ?? 1;
        if (!isValidRate(this.rate)) {
            throw new Error("GameClock timeScale must be finite and greater than zero");
        }
    }

    /** 某域表现时间读数：baseTime + 该域已推进量（该域或应用级冻结时读数冻结）。 */
    now(domain: PauseDomain = PauseDomain.Combat): number {
        return this.baseTime + this.domainElapsed[domain];
    }

    get timeScale(): number {
        return this.rate;
    }

    setTimeScale(rate: number): void {
        if (!isValidRate(rate)) {
            throw new Error("GameClock timeScale must be finite and greater than zero");
        }
        this.rate = rate;
    }

    /** 暂停指定域：该域 elapsed 不再推进；resume 只解除本域暂停。 */
    pause(domain: PauseDomain): void {
        this.domainPaused[domain] = true;
    }

    resume(domain: PauseDomain): void {
        this.domainPaused[domain] = false;
    }

    /** 受控推进：只推进未冻结域（elapsed += ms * rate）；应用级冻结或该域暂停时不受影响。 */
    advance(milliseconds: number): void {
        if (milliseconds < 0) {
            throw new Error("GameClock advance must not be negative");
        }
        if (this.appFrozen) {
            return;
        }
        for (const domain of Object.keys(this.domainElapsed) as PauseDomain[]) {
            if (!this.domainPaused[domain]) {
                this.domainElapsed[domain] += milliseconds * this.rate;
            }
        }
    }

    /**
     * 显式时间跳跃：baseTime 设为 t、各域 elapsed 清零，使所有域 now 统一跳到 t。
     * 动画消费者按"seek 终态"处理（不补播中间帧，ADR-027 终态 = state 快照姿态）。
     */
    jumpTo(time: number): void {
        this.baseTime = time;
        for (const domain of Object.keys(this.domainElapsed) as PauseDomain[]) {
            this.domainElapsed[domain] = 0;
        }
    }

    /**
     * 应用级暂停（如切后台）：冻结全部域。与分层暂停（pause(domain)）独立叠加——
     * 应用级冻结期间所有域不推进；thawAll 只清应用级冻结，保留各域自身的分层暂停
     * （C-17：恢复只继续因自身 pause 冻结的部分，对齐 ADR-016 分组暂停语义）。
     */
    freezeAll(): void {
        this.appFrozen = true;
    }

    /** 解除应用级暂停：只清应用级冻结，各域分层暂停状态保留。 */
    thawAll(): void {
        this.appFrozen = false;
    }
}
