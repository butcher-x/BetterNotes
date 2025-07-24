import {
    ItemView,
    WorkspaceLeaf,
    setIcon,
    Notice,
    MarkdownView,
    FileView
} from 'obsidian';
import BetterNotesPlugin from '../main';
import { CollectionGrid } from '../components/CollectionGrid';
import { TopNavBar } from '../components/TopNavBar';
import { FolderView } from '../components/FolderView';
import { Collection } from '../models/Collection';
import { EntryListView } from '../components/EntryListView';
import { EntryCard } from '../components/EntryCard';
import { Entry } from '../models/Entry';
import { SearchBar } from '../components/SearchBar';
import { PlanGrid } from '../components/PlanGrid';
import { ReviewSelectGrid } from '../components/ReviewSelectGrid';
import { ReviewSessionView } from '../components/ReviewSessionView';
import { t } from '../i18n';
import { VideoView } from '../services/video/view';

/**
 * BetterNotes侧边栏视图
 * 用于在Obsidian右侧边栏中显示集合网格
 */
export class SidebarView extends ItemView {
    plugin: BetterNotesPlugin;
    private collectionGrid: CollectionGrid;
    private topNavBar: TopNavBar;
    private contentContainer: HTMLElement;
    private currentView: string = 'home';
    private navigationStack: Collection[] = []; // 导航栈，用于记录浏览历史（存储完整的Collection对象）
    private currentFolder: Collection | null = null; // 当前文件夹
    private entryListView: EntryListView | null = null;
    private currentCollection: Collection | null = null; // 当前查看的集合
    private commentsContainer: HTMLElement | null = null; // 评论视图容器
    private commentsFileListener: (() => void) | null = null;
    private searchBar: SearchBar;
    private setSelectionBar?: import('../components/SetSelectionBar').SetSelectionBar;
    
    /**
     * 视图的唯一标识符
     */
    public static VIEW_TYPE = "BetterNotes-sidebar-view";
    
    /**
     * 构造函数
     * @param leaf 工作区叶子节点
     * @param plugin 插件实例
     */
    constructor(leaf: WorkspaceLeaf, plugin: BetterNotesPlugin) {
        super(leaf);
        this.plugin = plugin;
    }
    
    /**
     * 获取视图类型
     * @returns 视图类型标识符
     */
    getViewType(): string {
        return SidebarView.VIEW_TYPE;
    }
    
    /**
     * 获取显示的标题
     * @returns 视图标题
     */
    getDisplayText(): string {
        return "BetterNotes";
    }
    
    /**
     * 获取视图图标
     * @returns 图标名称
     */
    getIcon(): string {
        return "sparkles";
    }
    
    /**
     * 当视图被打开或获得焦点时调用
     */
    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.classList.add('BetterNotes-container');
        
        // 创建顶部导航栏
        this.topNavBar = new TopNavBar(container as HTMLElement, this.plugin, (id) => this.handleNavigation(id));
        this.topNavBar.render();
        
        // ---------- SetSelectionBar 位置 (导航栏正下方) ----------
        const setSelectionParent = container.createDiv();
        const { SetSelectionBar } = await import('../components/SetSelectionBar');
        this.setSelectionBar = new SetSelectionBar(setSelectionParent, this.plugin, this.plugin.setSelectionService);

        // 创建搜索栏（位于 SetSelectionBar 下方）
        const searchParent = container.createDiv();
        this.searchBar = new SearchBar(searchParent, this.plugin, this);
        
        // 创建内容容器
        this.contentContainer = container.createEl('div', { cls: 'BetterNotes-content-container' });
        
        // 初始化默认视图（首页/集合网格）
        this.showHomeView();
        
        //console.log('BetterNotes sidebar view opened');
    }
    
    /**
     * 处理导航事件
     * @param id 导航项ID
     */
    private handleNavigation(id: string): void {
        // 清理 comments 监听
        if (this.currentView === 'comments') {
            this.clearCommentsListener();
        }
        //console.log(`Navigation to: ${id}`);
        
        // 如果切换到其他视图，清空导航栈和当前文件夹
        if (id !== this.currentView) {
            this.navigationStack = [];
            this.currentFolder = null;
        }
        
        this.currentView = id;
        
        // 清空内容容器
        this.contentContainer.empty();
        this.currentFolder = null;
        this.currentCollection = null;
        this.entryListView = null;
        // 根据导航ID显示对应视图
        switch (id) {
            case 'home':
                this.showHomeView();
                break;
            case 'comments':
                this.showCommentsView();
                break;
            case 'review':
                this.showReviewView();
                break;
            case 'plan':
                this.showPlanView();
                break;
            default:
                this.showHomeView();
        }
        
        // 更新搜索栏 placeholder
        this.searchBar?.updatePlaceholder();
    }
    
    /**
     * 显示首页视图（集合网格）
     */
    private showHomeView(): void {
        //console.log('Showing home view');
        
        // 如果有当前文件夹，显示文件夹内容
        if (this.currentFolder) {
            this.showFolderView(this.currentFolder);
            return;
        }
        
        // 清空内容容器
        this.contentContainer.empty();
        
        // 创建集合网格组件，并传入文件夹点击回调
        this.collectionGrid = new CollectionGrid(
            this.contentContainer, 
            this.plugin,
            (folder) => this.navigateToFolder(folder)
        );
        
        // 渲染根级集合网格
        this.collectionGrid.render();
        
        // 添加面包屑导航
        this.renderBreadcrumb();
        
        // 更新搜索栏 placeholder
        this.searchBar?.updatePlaceholder();
    }
    
    /**
     * 渲染面包屑导航
     */
    private renderBreadcrumb(): void {
        // 创建面包屑容器
        const breadcrumbContainer = this.contentContainer.createEl('div', { cls: 'BetterNotes-breadcrumb' });
        breadcrumbContainer.style.order = '-1'; // 确保它显示在网格之前
        
        // 添加主页链接
        const homeLink = breadcrumbContainer.createEl('span', { 
            text: 'home', 
            cls: 'BetterNotes-breadcrumb-link' 
        });
        homeLink.addEventListener('click', () => {
            this.currentFolder = null;
            this.navigationStack = [];
            this.showHomeView();
        });
        
        // 如果有导航历史，显示导航路径
        if (this.navigationStack.length > 0) {
            // 遍历导航栈，为每一级添加面包屑
            this.navigationStack.forEach((folder, index) => {
                // 添加分隔符
                breadcrumbContainer.createEl('span', { 
                    text: ' > ', 
                    cls: 'BetterNotes-breadcrumb-separator' 
                });
                
                // 添加可点击的文件夹链接
                const folderLink = breadcrumbContainer.createEl('span', { 
                    text: folder.name, 
                    cls: 'BetterNotes-breadcrumb-link' 
                });
                
                // 为每个文件夹链接添加点击事件，点击时导航到对应层级
                folderLink.addEventListener('click', () => {
                    // 将导航栈裁剪到当前点击的位置
                    this.navigationStack = this.navigationStack.slice(0, index);
                    this.currentFolder = folder;
                    this.showFolderView(folder);
                });
            });
        }
        
        // 如果在文件夹内，显示当前文件夹名称
        if (this.currentFolder) {
            // 添加分隔符
            breadcrumbContainer.createEl('span', { 
                text: ' > ', 
                cls: 'BetterNotes-breadcrumb-separator' 
            });
            
            // 添加当前文件夹名称（不可点击）
            breadcrumbContainer.createEl('span', { 
                text: this.currentFolder.name, 
                cls: 'BetterNotes-breadcrumb-current' 
            });
        } else if (this.navigationStack.length === 0) {
            // 只显示主页（当没有任何导航历史且不在文件夹内时）
            breadcrumbContainer.empty();
            breadcrumbContainer.createEl('span', { 
                text: 'home', 
                cls: 'BetterNotes-breadcrumb-current' 
            });
        }
    }
    
    /**
     * 导航到指定文件夹
     * @param folder 文件夹集合对象
     */
    private navigateToFolder(folder: Collection): void {
        //console.log(`Navigating to folder: ${folder.name}`);
        
        // 将当前文件夹推入导航栈（如果有）
        if (this.currentFolder) {
            this.navigationStack.push(this.currentFolder);
        }
        
        // 更新当前文件夹
        this.currentFolder = folder;
        
        // 显示文件夹视图
        this.showFolderView(folder);
    }
    
    /**
     * 显示文件夹视图
     * @param folder 文件夹集合对象
     */
    private showFolderView(folder: Collection): void {
        //console.log(`Showing folder view for: ${folder.name}`);
        
        // 清空内容容器
        this.contentContainer.empty();
        
        // 创建文件夹视图组件
        const folderView = new FolderView(
            this.contentContainer, 
            this.plugin, 
            folder,
            () => this.navigateBack(), // 返回上一级的回调函数
            (subfolder) => this.navigateToFolder(subfolder) // 点击子文件夹的回调函数
        );
        
        // 渲染文件夹视图
        folderView.render();
        
        // 添加面包屑导航
        this.renderBreadcrumb();
        
        // 更新搜索栏 placeholder
        this.searchBar?.updatePlaceholder();
    }
    
    /**
     * 返回上一级
     */
    private navigateBack(): void {
        // 如果导航栈为空，则返回根视图
        if (this.navigationStack.length === 0) {
            this.currentFolder = null;
            this.showHomeView();
            return;
        }
        
        // 从导航栈中弹出上一级文件夹
        const parentFolder = this.navigationStack.pop();
        
        // 更新当前文件夹并显示
        this.currentFolder = parentFolder || null;
        
        if (this.currentFolder) {
            this.showFolderView(this.currentFolder);
        } else {
            this.showHomeView();
        }
    }
    
    /**
     * 显示评论视图
     */
    private showCommentsView(): void {
        //console.log('Showing comments view');

        // 清空内容容器
        this.contentContainer.empty();

        // 创建评论容器
        this.commentsContainer = this.contentContainer.createEl('div', { cls: 'BetterNotes-entry-list-container' });

        // 初次渲染
        this.renderCommentsForActiveFile();

        // 移除旧监听
        if (this.commentsFileListener) this.app.workspace.off('active-leaf-change', this.commentsFileListener);

        // 监听活动叶子变化，刷新列表
        this.commentsFileListener = (leaf?: WorkspaceLeaf) => {
            // 若切换到的是 SidebarView 本身，则忽略
            if (leaf && (leaf.view instanceof SidebarView)) return;
            if (this.currentView === 'comments') {
                this.renderCommentsForActiveFile();
            }
        };
        this.app.workspace.on('active-leaf-change', this.commentsFileListener);
        
        // 更新搜索栏 placeholder
        this.searchBar?.updatePlaceholder();
    }

    /**
     * 渲染当前活动文件的条目列表
     */
    private async renderCommentsForActiveFile(): Promise<void> {
        if (!this.commentsContainer) return;

        let leafToRender = this.app.workspace.activeLeaf;

        // If the active leaf is in the ignore list, fall back to the last known active leaf.
        if (leafToRender && this.plugin.isIgnoredView(leafToRender.view.getViewType())) {
            leafToRender = this.plugin.lastActiveViewLeaf;
        }

        if (!leafToRender) {
            this.commentsContainer.empty();
            this.commentsContainer.createEl('div', { cls: 'BetterNotes-placeholder-text', text: t('no file opened') });
            return;
        }

        const view = leafToRender.view;
        let entries: Entry[] = [];

            if (view instanceof VideoView) {
            // Handle Video view
                const state = view.getState();
                const videoUrl: string | undefined = state?.fileUrl as string | undefined;
                if (videoUrl) {
                entries = this.plugin.dataManager.getAllEntries().filter(e =>
                    e.type === 'video' && typeof e.index === 'string' && e.index.endsWith(videoUrl)
                );
                }
        } else if (view instanceof FileView && view.file) {
            // Handle file-based views like Markdown and PDF
            const file = view.file;
            const filePath = file.path;
            
            entries = this.plugin.dataManager.getEntriesBySourceFile(filePath);

            // For Markdown, sort entries by their position in the file.
            if (file.extension === 'md') {
        try {
                    const fileContent = await this.app.vault.read(file);
                    entries = [...entries].sort((a, b) => {
                const posA = fileContent.indexOf(`data-hash=\"${a.hash}\"`);
                const posB = fileContent.indexOf(`data-hash=\"${b.hash}\"`);
                return posA - posB;
            });
        } catch (e) {
            console.error('读取文件内容失败:', e);
                }
            }
        }

        this.commentsContainer.empty();

        if (entries.length === 0) {
            this.commentsContainer.createEl('div', { cls: 'BetterNotes-placeholder-text', text: t('no annotation in this file') });
            return;
        }

        const listContainer = this.commentsContainer.createEl('div', { cls: 'BetterNotes-entries-container' });

        entries.forEach(entry => {
            const collection = this.plugin.dataManager.getCollection(entry.set);
            if (!collection) return;
            const cardEl = listContainer.createEl('div', { cls: 'BetterNotes-entry-item' });
            const entryCard = new EntryCard(cardEl, entry, this.plugin, collection);
            entryCard.render();
        });
    }

    // 在 navigateBack 等函数中以及刷新时，若离开 comments 视图，需要移除监听。
    // 在 handleNavigation 开头添加逻辑，但此处插入简易清理
    private clearCommentsListener(): void {
        if (this.commentsFileListener) {
            this.app.workspace.off('active-leaf-change', this.commentsFileListener);
            this.commentsFileListener = null;
        }
    }
    
    /**
     * 显示复习视图
     */
    private showReviewView(): void {
        //console.log('Showing review select view');
        this.contentContainer.empty();
        const reviewGrid = new ReviewSelectGrid(this.contentContainer, this.plugin, (selected) => {
            const session = new ReviewSessionView(this.contentContainer, this.plugin, selected);
            session.render();
        });
        reviewGrid.render();
    }
    
    /**
     * 显示计划视图
     */
    private showPlanView(): void {
        //console.log('Showing plan view');
        this.contentContainer.empty();

        const planGrid = new PlanGrid(this.contentContainer, this.plugin);
        planGrid.render();
    }
    
    /**
     * 显示条目列表视图
     * @param collection 集合对象
     */
    public showEntryList(collection: Collection): void {
        //console.log(`Showing entry list for collection: ${collection.name}`);
        
        // 保存当前集合
        this.currentCollection = collection;
        
        // 清空内容容器
        this.contentContainer.empty();
        
        // 创建条目列表视图
        this.entryListView = new EntryListView(
            this.contentContainer,
            collection,
            this.plugin,
            () => this.handleBackFromEntryList()
        );
        
        // 渲染条目列表
        this.entryListView.render();

        // 更新搜索栏 placeholder
        this.searchBar?.updatePlaceholder();
    }
    
    /**
     * 处理从条目列表返回
     */
    private handleBackFromEntryList(): void {
        // 清除当前视图和集合引用
        this.entryListView = null;
        this.currentCollection = null;
        
        // 返回到之前的视图
        if (this.currentFolder) {
            // 如果之前在文件夹中，返回到文件夹视图
            this.showFolderView(this.currentFolder);
        } else {
            // 否则返回主页
            this.showHomeView();
        }
    }
    
    /**
     * 刷新视图
     */
    async refresh(): Promise<void> {
        //console.log('Refreshing BetterNotes sidebar view');
        //console.log(this.currentView);
        if (this.entryListView && this.currentCollection) {
            //console.log('refresh entryListView');
            // 如果当前在条目列表视图，刷新条目列表
            this.entryListView.refresh();
        } else if (this.currentFolder) {
            //console.log('refresh currentFolder');
            // 如果当前在文件夹视图，刷新文件夹视图
            this.showFolderView(this.currentFolder);
        } else if (this.currentView === 'comments') {
            //console.log('refresh comments');
            this.renderCommentsForActiveFile();
        } else if (this.currentView === 'plan') {
            //console.log('refresh plan');
            this.showPlanView();
        } else if (this.currentView === 'review') {
            //console.log('refresh review');
            this.showReviewView();
        } else {
            //console.log('refresh home');
            this.showHomeView();
        }

        // 若 bar 不存在但现在需要，则创建
        if (!this.setSelectionBar) {
            const selParent = this.containerEl.querySelector('.BetterNotes-set-selection-bar') as HTMLElement | null ?? this.contentContainer.parentElement?.createDiv();
            const { SetSelectionBar } = await import('../components/SetSelectionBar');
            this.setSelectionBar = new SetSelectionBar(selParent!, this.plugin, this.plugin.setSelectionService);
        }
        this.setSelectionBar?.refresh();
    }
    
    
    
    /**
     * 打开comments视图并高亮显示特定条目
     * 此方法用于从文档中的span标签点击时，跳转到侧边栏的comments视图并显示对应条目
     * 如果当前已处于 comments 视图且活跃文件与条目来源文件一致，
    * 则复用现有 DOM，避免不必要的清空与重新渲染。
     * @param entry 需要高亮显示的条目
     */
    public async openCommentsViewAndHighlightEntry(entry: Entry): Promise<void> {
        let isSameContext = false;
    
        if (entry.type === 'video') {
            // 视频条目：检查当前是否为 VideoView 且 url 匹配
            const videoView = this.app.workspace.getActiveViewOfType(VideoView);
            if (videoView) {
                const videoUrl = videoView.getState()?.fileUrl;
                if (videoUrl && typeof entry.index === 'string' && entry.index.endsWith(videoUrl)) {
                    isSameContext = true;
                }
            }
        } else {
            // MD条目：检查 sourceFile 是否匹配
            const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (markdownView && markdownView.file && markdownView.file.path === entry.sourceFile) {
                isSameContext = true;
            }
        }
    
        if (this.currentView === 'comments' && isSameContext && this.commentsContainer) {
            // 复用现有DOM
            await this.insertEntryIntoComments(entry);
            this.highlightEntryInComments(entry);
            this.topNavBar.setActiveNavItem('comments');
            return;
        }
    
        // 切换到comments视图
        this.currentView = 'comments';
        this.currentCollection = null;
        this.currentFolder = null;
        this.entryListView = null;
        // 清空内容容器
        this.contentContainer.empty();
        
        // 创建评论容器
        this.commentsContainer = this.contentContainer.createEl('div', { cls: 'BetterNotes-entry-list-container' });
        
        // 渲染评论视图
        await this.renderCommentsForActiveFile();
        
        // 高亮显示特定条目
        this.highlightEntryInComments(entry);
        
        // 更新顶部导航栏的激活状态
        this.topNavBar.setActiveNavItem('comments');

        // 监听活动叶子变化，刷新列表
        this.commentsFileListener = (leaf?: WorkspaceLeaf) => {
            // 若切换到的是 SidebarView 本身，则忽略，避免显示占位文本
            if (leaf && (leaf.view instanceof SidebarView)) return;
            if (this.currentView === 'comments') {
                this.renderCommentsForActiveFile();
            }
        };
        this.searchBar?.updatePlaceholder();
        this.app.workspace.on('active-leaf-change', this.commentsFileListener);
    }
    
    /**
     * 在当前 comments 列表中插入指定条目的 DOM。
     * 若列表已存在该条目则不作处理。
     * 按文件中 data-hash 出现顺序确定插入位置，保证与 renderCommentsForActiveFile 一致。
     * @param entry 目标条目
     */
    private async insertEntryIntoComments(entry: Entry): Promise<void> {
        if (!this.commentsContainer) return;
        let listContainer = this.commentsContainer.querySelector('.BetterNotes-entries-container') as HTMLElement | null;

        // If the list container doesn't exist (i.e., we're going from 0 to 1 entry),
        // clear the placeholder and create the container.
        if (!listContainer) {
            this.commentsContainer.empty();
            listContainer = this.commentsContainer.createEl('div', { cls: 'BetterNotes-entries-container' });
        }

        // 已存在则直接返回
        if (listContainer.querySelector(`[data-entry-hash="${entry.hash}"]`)) return;

        // 构造 DOM
        const collection = this.plugin.dataManager.getCollection(entry.set);
        if (!collection) return;
        const cardWrapper = document.createElement('div');
        cardWrapper.classList.add('BetterNotes-entry-item');
        const entryCard = new EntryCard(cardWrapper, entry, this.plugin, collection);
        entryCard.render();

        let inserted = false;
        try {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                const fileContent = await this.app.vault.read(activeFile);
                const targetPos = fileContent.indexOf(`data-hash=\"${entry.hash}\"`);
                if (targetPos !== -1) {
                    // 遍历现有子节点，找到第一个位置 > targetPos 的节点
                    const children = Array.from(listContainer.children);
                    for (const child of children) {
                        const hash = child.getAttribute('data-entry-hash');
                        if (!hash) continue;
                        const pos = fileContent.indexOf(`data-hash=\"${hash}\"`);
                        if (pos > targetPos) {
                            listContainer.insertBefore(cardWrapper, child);
                            inserted = true;
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('insertEntryIntoComments: failed to compute position', e);
        }

        // 如果未能插入到中间位置，则默认追加到末尾
        if (!inserted) listContainer.appendChild(cardWrapper);
    }
    
    /**
     * 在comments视图中高亮显示特定条目
     * @param entry 需要高亮显示的条目
     */
    private highlightEntryInComments(entry: Entry): void {
        // 确保comments容器已加载
        if (!this.commentsContainer) return;
        
        // 等待DOM更新完成
        setTimeout(() => {
            // 查找对应条目的DOM元素
            const entryElement = this.commentsContainer?.querySelector(`[data-entry-hash="${entry.hash}"]`);
            if (entryElement) {
                // 滚动到该元素
                entryElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // 添加高亮效果
                entryElement.classList.add('BetterNotes-highlighted-entry');
                
                // 3秒后移除高亮效果
                setTimeout(() => {
                    entryElement.classList.remove('BetterNotes-highlighted-entry');
                }, 3000);
            }
        }, 200); // 增加延迟确保DOM已完全渲染
    }
    
    /**
     * 当视图被关闭时调用
     */
    async onClose() {
        // 清理事件监听等资源
    }

    /**
     * 获取当前查看的集合（若有）供外部组件使用
     */
    public getCurrentCollection(): Collection | null {
        return this.currentCollection;
    }

    /** 当前所在文件夹（若有） */
    public getCurrentFolder(): Collection | null {
        return this.currentFolder;
    }

    /** 当前视图类型 home / comments / review / plan 等 */
    public getCurrentView(): string {
        return this.currentView;
    }

    /** 导航到首页 */
    public goHome(): void {
        this.handleNavigation('home');
    }

    /** 获取搜索栏实例 */
    public getSearchBar(): SearchBar | undefined {
        return this.searchBar;
    }
} 