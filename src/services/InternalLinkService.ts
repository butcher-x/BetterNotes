/**
 * InternalLinkService
 * 处理条目间的内部链接关系
 */
import { Notice } from "obsidian";
import BetterNotesPlugin from "../main";
import { Entry } from "../models/Entry";
import { t } from '../i18n';
/**
 * 内部链接状态
 */
interface InternalLinkState {
    isLinking: boolean;      // 是否处于链接模式
    sourceHash: string | null; // 源条目的哈希值
    targetHash: string | null; // 目标条目的哈希值
    timeoutId: NodeJS.Timeout | null; // 超时ID，用于自动退出链接模式
}

/**
 * 内部链接服务
 * 负责处理条目间的内部链接关系
 */
export class InternalLinkService {
    private plugin: BetterNotesPlugin;
    private state: InternalLinkState;
    
    /**
     * 构造函数
     * @param plugin BetterNotes插件实例
     */
    constructor(plugin: BetterNotesPlugin) {
        this.plugin = plugin;
        this.state = {
            isLinking: false,
            sourceHash: null,
            targetHash: null,
            timeoutId: null
        };
    }
    
    /**
     * 处理条目右击事件
     * 如果不在链接模式，则进入链接模式并记录源条目
     * 如果已在链接模式，则尝试与目标条目建立链接
     * @param entry 被右击的条目
     * @returns 是否成功处理
     */
    public async handleEntryRightClick(entry: Entry): Promise<boolean> {
        // 如果不在链接模式，进入链接模式
        if (!this.state.isLinking) {
            this.startLinking(entry.hash);
            new Notice(t('selected entry') + '"' + this.truncateString(entry.value, 20) + '"' + t('please right click another entry to establish a link'));
            return true;
        }
        
        // 如果已在链接模式，尝试建立链接
        if (this.state.sourceHash) {
            // 不能与自身建立链接
            if (this.state.sourceHash === entry.hash) {
                new Notice(t('cannot link to itself'));
                this.resetLinkingState();
                return false;
            }
            
            // 设置目标条目
            this.state.targetHash = entry.hash;
            
            // 添加目标条目的样式
            document.querySelectorAll(`[data-entry-hash="${entry.hash}"]`).forEach(el => {
                el.classList.add('BetterNotes-linking-target');
            });
            
            // 尝试建立双向链接
            const result = await this.createBidirectionalLink(this.state.sourceHash, entry.hash);
            
            // 1秒后自动退出链接模式
            if (this.state.timeoutId) {
                clearTimeout(this.state.timeoutId);
            }
            
            this.state.timeoutId = setTimeout(() => {
                this.resetLinkingState();
            }, 1000);
            
            return result;
        }
        
        return false;
    }
    
    /**
     * 开始链接模式
     * @param sourceHash 源条目的哈希值
     */
    private startLinking(sourceHash: string): void {
        // 如果已经在链接模式，先重置
        if (this.state.isLinking) {
            this.resetLinkingState();
        }
        
        this.state.isLinking = true;
        this.state.sourceHash = sourceHash;
        
        // 设置光标样式，指示链接模式
        document.body.classList.add('BetterNotes-linking-mode');
        
        // 添加源条目的样式
        document.querySelectorAll(`[data-entry-hash="${sourceHash}"]`).forEach(el => {
            el.classList.add('BetterNotes-linking-source');
        });
    }
    
    /**
     * 重置链接状态
     */
    private resetLinkingState(): void {
        // 清除超时
        if (this.state.timeoutId) {
            clearTimeout(this.state.timeoutId);
            this.state.timeoutId = null;
        }
        
        // 移除源条目样式
        if (this.state.sourceHash) {
            document.querySelectorAll(`[data-entry-hash="${this.state.sourceHash}"]`).forEach(el => {
                el.classList.remove('BetterNotes-linking-source');
            });
        }
        
        // 移除目标条目样式
        if (this.state.targetHash) {
            document.querySelectorAll(`[data-entry-hash="${this.state.targetHash}"]`).forEach(el => {
                el.classList.remove('BetterNotes-linking-target');
            });
        }
        
        // 恢复光标样式
        document.body.classList.remove('BetterNotes-linking-mode');
        
        // 重置状态
        this.state.isLinking = false;
        this.state.sourceHash = null;
        this.state.targetHash = null;
    }
    
    /**
     * 取消当前的链接操作
     */
    public cancelLinking(): void {
        if (this.state.isLinking) {
            this.resetLinkingState();
            new Notice(t('linking operation cancelled'));
        }
    }
    
    /**
     * 创建双向链接
     * 在两个条目之间建立相互引用关系
     * @param sourceHash 源条目哈希
     * @param targetHash 目标条目哈希
     * @returns 是否成功建立链接
     */
    private async createBidirectionalLink(sourceHash: string, targetHash: string): Promise<boolean> {
        try {
            // 获取源条目和目标条目
            const sourceEntry = this.plugin.dataManager.getEntryByHash(sourceHash);
            const targetEntry = this.plugin.dataManager.getEntryByHash(targetHash);
            
            if (!sourceEntry || !targetEntry) {
                new Notice(t('cannot find entry'));
                return false;
            }
            
            // 检查链接是否已存在
            if (sourceEntry.link && sourceEntry.link.includes(targetHash)) {
                new Notice(t('link already exists'));
                return false;
            }
            
            // 更新源条目的链接数组
            const sourceLinks = sourceEntry.link || [];
            if (!sourceLinks.includes(targetHash)) {
                sourceLinks.push(targetHash);
            }
            
            // 更新目标条目的链接数组
            const targetLinks = targetEntry.link || [];
            if (!targetLinks.includes(sourceHash)) {
                targetLinks.push(sourceHash);
            }
            
            // 保存更新后的条目
            await this.plugin.updateEntry(sourceHash, { link: sourceLinks });
            await this.plugin.updateEntry(targetHash, { link: targetLinks });
            
            new Notice(t('link established successfully'));
            
            // 刷新视图
            await this.plugin.refreshViews();
            
            return true;
        } catch (error) {
            console.error("建立条目链接时出错:", error);
            new Notice(t('link establishment failed'));
            return false;
        }
    }
    
    /**
     * 移除双向链接
     * 删除两个条目之间的相互引用关系
     * @param sourceHash 源条目哈希
     * @param targetHash 目标条目哈希
     * @returns 是否成功移除链接
     */
    public async removeBidirectionalLink(sourceHash: string, targetHash: string): Promise<boolean> {
        try {
            // 获取源条目和目标条目
            const sourceEntry = this.plugin.dataManager.getEntryByHash(sourceHash);
            const targetEntry = this.plugin.dataManager.getEntryByHash(targetHash);
            
            if (!sourceEntry || !targetEntry) {
                new Notice(t('cannot find entry'));
                return false;
            }
            
            // 更新源条目的链接数组
            const sourceLinks = (sourceEntry.link || []).filter(hash => hash !== targetHash);
            
            // 更新目标条目的链接数组
            const targetLinks = (targetEntry.link || []).filter(hash => hash !== sourceHash);
            
            // 保存更新后的条目
            await this.plugin.updateEntry(sourceHash, { link: sourceLinks });
            await this.plugin.updateEntry(targetHash, { link: targetLinks });
            
            new Notice(t('link removed successfully'));
            
            // 刷新视图
            await this.plugin.refreshViews();
            
            return true;
        } catch (error) {
            console.error("移除条目链接时出错:", error);
            new Notice(t('link removal failed'));
            return false;
        }
    }
    
    /**
     * 获取条目的所有链接条目
     * @param entryHash 条目哈希
     * @returns 链接的条目数组
     */
    public getLinkedEntries(entryHash: string): Entry[] {
        const entry = this.plugin.dataManager.getEntryByHash(entryHash);
        if (!entry || !entry.link || entry.link.length === 0) {
            return [];
        }
        
        return entry.link
            .map((hash: string) => this.plugin.dataManager.getEntryByHash(hash))
            .filter((linkedEntry: Entry | undefined): linkedEntry is Entry => linkedEntry !== undefined);
    }
    
    /**
     * 检查当前是否处于链接模式
     * @returns 是否处于链接模式
     */
    public isInLinkingMode(): boolean {
        return this.state.isLinking;
    }
    
    /**
     * 获取当前链接模式的源条目哈希
     * @returns 源条目哈希，如果不在链接模式则返回null
     */
    public getLinkingSourceHash(): string | null {
        return this.state.isLinking ? this.state.sourceHash : null;
    }
    
    /**
     * 截断字符串
     * @param str 原字符串
     * @param maxLength 最大长度
     * @returns 截断后的字符串
     */
    private truncateString(str: string, maxLength: number): string {
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }
} 