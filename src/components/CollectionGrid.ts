import { Collection } from '../models/Collection';
import BetterNotesPlugin from '../main';
import { Modal, setIcon } from 'obsidian';
import { CollectionCard } from './CollectionCard';
import { CollectionModal } from './CollectionModal';

/**
 * 集合网格组件
 * 用于以网格布局显示集合卡片
 */
export class CollectionGrid {
    private container: HTMLElement;
    private plugin: BetterNotesPlugin;
    public gridElement: HTMLElement;
    private onFolderClick: ((folder: Collection) => void) | undefined;
    
    /**
     * 构造函数
     * @param container 容器元素
     * @param plugin 插件实例
     * @param onFolderClick 点击文件夹的回调函数（可选）
     */
    constructor(
        container: HTMLElement, 
        plugin: BetterNotesPlugin,
        onFolderClick?: (folder: Collection) => void
    ) {
        this.container = container;
        this.plugin = plugin;
        this.onFolderClick = onFolderClick;
        
        // 创建网格容器
        this.gridElement = this.container.createEl('div');
        this.gridElement.classList.add('BetterNotes-grid');
    }
    
    /**
     * 渲染集合网格
     * @param parentFolder 父文件夹名称（可选，默认显示根级集合）
     */
    public render(parentFolder?: string): void {
        //console.log(`Rendering collection grid${parentFolder ? ` for folder: ${parentFolder}` : ''}`);
        
        // 清空网格元素（而不是整个容器）
        this.gridElement.empty();
        
        // 获取指定父文件夹下的集合
        const collections = this.plugin.dataManager.getAllCollections().filter(collection => {
            return parentFolder ? collection.parent === parentFolder : !collection.parent;
        });
        
        // 按名称排序
        collections.sort((a, b) => a.name.localeCompare(b.name));
        
        // 渲染每个集合卡片
        collections.forEach(collection => {
            this.renderCollectionCard(collection);
        });
        
        // 添加"创建新集合"卡片
        this.renderAddCollectionCard(parentFolder);
    }
    
    /**
     * 渲染单个集合卡片
     * @param collection 集合对象
     */
    public renderCollectionCard(collection: Collection): void {
        const cardEl = this.gridElement.createEl('div');
        cardEl.classList.add('BetterNotes-card');
        cardEl.style.backgroundColor = collection.color;
        
        // 创建集合卡片组件
        const card = new CollectionCard(
            cardEl, 
            collection, 
            this.plugin,
            this.onFolderClick // 传递点击文件夹的回调函数
        );
        card.render();
    }
    
    /**
     * 渲染添加新集合的卡片
     * @param parentFolder 父文件夹名称（可选）
     */
    public renderAddCollectionCard(parentFolder?: string): void {
        const addCardEl = this.gridElement.createEl('div');
        addCardEl.classList.add('BetterNotes-card', 'BetterNotes-add-card');
        addCardEl.style.backgroundColor = '#87CEEB'; // 天蓝色
        
        // 创建加号图标
        const iconContainer = addCardEl.createEl('div', { cls: 'BetterNotes-add-icon-container' });
        setIcon(iconContainer, 'plus');
        
        // 添加点击事件
        addCardEl.addEventListener('click', () => {
            this.openCreateCollectionModal(parentFolder);
        });
    }
    
    /**
     * 打开创建新集合的模态框
     * @param parentFolder 父文件夹名称（可选）
     */
    public openCreateCollectionModal(parentFolder?: string): void {
        // 创建新集合模态框
        const modal = new CollectionModal(this.plugin, {
            mode: 'create',
            onConfirm: async (name, color, type, _parent, plan) => {
                try {
                    // 创建新的集合，并自动保存数据
                    await this.plugin.createCollection(name, {
                        color: color,
                        type: type as "folder" | "set",
                        plan: plan || 'default',
                        parent: parentFolder || ""  // 设置父文件夹
                    });
                    
                    // 重新渲染网格
                    this.render(parentFolder);
                } catch (error) {
                    console.error('创建集合失败:', error);
                }
            }
        });
        
        // 打开模态框
        modal.open();
    }
} 