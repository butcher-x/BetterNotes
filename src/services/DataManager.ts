import { Collection, DEFAULT_COLLECTION } from '../models/Collection';
import { Entry, DEFAULT_ENTRY } from '../models/Entry';
import { generateHash, formatDate } from '../utils/utils';
import { Plan, DEFAULT_PLAN } from '../models/Plan';
import { Tag } from '../models/Tag';
import { Preset } from '../models/Preset';

/**
 * 数据管理服务
 * 负责集合和条目的创建、查询、更新和删除
 */
export class DataManager {
    private collections: Map<string, Collection>;
    private entries: Map<string, Entry>;
    private plans: Map<string, Plan>;
    /** 标签表：tagName -> Tag */
    private tags: Map<string, Tag>;
    /** 预设提示词：label -> Preset */
    private presets: Map<string, Preset>;
    
    /**
     * 构造函数，初始化集合和条目存储
     */
    constructor() {
        this.collections = new Map<string, Collection>();
        this.entries = new Map<string, Entry>();
        this.plans = new Map<string, Plan>();
        this.tags = new Map<string, Tag>();
        this.presets = new Map<string, Preset>();

        // 初始化默认 Plan（不可删除）
        const defaultIntervals = [1, 1, 2, 3, 4, 7] as number[];
        const defaultPlan: Plan = {
            ...DEFAULT_PLAN,
            name: 'default',
            intervals: defaultIntervals,
            min: 10,
            max: 20,
            fsrs: false
        };
        this.plans.set('default', defaultPlan);
    }

    // ---------------------------- Tag Helpers ----------------------------

    /** 统一规范化标签名称：去首尾空格并转为小写 */
    private normalizeTag(tagName: string): string {
        return tagName.trim().toLowerCase();
    }

    /** 新增或递增标签引用 */
    private addTagReference(tagName: string): void {
        const t = this.normalizeTag(tagName);
        if (!t) return;
        const existing = this.tags.get(t);
        if (existing) {
            existing.count += 1;
            this.tags.set(t, existing);
        } else {
            this.tags.set(t, { tagName: t, count: 1 });
        }
    }

    /** 减少标签引用，计数为 0 时自动删除 */
    private removeTagReference(tagName: string): void {
        const t = this.normalizeTag(tagName);
        if (!t) return;
        const existing = this.tags.get(t);
        if (!existing) return;
        if (existing.count <= 1) {
            this.tags.delete(t);
        } else {
            existing.count -= 1;
            this.tags.set(t, existing);
        }
    }

    // ----------------------------- Tag API -----------------------------

    /** 获取全部标签（按名称排序） */
    getAllTags(): Tag[] {
        return Array.from(this.tags.values()).sort((a, b) => a.tagName.localeCompare(b.tagName));
    }

    /** 获取指定标签 */
    getTag(tagName: string): Tag | undefined {
        return this.tags.get(this.normalizeTag(tagName));
    }

    /**
     * 确保指定标签存在（如果不存在则创建，计数为0）。
     * 该方法仅用于在 UI 中提前创建标签，而不立即关联任何条目。
     * @param tagName 标签名称
     */
    ensureTag(tagName: string): void {
        const t = this.normalizeTag(tagName);
        if (!t) return;
        if (!this.tags.has(t)) {
            this.tags.set(t, { tagName: t, count: 0 });
        }
    }

    /** 根据标签获取条目列表 */
    getEntriesByTag(tagName: string): Entry[] {
        const t = this.normalizeTag(tagName);
        return Array.from(this.entries.values()).filter(e => e.tag?.map(x => this.normalizeTag(x)).includes(t));
    }
    
    /**
     * 创建新的集合
     * @param name 集合名称（必需）
     * @param options 集合附加选项
     * @returns 创建的集合对象
     */
    createCollection(name: string, options: Partial<Collection> = {}): Collection {
        if (this.collections.has(name)) {
            throw new Error(`集合 "${name}" 已存在`);
        }
        
        const collection: Collection = {
            ...DEFAULT_COLLECTION,
            name,
            ...options
        };
        
        this.collections.set(name, collection);
        return collection;
    }
    
    /**
     * 获取集合
     * @param name 集合名称
     * @returns 集合对象或undefined（如果不存在）
     */
    getCollection(name: string): Collection | undefined {
        return this.collections.get(name);
    }
    
    /**
     * 获取所有集合
     * @returns 所有集合的数组
     */
    getAllCollections(): Collection[] {
        return Array.from(this.collections.values());
    }
    
    /**
     * 更新集合
     * @param name 集合名称
     * @param updates 要更新的属性
     * @returns 更新后的集合对象
     */
    updateCollection(name: string, updates: Partial<Collection>): Collection {
        const collection = this.getCollection(name);
        if (!collection) {
            throw new Error(`集合 "${name}" 不存在`);
        }
        
        // 从updates中删除name，确保名称不变
        const { name: _, ...restUpdates } = updates;
        
        const updatedCollection = {
            ...collection,
            ...restUpdates,
            name // 确保名称不变
        };
        
        this.collections.set(name, updatedCollection);
        return updatedCollection;
    }
    
    /**
     * 删除集合
     * @param name 集合名称
     * @returns 是否成功删除
     */
    deleteCollection(name: string): boolean {
        const collection = this.getCollection(name);
        if (collection) {
            // 先删除该集合下的所有条目
            this.entries.forEach((entry, hash) => {
                if (entry.set === name) {
                    this.entries.delete(hash);
                }
            });
            
            return this.collections.delete(name);
        }
        return false;
    }
    
    /**
     * 创建条目
     * @param value 条目内容
     * @param set 所属集合
     * @param options 其他选项
     * @returns 创建的条目对象
     */
    createEntry(value: string, set: string, options: Partial<Omit<Entry, 'hash' | 'value' | 'set' | 'addTime'>> = {}): Entry {
        // 检查集合是否存在
        if (!this.collections.has(set)) {
            throw new Error(`集合 "${set}" 不存在`);
        }
        
        const hash = generateHash();
        const now = formatDate(); // 格式为 YYYY-MM-DD
        const currentTimestamp = Date.now(); // 获取当前时间戳
        
        // 先创建基础对象，然后应用默认值和选项，最后设置关键属性确保不被覆盖
        const entry: Entry = {
            ...DEFAULT_ENTRY, // 基础默认值
            ...options,       // 用户提供的选项
            hash,             // 必须保留的属性
            value,
            set,
            addTime: now,
            expireTime: now, 
            sourceFile: options.sourceFile || "",
            // 确保数组字段为独立副本，避免多个条目共享引用
            tag: options.tag ? [...options.tag] : [],
            link: options.link ? [...options.link] : [],
            attachmentFile: options.attachmentFile ? [...options.attachmentFile] : [],
            mtime: currentTimestamp, // 确保修改时间总是当前时间戳
        };
        
        this.entries.set(hash, entry);

        // 处理标签引用计数
        const uniqueTags = new Set(entry.tag.map(t => this.normalizeTag(t)));
        uniqueTags.forEach(t => this.addTagReference(t));
        return entry;
    }
    
    /**
     * 创建新的条目，使用指定的哈希值
     * @param value 条目文本内容
     * @param set 所属集合名称
     * @param hash 指定的哈希值（确保唯一性）
     * @param options 条目附加选项
     * @returns 创建的条目对象
     */
    createEntryWithHash(value: string, set: string, hash: string, options: Partial<Omit<Entry, 'hash' | 'value' | 'set' | 'addTime'>> = {}): Entry {
        // 检查集合是否存在
        if (!this.collections.has(set)) {
            throw new Error(`集合 "${set}" 不存在`);
        }
        
        // 检查哈希是否已存在
        if (this.entries.has(hash)) {
            throw new Error(`哈希值 "${hash}" 已存在`);
        }
        
        const now = formatDate(); // 格式为 YYYY-MM-DD
        const currentTimestamp = Date.now(); // 获取当前时间戳
        
        // 先创建基础对象，然后应用默认值和选项，最后设置关键属性确保不被覆盖
        const entry: Entry = {
            ...DEFAULT_ENTRY, // 基础默认值
            ...options,       // 用户提供的选项
            hash,             // 必须保留的属性
            value,
            set,
            addTime: now,
            expireTime: now, 
            sourceFile: options.sourceFile || "",
            // 确保数组字段为独立副本，避免多个条目共享引用
            tag: options.tag ? [...options.tag] : [],
            link: options.link ? [...options.link] : [],
            attachmentFile: options.attachmentFile ? [...options.attachmentFile] : [],
            mtime: currentTimestamp, // 确保修改时间总是当前时间戳
        };
        
        this.entries.set(hash, entry);

        // 处理标签引用计数
        const uniqueTags = new Set(entry.tag.map(t => this.normalizeTag(t)));
        uniqueTags.forEach(t => this.addTagReference(t));
        return entry;
    }
    
    /**
     * 获取条目
     * @param hash 条目哈希值
     * @returns 条目对象或undefined（如果不存在）
     */
    getEntry(hash: string): Entry | undefined {
        return this.entries.get(hash);
    }
    
    /**
     * 获取条目（别名方法，与getEntry功能相同）
     * 提供此方法是为了保持API命名一致性
     * @param hash 条目哈希值
     * @returns 条目对象或undefined（如果不存在）
     */
    getEntryByHash(hash: string): Entry | undefined {
        return this.getEntry(hash);
    }
    
    /**
     * 获取指定集合的所有条目
     * @param set 集合名称
     * @returns 条目对象数组
     */
    getEntriesBySet(set: string): Entry[] {
        return Array.from(this.entries.values()).filter(entry => entry.set === set);
    }
    
    /**
     * 获取所有条目
     * @returns 所有条目对象数组
     */
    getAllEntries(): Entry[] {
        return Array.from(this.entries.values());
    }
    
    /**
     * 更新条目
     * @param hash 条目哈希值
     * @param updates 要更新的属性
     * @returns 更新后的条目对象
     */
    updateEntry(hash: string, updates: Partial<Entry>): Entry {
        const entry = this.getEntry(hash);
        if (!entry) {
            throw new Error(`条目 "${hash}" 不存在`);
        }
        
        // 检查集合是否存在（如果更新了集合）
        if (updates.set && updates.set !== entry.set && !this.collections.has(updates.set)) {
            throw new Error(`集合 "${updates.set}" 不存在`);
        }
        
        // 处理标签增删
        const oldTags = new Set(entry.tag.map(t => this.normalizeTag(t)));
        let newTagArray: string[] = entry.tag;
        if (updates.tag) {
            newTagArray = updates.tag;
        }
        const newTags = new Set(newTagArray.map(t => this.normalizeTag(t)));

        // 计算差异
        const addedTags = Array.from(newTags).filter(t => !oldTags.has(t));
        const removedTags = Array.from(oldTags).filter(t => !newTags.has(t));

        addedTags.forEach(t => this.addTagReference(t));
        removedTags.forEach(t => this.removeTagReference(t));
        
        // 每次更新条目时都更新 mtime
        updates.mtime = Date.now();
        
        const updatedEntry = {
            ...entry,
            ...updates,
            tag: newTagArray,
            hash // 确保哈希值不变
        };
        
        this.entries.set(hash, updatedEntry);
        return updatedEntry;
    }
    
    /**
     * 删除条目
     * @param hash 条目哈希值
     * @returns 是否成功删除
     */
    deleteEntry(hash: string): boolean {
        const entry = this.entries.get(hash);
        if (entry) {
            const uniqueTags = new Set(entry.tag.map(t => this.normalizeTag(t)));
            uniqueTags.forEach(t => this.removeTagReference(t));
        }
        return this.entries.delete(hash);
    }
    
    /**
     * 将条目添加到集合
     * @param hash 条目哈希值
     * @param set 目标集合名称
     * @returns 更新后的条目对象
     */
    addEntryToCollection(hash: string, set: string): Entry {
        // 检查集合是否存在
        if (!this.collections.has(set)) {
            throw new Error(`集合 "${set}" 不存在`);
        }
        
        return this.updateEntry(hash, { set });
    }
    
    /**
     * 将数据序列化为JSON
     * @returns 序列化的数据对象
     */
    serialize(): { collections: Collection[], entries: Entry[], plans: Plan[], tags: Tag[], presets: Preset[] } {
        
        return {
            collections: Array.from(this.collections.values()),
            entries: Array.from(this.entries.values()),
            plans: Array.from(this.plans.values()),
            tags: Array.from(this.tags.values()),
            presets: Array.from(this.presets.values())
        };
    }
    
    /**
     * 从JSON数据恢复
     * @param data 序列化的数据对象
     */
    deserialize(data: { collections: Collection[], entries: Entry[], plans?: Plan[], tags?: Tag[], presets?: Preset[] }): void {
        this.collections.clear();
        this.entries.clear();
        this.plans.clear();
        this.tags.clear();
        this.presets.clear();
        
        data.collections.forEach(collection => {
            this.collections.set(collection.name, collection);
        });
        
        data.entries.forEach(entry => {
            this.entries.set(entry.hash, entry);
        });
        
        // plans
        if (data.plans) {
            data.plans.forEach(plan => {
                if (plan.fsrs === undefined) (plan as any).fsrs = false;
                this.plans.set(plan.name, plan);
            });
        }

        // tags：如果存在直接使用；否则根据 entries 重建
        if (data.tags) {
            data.tags.forEach(tag => {
                this.tags.set(this.normalizeTag(tag.tagName), tag);
            });
        } else {
            // 根据条目重建
            this.entries.forEach(entry => {
                const unique = new Set(entry.tag.map(t => this.normalizeTag(t)));
                unique.forEach(t => this.addTagReference(t));
            });
        }

        // presets
        if (Array.isArray(data.presets)) {
            data.presets.forEach(p => {
                this.presets.set(p.label, p);
            });
        }

        // ensure default plan exists
        if (!this.plans.has('default')) {
            const defaultIntervals = [1,1,2,3,4,7];
            const defaultPlan: Plan = {
                ...DEFAULT_PLAN,
                name: 'default',
                intervals: defaultIntervals,
                min: 10,
                max: 20,
                fsrs: false
            };
            this.plans.set('default', defaultPlan);
        }
    }
    
    /**
     * 根据 sourceFile 获取条目列表
     * @param sourceFile 源文件路径（完全路径）
     * @returns Entry 数组
     */
    getEntriesBySourceFile(sourceFile: string): Entry[] {
        if (!sourceFile) return [];
        return Array.from(this.entries.values()).filter(entry => entry.sourceFile === sourceFile);
    }

    /**
     * -------------------------  Plan 相关 -------------------------
     */

    /**
     * 创建新的 Plan
     * @param name Plan 名称（唯一）
     * @param options 其它可选配置项
     */
    createPlan(name: string, options: Partial<Plan> = {}): Plan {
        if (this.plans.has(name)) {
            throw new Error(`计划 "${name}" 已存在`);
        }
        const plan: Plan = {
            ...DEFAULT_PLAN,
            name,
            ...options
        };
        this.plans.set(name, plan);
        return plan;
    }

    /** 获取 Plan */
    getPlan(name: string): Plan | undefined {
        return this.plans.get(name);
    }

    /** 获取全部 Plan */
    getAllPlans(): Plan[] {
        return Array.from(this.plans.values());
    }

    /** 更新 Plan（不可修改 name） */
    updatePlan(name: string, updates: Partial<Plan>): Plan {
        const plan = this.getPlan(name);
        if (!plan) throw new Error(`计划 "${name}" 不存在`);
        const { name: _ignored, ...rest } = updates;
        const updatedPlan: Plan = { ...plan, ...rest, name };
        this.plans.set(name, updatedPlan);
        return updatedPlan;
    }

    /** 删除 Plan */
    deletePlan(name: string): boolean {
        if (name === 'default') return false; // 默认计划不可删除
        return this.plans.delete(name);
    }

    // -------------------- FSRS State Helpers --------------------

    /** 获取条目的 FSRS 状态 */
    getFSRSState(hash: string) {
        const entry = this.entries.get(hash) as any;
        return entry?.reserve2;
    }

    /** 设置条目的 FSRS 状态 */
    setFSRSState(hash: string, state: any) {
        const entry = this.entries.get(hash) as any;
        if (entry) {
            entry.reserve2 = state;
            this.entries.set(hash, entry);
        }
    }

    // ----------------------------- Preset API -----------------------------

    /** 获取全部预设 */
    getAllPresets(): Preset[] {
        return Array.from(this.presets.values());
    }

    /** 获取单个预设 */
    getPreset(label: string): Preset | undefined {
        return this.presets.get(label);
    }

    /** 新增或更新预设 */
    upsertPreset(label: string, prompt: string): void {
        this.presets.set(label, { label, prompt });
    }

    /** 删除预设 */
    deletePreset(label: string): boolean {
        return this.presets.delete(label);
    }
}