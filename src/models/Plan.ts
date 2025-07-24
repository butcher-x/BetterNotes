/**
 * Plan 数据结构接口
 * 复习计划用于控制 BetterNotes 条目的复习节奏。
 * 一个 Plan 可被多个 Collection 引用。
 */
export interface Plan {
    /** 计划名称 */
    name: string;

    /**
     * 自定义间隔天数数组。
     * 数组的第 i 个元素表示熟练度为 i (从 0 开始) 时下一次复习距今的天数。
     * 长度最多 6。
     */
    intervals: number[];

    /**
     * 当条目熟练度 > 5 时，随机在 [min, max] 区间内挑选天数作为下一次复习间隔（闭区间）。
     */
    min: number;

    /** 参见 min 描述 */
    max: number;

    /**
     * 高级区间是否启用 FSRS。
     * 当 intervals[proficiency] === 0 时：
     *   fsrs === false → 使用随机区间 [min,max]
     *   fsrs === true  → 使用 FSRS 算法调度
     */
    fsrs: boolean;

    /** 预留字段，方便未来扩展 */
    reserve?: any;
}

/**
 * 
 */
export const DEFAULT_PLAN: Omit<Plan, 'name'> = {
    intervals: [0, 0, 0, 0, 0, 0],
    min: 45,
    max: 90,
    fsrs: false
}; 