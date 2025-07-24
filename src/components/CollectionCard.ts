import { Collection } from "../models/Collection";
import BetterNotesPlugin from "../main";
import { setIcon } from "obsidian";
import { CollectionModal } from "./CollectionModal";
import { t } from '../i18n';
/**
 * 集合卡片组件
 * 用于显示单个集合的卡片
 */
export class CollectionCard {
    private container: HTMLElement;
    private collection: Collection;
    private plugin: BetterNotesPlugin;
    private onFolderClick: ((folder: Collection) => void) | null = null;

    /**
     * 构造函数
     * @param container 容器元素
     * @param collection 集合对象
     * @param plugin 插件实例
     * @param onFolderClick 点击文件夹的回调函数（可选）
     */
    constructor(
        container: HTMLElement,
        collection: Collection,
        plugin: BetterNotesPlugin,
        onFolderClick?: (folder: Collection) => void
    ) {
        this.container = container;
        this.collection = collection;
        this.plugin = plugin;
        this.onFolderClick = onFolderClick || null;

        // 添加点击事件，如果是文件夹且有回调函数，则触发回调
        if (collection.type === 'folder') {
            this.container.addEventListener('click', (e) => {
                // 如果点击的是工具按钮，不触发文件夹点击事件
                if ((e.target as HTMLElement).closest('.BetterNotes-card-tool')) {
                    return;
                }

                if (this.onFolderClick) {
                    this.onFolderClick(collection);
                }
            });
        }
    }

    /**
     * 递归获取文件夹中的所有集合数量
     * @param folderName 文件夹名称
     * @returns 集合数量
     */
    private getTotalCollectionsInFolder(folderName: string): number {
        // 获取直接子集合数量（类型为set的集合）
        const directSets = this.plugin.dataManager.getAllCollections().filter(
            c => c.parent === folderName && c.type === 'set'
        ).length;

        // 获取子文件夹
        const subFolders = this.plugin.dataManager.getAllCollections().filter(
            c => c.parent === folderName && c.type === 'folder'
        );

        // 递归计算子文件夹中的集合数量
        const subFolderSets = subFolders.reduce((total, folder) => {
            return total + this.getTotalCollectionsInFolder(folder.name);
        }, 0);

        // 返回总数
        return directSets + subFolderSets;
    }

    /**
     * 渲染集合卡片
     */
    public render(): void {
        // 清空容器
        this.container.empty();

        // 若为普通集合(set)类型，则允许拖拽到 AI 聊天视图
        if (this.collection.type === 'set') {
            this.container.setAttr('draggable', 'true');
            this.container.addEventListener('dragstart', (ev) => {
                ev.dataTransfer?.setData('text/BetterNotes-set', this.collection.name);
                ev.dataTransfer!.effectAllowed = 'copy';
            });
        }

        // 设置卡片样式
        this.container.classList.add('BetterNotes-card');

        // 设置卡片背景颜色
        this.container.style.backgroundColor = this.collection.color;

        // 设置卡片数据属性
        this.container.dataset.collectionName = this.collection.name;
        this.container.dataset.collectionType = this.collection.type;

        // 卡片标题
        const titleEl = this.container.createEl('div', { cls: 'BetterNotes-card-title' });
        titleEl.setText(this.collection.name);

        // 卡片图标（根据类型显示不同图标）
        const iconEl = this.container.createEl('div', { cls: 'BetterNotes-card-icon' });
        setIcon(iconEl, this.collection.type === 'folder' ? 'folder' : 'note');

        if (this.collection.type === 'folder') {
            iconEl.classList.add('BetterNotes-folder-icon');

            // 为文件夹添加点击事件
            this.container.addEventListener('click', (e) => {
                // 如果点击的是工具按钮，不触发文件夹点击事件
                if ((e.target as HTMLElement).closest('.BetterNotes-card-tool')) {
                    return;
                }

                // 调用文件夹点击回调
                if (this.onFolderClick) {
                    this.onFolderClick(this.collection);
                }
            });
        }

        // 卡片内容区域
        const contentEl = this.container.createEl('div', { cls: 'BetterNotes-card-content' });

        // 卡片统计数据
        const statsEl = contentEl.createEl('div', { cls: 'BetterNotes-card-stats' });

        if (this.collection.type === 'folder') {
            // 获取该文件夹的所有集合数量（包括子文件夹中的集合）
            const totalCollections = this.getTotalCollectionsInFolder(this.collection.name);

            // 显示集合总数
            statsEl.createEl('span', {
                text: `${totalCollections} ${t('set(s)')}`,
                cls: 'BetterNotes-entry-count'
            });
        } else {
            // 获取该集合的条目数量
            const entryCount = this.plugin.dataManager.getEntriesBySet(this.collection.name).length;

            // 显示条目数量
            statsEl.createEl('span', {
                text: `${entryCount} ${t('entries')}`,
                cls: 'BetterNotes-entry-count'
            });
        }

        // 卡片底部
        const footerEl = this.container.createEl('div', { cls: 'BetterNotes-card-footer' });

        // 工具按钮容器
        const toolsEl = footerEl.createEl('div', { cls: 'BetterNotes-card-tools' });

        // 编辑按钮
        const editBtn = toolsEl.createEl('div', { cls: 'BetterNotes-card-tool' });
        setIcon(editBtn, 'pencil');

        // 删除按钮
        const deleteBtn = toolsEl.createEl('div', { cls: 'BetterNotes-card-tool' });
        setIcon(deleteBtn, 'trash');

        // 绑定事件监听器
        this.bindEventListeners();
    }

    /**
     * 打开编辑集合的模态框
     */
    private openEditCollectionModal(): void {
        // 创建编辑集合模态框
        const modal = new CollectionModal(this.plugin, {
            mode: 'edit',
            collection: this.collection,
            onConfirm: async (name, color, type, parent, plan) => {
                try {

                    // 如果名称发生变化，需要特殊处理
                    if (name !== this.collection.name) {
                        // 创建一个新的集合
                        await this.plugin.createCollection(name, {
                            color: color,
                            type: this.collection.type, // 保持原有类型
                            plan: plan,
                            parent: parent // 使用新的父集合
                        });

                        // 将原集合的所有条目转移到新集合
                        const entries = this.plugin.dataManager.getEntriesBySet(this.collection.name);
                        for (const entry of entries) {
                            await this.plugin.updateEntry(entry.hash, { set: name });
                        }

                        // 如果是文件夹，更新所有子集合的父集合名称
                        if (this.collection.type === 'folder') {
                            const childCollections = this.plugin.dataManager.getAllCollections().filter(
                                c => c.parent === this.collection.name
                            );

                            for (const child of childCollections) {
                                await this.plugin.updateCollection(child.name, { parent: name });
                            }
                        }

                        // 删除原集合
                        await this.plugin.deleteCollection(this.collection.name);
                    } else {
                        // 名称没变，直接更新集合
                        await this.plugin.updateCollection(name, {
                            color: color,
                            plan: plan,
                            parent: parent // 更新父集合
                        });
                    }

                    // 刷新视图
                    await this.plugin.refreshViews();
                } catch (error) {
                    console.error('更新集合失败:', error);
                }
            }
        });

        // 打开模态框
        modal.open();
    }

    /**
     * 打开删除集合的确认对话框
     */
    private openDeleteCollectionConfirm(): void {
        /**
         * 视觉化删除确认
         * -----------------------------------
         * 1. 将卡片变为红色，提示用户正在进行危险操作
         * 2. 显示确认和取消按钮，替换原有的工具按钮
         * 3. 点击确认按钮后执行删除，点击取消或卡片其他区域恢复正常
         */

        // 保存原始背景色，用于恢复
        const originalBgColor = this.container.style.backgroundColor;
        const originalBoxShadow = this.container.style.boxShadow;

        // 变更卡片样式为危险状态
        this.container.style.backgroundColor = 'rgba(220, 53, 69, 0.8)';
        this.container.style.boxShadow = '0 0 15px rgba(220, 53, 69, 0.5)';
        this.container.style.transform = 'scale(1.02)';
        this.container.style.transition = 'all 0.2s ease-in-out';

        // 找到工具按钮容器
        const toolsEl = this.container.querySelector('.BetterNotes-card-tools');
        if (!toolsEl) return;

        // 保存原始工具按钮内容
        const originalToolsContent = toolsEl.innerHTML;

        // 清空工具按钮容器
        toolsEl.empty();

        // 创建确认按钮
        const confirmBtn = toolsEl.createEl('div', {
            cls: 'BetterNotes-card-tool BetterNotes-confirm-delete',
            attr: { 'aria-label': t('confirm-delete') }
        });
        setIcon(confirmBtn, 'check');

        // 创建取消按钮
        const cancelBtn = toolsEl.createEl('div', {
            cls: 'BetterNotes-card-tool BetterNotes-cancel-delete',
            attr: { 'aria-label': t('cancel') }
        });
        setIcon(cancelBtn, 'x');

        // 恢复卡片原始状态的函数
        const restoreCard = () => {
            this.container.style.backgroundColor = originalBgColor;
            this.container.style.boxShadow = originalBoxShadow;
            this.container.style.transform = '';
            this.container.style.transition = '';
            toolsEl.innerHTML = originalToolsContent;

            // 重新绑定原有的事件监听器
            this.bindEventListeners();
        };

        // 确认按钮点击事件
        confirmBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // 阻止事件冒泡

            // 添加删除中的视觉反馈
            confirmBtn.addClass('is-loading');
            setIcon(confirmBtn, 'loader');

            // 执行删除操作
            if (this.collection.type === 'folder') {
                await this.recursiveDeleteFolder(this.collection.name);
            } else {
                await this.plugin.deleteCollection(this.collection.name);
                await this.plugin.refreshViews();
            }
        });

        // 取消按钮点击事件
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            restoreCard();
        });

        // 点击卡片其他区域也取消删除
        const cancelClickHandler = (e: MouseEvent) => {
            // 如果点击的是确认或取消按钮，不处理
            if (
                (e.target as HTMLElement).closest('.BetterNotes-confirm-delete') ||
                (e.target as HTMLElement).closest('.BetterNotes-cancel-delete')
            ) {
                return;
            }

            // 恢复卡片
            restoreCard();

            // 移除事件监听
            this.container.removeEventListener('click', cancelClickHandler);
        };

        // 添加点击事件监听
        this.container.addEventListener('click', cancelClickHandler);
    }

    /**
     * 重新绑定卡片的事件监听器
     * 在取消删除确认后需要重新绑定原有的事件
     */
    private bindEventListeners(): void {
        // 查找编辑和删除按钮
        const toolsEl = this.container.querySelector('.BetterNotes-card-tools');
        if (!toolsEl) return;

        // 查找编辑按钮并绑定事件
        const editBtn = toolsEl.querySelector('.BetterNotes-card-tool:first-child');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                this.openEditCollectionModal();
            });
        }

        // 查找删除按钮并绑定事件
        const deleteBtn = toolsEl.querySelector('.BetterNotes-card-tool:last-child');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                this.openDeleteCollectionConfirm();
            });
        }

        // 为非文件夹类型的集合重新添加点击事件
        if (this.collection.type !== 'folder') {
            this.container.addEventListener('click', (e) => {
                // 如果点击的是工具按钮，不触发集合点击事件
                if ((e.target as HTMLElement).closest('.BetterNotes-card-tool')) {
                    return;
                }

                // 打开集合条目列表
                this.openEntryListView();
            });
        }
    }

    /**
     * 递归删除文件夹及其所有子集合
     * @param folderName 文件夹名称
     */
    private async recursiveDeleteFolder(folderName: string): Promise<void> {
        // 获取该文件夹的所有子集合
        const childCollections = this.plugin.dataManager.getAllCollections().filter(
            c => c.parent === folderName
        );

        // 递归删除子文件夹
        for (const child of childCollections) {
            if (child.type === 'folder') {
                await this.recursiveDeleteFolder(child.name);
            } else {
                await this.plugin.deleteCollection(child.name);
            }
        }

        // 删除当前文件夹
        await this.plugin.deleteCollection(folderName);

        // 刷新视图
        await this.plugin.refreshViews();
    }

    /**
     * 打开条目列表视图
     */
    private openEntryListView(): void {
        // 通知 SidebarView 打开条目列表
        if (this.plugin.sidebarView) {
            this.plugin.sidebarView.showEntryList(this.collection);
        }
    }
} 