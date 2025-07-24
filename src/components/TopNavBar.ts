import { setIcon } from 'obsidian';
import BetterNotesPlugin from '../main';
import { t } from '../i18n';
/**
 * 导航栏项目接口
 */
interface NavItem {
    id: string;        // 唯一标识符
    icon: string;      // 图标名称
    label: string;     // 显示标签
    active: boolean;   // 是否激活
}

/**
 * 顶部导航栏组件
 * 用于显示主要导航选项或作为条目列表的标题栏
 */
export class TopNavBar {
    private container: HTMLElement;
    private plugin: BetterNotesPlugin;
    private navItems: NavItem[];
    private navContainer: HTMLElement;
    private onNavItemClick: ((id: string) => void) | null;
    private onBackClick: (() => void) | null;
    private title: string | null;
    
    /**
     * 构造函数 - 用于主导航模式
     * @param container 容器元素
     * @param plugin 插件实例
     * @param onNavItemClick 导航项点击回调函数
     */
    constructor(
        container: HTMLElement, 
        plugin: BetterNotesPlugin,
        onNavItemClick: (id: string) => void
    );
    
    /**
     * 构造函数 - 用于标题栏模式
     * @param container 容器元素
     * @param plugin 插件实例
     * @param title 标题文本
     * @param onBackClick 返回按钮点击回调函数
     */
    constructor(
        container: HTMLElement, 
        plugin: BetterNotesPlugin,
        title: string,
        onBackClick: () => void
    );
    
    /**
     * 实际构造函数实现
     */
    constructor(
        container: HTMLElement, 
        plugin: BetterNotesPlugin,
        titleOrCallback: string | ((id: string) => void),
        onBackClick?: () => void
    ) {
        this.container = container;
        this.plugin = plugin;
        
        // 根据参数类型决定是导航模式还是标题栏模式
        if (typeof titleOrCallback === 'function') {
            // 导航模式
            this.onNavItemClick = titleOrCallback;
            this.onBackClick = null;
            this.title = null;
            
            // 初始化导航项
            this.navItems = [
                { id: 'home', icon: 'home', label: t('home'), active: true },
                { id: 'comments', icon: 'message-square', label: t('comments'), active: false },
                { id: 'review', icon: 'star', label: t('review'), active: false },
                { id: 'plan', icon: 'calendar-clock', label: t('plan'), active: false }
            ];
        } else {
            // 标题栏模式
            this.title = titleOrCallback;
            this.onBackClick = onBackClick || null;
            this.onNavItemClick = null;
            this.navItems = [];
        }
        
        // 创建导航容器
        this.navContainer = this.container.createEl('div', { cls: 'BetterNotes-nav-container' });
    }
    
    /**
     * 渲染导航栏
     */
    public render(): void {
        // 清空导航容器（而不是整个容器）
        this.navContainer.empty();
        
        if (this.title && this.onBackClick) {
            // 标题栏模式
            this.renderTitleBar();
        } else {
            // 导航模式
            this.renderNavigation();
        }
    }
    
    /**
     * 渲染标题栏
     */
    private renderTitleBar(): void {
        // 创建标题栏布局
        const titleBarEl = this.navContainer.createEl('div', { cls: 'BetterNotes-titlebar' });
        
        // 返回按钮
        const backBtn = titleBarEl.createEl('div', { cls: 'BetterNotes-back-button' });
        setIcon(backBtn, 'arrow-left');
        backBtn.addEventListener('click', () => {
            if (this.onBackClick) {
                this.onBackClick();
            }
        });
        
        // 标题
        titleBarEl.createEl('div', { 
            cls: 'BetterNotes-title',
            text: this.title || t('collection details') 
        });
    }
    
    /**
     * 渲染导航栏
     */
    private renderNavigation(): void {
        
        // 创建导航图标容器
        const iconsContainer = this.navContainer.createEl('div', { cls: 'BetterNotes-nav-icons' });
        
        // 渲染每个导航项
        this.navItems.forEach(item => {
            this.renderNavItem(iconsContainer, item);
        });
    }
    
    /**
     * 渲染单个导航项
     * @param container 容器元素
     * @param item 导航项数据
     */
    private renderNavItem(container: HTMLElement, item: NavItem): void {
        // 创建导航项容器
        const navItemEl = container.createEl('div', { cls: 'BetterNotes-nav-item' });
        
        // 如果是激活状态，添加active类
        if (item.active) {
            navItemEl.addClass('active');
        }
        
        // 创建图标容器
        const iconContainer = navItemEl.createEl('div', { cls: 'BetterNotes-nav-icon' });
        setIcon(iconContainer, item.icon);
        
        // 添加点击事件
        navItemEl.addEventListener('click', () => {
            // 更新激活状态
            this.navItems.forEach(navItem => {
                navItem.active = navItem.id === item.id;
            });
            
            // 调用回调函数
            if (this.onNavItemClick) {
                this.onNavItemClick(item.id);
            }
            
            // 重新渲染导航栏
            this.render();
        });
    }
    
    /**
     * 设置激活的导航项
     * @param id 导航项ID
     */
    public setActiveNavItem(id: string): void {
        this.navItems.forEach(item => {
            item.active = item.id === id;
        });
        this.render();
    }
} 
 