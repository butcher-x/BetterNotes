import { Collection } from '../models/Collection';
import BetterNotesPlugin from '../main';
import { Modal, setIcon } from 'obsidian';
import { CollectionCard } from './CollectionCard';
import { CollectionModal } from './CollectionModal';

/**
 * 文件夹视图组件
 * 用于显示文件夹内的集合和子文件夹
 */
export class FolderView {
    private container: HTMLElement;
    private plugin: BetterNotesPlugin;
    private gridElement: HTMLElement;
    private currentFolder: Collection;
    private onNavigateBack: () => void;
    private onFolderClick: (folder: Collection) => void;
    
    /**
     * 构造函数
     * @param container 容器元素
     * @param plugin 插件实例
     * @param folder 当前文件夹
     * @param onNavigateBack 返回上一级的回调函数
     * @param onFolderClick 点击子文件夹的回调函数（可选）
     */
    constructor(
        container: HTMLElement, 
        plugin: BetterNotesPlugin, 
        folder: Collection,
        onNavigateBack: () => void,
        onFolderClick?: (folder: Collection) => void
    ) {
        this.container = container;
        this.plugin = plugin;
        this.currentFolder = folder;
        this.onNavigateBack = onNavigateBack;
        this.onFolderClick = onFolderClick || ((folder) => this.navigateToSubfolder(folder));
        
        // 创建网格容器
        this.gridElement = this.container.createEl('div');
        this.gridElement.classList.add('BetterNotes-grid');
    }
    
    /**
     * 渲染文件夹视图
     */
    public render(): void {
        //console.log(`Rendering folder view for: ${this.currentFolder.name}`);
        
        // 清空网格元素
        this.gridElement.empty();
        
        // 添加返回卡片作为第一个卡片
        this.renderBackCard();
        
        // 获取当前文件夹的子集合
        const collections = this.plugin.dataManager.getAllCollections().filter(
            collection => collection.parent === this.currentFolder.name
        );
        
        // 按名称排序
        collections.sort((a, b) => a.name.localeCompare(b.name));
        
        // 渲染每个集合卡片
        collections.forEach(collection => {
            this.renderCollectionCard(collection);
        });
        
        // 添加"创建新集合"卡片作为最后一个卡片
        this.renderAddCollectionCard();
    }
    
    /**
     * 渲染返回卡片
     */
    private renderBackCard(): void {
        const backCardEl = this.gridElement.createEl('div');
        backCardEl.classList.add('BetterNotes-card', 'BetterNotes-back-card');
        backCardEl.style.backgroundColor = '#f0f0f0'; // 浅灰色背景
        
        // 创建返回箭头图标
        const iconContainer = backCardEl.createEl('div', { cls: 'BetterNotes-back-icon-container' });
        setIcon(iconContainer, 'arrow-left');
        
        
        
        // 添加点击事件
        backCardEl.addEventListener('click', () => {
            this.onNavigateBack();
        });
    }
    
    /**
     * 渲染单个集合卡片
     * @param collection 集合对象
     */
    private renderCollectionCard(collection: Collection): void {
        const cardEl = this.gridElement.createEl('div');
        cardEl.classList.add('BetterNotes-card');
        cardEl.style.backgroundColor = collection.color;
        
        // 创建集合卡片组件，传递点击文件夹的回调函数
        const card = new CollectionCard(
            cardEl, 
            collection, 
            this.plugin,
            this.onFolderClick
        );
        card.render();
    }
    
    /**
     * 导航到子文件夹
     * @param folder 子文件夹集合对象
     */
    private navigateToSubfolder(folder: Collection): void {
        this.onFolderClick(folder);
    }
    
    /**
     * 渲染添加新集合的卡片
     */
    private renderAddCollectionCard(): void {
        const addCardEl = this.gridElement.createEl('div');
        addCardEl.classList.add('BetterNotes-card', 'BetterNotes-add-card');
        addCardEl.style.backgroundColor = '#87CEEB'; // 天蓝色
        
        // 创建加号图标
        const iconContainer = addCardEl.createEl('div', { cls: 'BetterNotes-add-icon-container' });
        setIcon(iconContainer, 'plus');
        
        
        // 添加点击事件
        addCardEl.addEventListener('click', () => {
            this.openCreateCollectionModal();
        });
    }
    
    /**
     * 打开创建新集合的模态框
     */
    private openCreateCollectionModal(): void {
        // 创建新集合模态框
        const modal = new CollectionModal(this.plugin, {
            mode: 'create',
            onConfirm: async (name, color, type) => {
                try {
                    // 创建新的集合，并设置父文件夹
                    await this.plugin.createCollection(name, {
                        color: color,
                        type: type as "folder" | "set",
                        parent: this.currentFolder.name  // 设置父文件夹
                    });
                    
                    // 重新渲染视图
                    this.render();
                } catch (error) {
                    console.error('创建集合失败:', error);
                }
            }
        });
        
        // 打开模态框
        modal.open();
    }
} 