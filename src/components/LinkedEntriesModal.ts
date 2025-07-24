/**
 * LinkedEntriesModal
 * 显示条目的链接关系的模态框
 */
import { Modal, setIcon, Notice, ButtonComponent } from "obsidian";
import BetterNotesPlugin from "../main";
import { Entry } from "../models/Entry";
import { hexToRgba } from "../utils/utils";
import { t } from "../i18n";

/**
 * 链接条目模态框
 * 用于显示条目的链接关系
 */
export class LinkedEntriesModal extends Modal {
    private plugin: BetterNotesPlugin;
    private entry: Entry;
    
    /**
     * 构造函数
     * @param plugin BetterNotes插件实例
     * @param entry 当前条目
     */
    constructor(plugin: BetterNotesPlugin, entry: Entry) {
        super(plugin.app);
        this.plugin = plugin;
        this.entry = entry;
    }
    
    /**
     * 模态框打开时调用
     * 渲染模态框内容
     */
    onOpen() {
        const { contentEl } = this;
        
        
        // 创建条目信息区域
        const entryInfoEl = contentEl.createDiv({ cls: 'BetterNotes-linked-entry-info' });
        // 获取当前条目所属集合
        const currentCollection = this.plugin.dataManager.getCollection(this.entry.set);
        const currentColor = currentCollection ? currentCollection.color : "#7F7F7F"; // 默认灰色
        
        // 显示当前条目信息
        const currentEntryEl = entryInfoEl.createDiv({ cls: 'BetterNotes-current-entry' });
        currentEntryEl.createEl('div', { text: t('current entry') });
        
        const currentEntryCard = currentEntryEl.createDiv({ cls: 'BetterNotes-modal-entry-card' });
        
        // 设置当前条目卡片的边框颜色
        currentEntryCard.style.borderLeft = `4px solid ${currentColor}`;
        currentEntryCard.style.backgroundColor = hexToRgba(currentColor, 0.1);
        
        currentEntryCard.createEl('div', { 
            cls: 'BetterNotes-modal-entry-value',
            text: this.entry.value
        });
        
        if (this.entry.comment) {
            currentEntryCard.createEl('div', { 
                cls: 'BetterNotes-modal-entry-comment',
                text: this.entry.comment
            });
        }
        
        // 获取链接的条目
        const linkedEntries = this.plugin.internalLinkService.getLinkedEntries(this.entry.hash);
        
        // 创建链接条目列表
        const linkedEntriesEl = contentEl.createDiv({ cls: 'BetterNotes-linked-entries' });
        linkedEntriesEl.createEl('div', { 
            text: `${t('linked entries')} (${linkedEntries.length})`,
            cls: 'BetterNotes-linked-entries-title'
        });
        
        if (linkedEntries.length === 0) {
            linkedEntriesEl.createEl('div', {
                cls: 'BetterNotes-no-linked-entries',
                text: t('no linked entries')
            });
        } else {
            // 创建链接条目列表
            const linkedEntriesList = linkedEntriesEl.createDiv({ cls: 'BetterNotes-linked-entries-list' });
            
            // 渲染每个链接的条目
            linkedEntries.forEach(linkedEntry => {
                const linkedEntryCard = linkedEntriesList.createDiv({ cls: 'BetterNotes-linked-entry-card' });
                
                // 获取链接条目所属集合
                const linkedCollection = this.plugin.dataManager.getCollection(linkedEntry.set);
                const linkedColor = linkedCollection ? linkedCollection.color : "#7F7F7F"; // 默认灰色
                
                // 设置链接条目卡片的边框颜色
                linkedEntryCard.style.borderLeft = `4px solid ${linkedColor}`;
                linkedEntryCard.style.backgroundColor = hexToRgba(linkedColor, 0.1);
                
                // 条目内容
                linkedEntryCard.createEl('div', { 
                    cls: 'BetterNotes-linked-entry-value',
                    text: linkedEntry.value
                });
                
                // 条目评论（如果有）
                if (linkedEntry.comment) {
                    linkedEntryCard.createEl('div', { 
                        cls: 'BetterNotes-linked-entry-comment',
                        text: linkedEntry.comment
                    });
                }
                
                // 条目操作区域
                const actionArea = linkedEntryCard.createDiv({ cls: 'BetterNotes-linked-entry-actions' });
                
                // 导航按钮
                const navBtn = actionArea.createDiv({ cls: 'BetterNotes-linked-entry-action' });
                setIcon(navBtn, 'arrow-right');
                navBtn.setAttribute('aria-label', t('navigate to entry'));
                navBtn.addEventListener('click', () => {
                    this.navigateToEntry(linkedEntry);
                });
                
                // 移除链接按钮
                const unlinkBtn = actionArea.createDiv({ cls: 'BetterNotes-linked-entry-action' });
                setIcon(unlinkBtn, 'unlink');
                unlinkBtn.setAttribute('aria-label', t('remove link'));
                unlinkBtn.addEventListener('click', () => {
                    this.removeLink(linkedEntry);
                });
            });
        }
        
        // 添加底部按钮区域
        const footerEl = contentEl.createDiv({ cls: 'BetterNotes-modal-footer' });
        
        // 添加关闭按钮
        new ButtonComponent(footerEl)
            .setButtonText(t('close'))
            .onClick(() => {
                this.close();
            });
    }
    
    /**
     * 模态框关闭时调用
     * 清理模态框内容
     */
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
    
    /**
     * 导航到指定条目
     * @param entry 要导航到的条目
     */
    private async navigateToEntry(entry: Entry): Promise<void> {
        this.close();
        await this.plugin.entryNavigation.navigateToEntry(entry);
    }
    
    /**
     * 移除与指定条目的链接关系
     * @param linkedEntry 要移除链接的条目
     */
    private async removeLink(linkedEntry: Entry): Promise<void> {
        try {
            const result = await this.plugin.internalLinkService.removeBidirectionalLink(
                this.entry.hash,
                linkedEntry.hash
            );
            
            if (result) {
                // 重新打开模态框以刷新内容
                this.close();
                const modal = new LinkedEntriesModal(this.plugin, this.entry);
                modal.open();
            }
        } catch (error) {
            console.error('移除链接失败:', error);
            new Notice(t('remove link failed'));
        }
    }
} 