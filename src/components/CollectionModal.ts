import { Modal, setIcon } from 'obsidian';
import BetterNotesPlugin from '../main';
import { Collection } from '../models/Collection';
import { t } from '../i18n';
/**
 * 集合模态框配置接口
 */
export interface CollectionModalOptions {
    mode: 'create' | 'edit';  // 模态框模式：创建或编辑
    collection?: Collection;  // 编辑模式下的集合对象
    /**
     * 当 type === 'set' 时可选择 plan
     * @param plan 绑定的 Plan 名称，空字符串表示不绑定
     */
    onConfirm: (name: string, color: string, type: string, parent: string, plan: string) => void;  // 确认回调
}

/**
 * 集合模态框组件
 * 用于创建或编辑集合，支持设置名称、颜色和类型
 */
export class CollectionModal extends Modal {
    private plugin: BetterNotesPlugin;
    private options: CollectionModalOptions;
    private collectionName: string = '';
    private collectionColor: string = '#6FB5ED'; // 默认颜色：天蓝色
    private collectionType: string = 'set';      // 默认类型：集合
    private collectionParent: string = '';       // 默认父集合：无
    private selectedPlan: string = 'default';           // 绑定的 Plan 名称
    
    /**
     * 构造函数
     * @param plugin 插件实例
     * @param options 模态框配置选项
     */
    constructor(plugin: BetterNotesPlugin, options: CollectionModalOptions) {
        super(plugin.app);
        this.plugin = plugin;
        this.options = options;
        
        // 如果是编辑模式，初始化值
        if (options.mode === 'edit' && options.collection) {
            this.collectionName = options.collection.name;
            this.collectionColor = options.collection.color;
            this.collectionType = options.collection.type;
            this.collectionParent = options.collection.parent;
            this.selectedPlan = options.collection.plan || '';
        }
    }
    
    /**
     * 检查一个文件夹是否为指定集合的子文件夹（包含递归子文件夹）
     * @param folderName 要检查的文件夹名称
     * @param collectionName 当前集合名称
     * @returns 如果是子文件夹则返回true，否则返回false
     */
    private isSubfolderOf(folderName: string, collectionName: string): boolean {
        // 如果文件夹名与集合名相同，则返回true（不能选择自己）
        if (folderName === collectionName) {
            return true;
        }
        
        // 获取文件夹对象
        const folder = this.plugin.dataManager.getCollection(folderName);
        if (!folder) {
            return false;
        }
        
        // 如果父文件夹为空，则不是子文件夹
        if (!folder.parent) {
            return false;
        }
        
        // 如果父文件夹就是当前集合，则是直接子文件夹
        if (folder.parent === collectionName) {
            return true;
        }
        
        // 递归检查父文件夹是否为当前集合的子文件夹
        return this.isSubfolderOf(folder.parent, collectionName);
    }
    
    /**
     * 渲染模态框内容
     */
    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.classList.add('BetterNotes-modal');
        
        // 标题区域
        const headerEl = contentEl.createDiv('BetterNotes-modal-header');
        
        // 创建表单容器
        const formEl = contentEl.createDiv('BetterNotes-modal-form');
        
        // 集合名称输入框
        const nameContainer = formEl.createDiv('BetterNotes-input-container');
        nameContainer.createEl('label', { text: t('name') });
        const nameInput = nameContainer.createEl('input', { 
            type: 'text',
            value: this.collectionName
        });
        nameInput.classList.add('BetterNotes-input');
        nameInput.focus();
        nameInput.addEventListener('input', () => {
            this.collectionName = nameInput.value;
        });
        
        // 集合颜色选择器
        const colorContainer = formEl.createDiv('BetterNotes-input-container');
        colorContainer.createEl('label', { text: t('color') });
        
        // 创建颜色预设容器
        const colorPresetsEl = colorContainer.createDiv('BetterNotes-color-presets');
        
        // 预设颜色数组
        const presetColors = [
            '#6FB5ED', // 天蓝色
            '#67C23A', // 绿色
            '#E6A23C', // 橙色
            '#F56C6C', // 红色
            '#9C27B0', // 紫色
            '#FF9FF3', // 粉色
            '#FFD93D', // 黄色
        ];
        
        // 创建颜色预设按钮
        presetColors.forEach(color => {
            const colorBtn = colorPresetsEl.createDiv('BetterNotes-color-preset');
            colorBtn.style.backgroundColor = color;
            
            // 选中当前颜色的标记
            if (color === this.collectionColor) {
                colorBtn.classList.add('selected');
            }
            
            colorBtn.addEventListener('click', () => {
                // 移除其他颜色的选中状态
                document.querySelectorAll('.BetterNotes-color-preset').forEach(el => {
                    el.classList.remove('selected');
                });
                document.querySelector('.BetterNotes-custom-color-input')?.classList.remove('active');
                
                // 选中当前颜色
                colorBtn.classList.add('selected');
                this.collectionColor = color;
            });
        });
        
        // 添加自定义颜色选择器按钮
        const customColorBtn = colorPresetsEl.createDiv('BetterNotes-color-preset BetterNotes-custom-color');
        customColorBtn.style.background = 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)';
        
        // 创建实际的颜色输入框
        const colorInput = createEl('input');
        colorInput.type = 'color';
        colorInput.value = this.collectionColor;
        colorInput.classList.add('BetterNotes-custom-color-input');
        colorInput.style.opacity = '0';
        colorInput.style.width = '0';
        colorInput.style.height = '0';
        colorInput.style.position = 'absolute';
        customColorBtn.appendChild(colorInput);
        
        // 如果当前颜色不在预设中，则选中自定义按钮
        if (!presetColors.includes(this.collectionColor)) {
            customColorBtn.classList.add('active');
            colorInput.value = this.collectionColor;
        }
        
        // 点击自定义颜色按钮
        customColorBtn.addEventListener('click', () => {
            colorInput.click();
        });
        
        // 颜色变化时更新
        colorInput.addEventListener('input', () => {
            // 移除其他颜色的选中状态
            document.querySelectorAll('.BetterNotes-color-preset').forEach(el => {
                el.classList.remove('selected');
            });
            
            // 激活自定义颜色按钮
            customColorBtn.classList.add('active');
            
            // 更新颜色值
            this.collectionColor = colorInput.value;
        });
        
        // 预先声明 planContainer，稍后创建，用于在切换类型时控制显示
        let planContainer: HTMLElement;
        
        // ------------------- 类型选择器（仅创建模式） -------------------
        if (this.options.mode === 'create') {
            // 集合类型选择器
            const typeContainer = formEl.createDiv('BetterNotes-input-container');
            typeContainer.createEl('label', { text: t('type') });
            
            // 创建类型选择按钮组
            const typeToggleEl = typeContainer.createDiv('BetterNotes-toggle-container');
            
            // 集合类型按钮
            const setTypeBtn = typeToggleEl.createDiv('BetterNotes-toggle-btn');
            if (this.collectionType === 'set') {
                setTypeBtn.classList.add('active');
            }
            const setTypeIconEl = setTypeBtn.createSpan('BetterNotes-toggle-icon');
            setIcon(setTypeIconEl, 'note');
            setTypeBtn.createSpan('BetterNotes-toggle-label').setText(t('set'));
            
            // 文件夹类型按钮
            const folderTypeBtn = typeToggleEl.createDiv('BetterNotes-toggle-btn');
            if (this.collectionType === 'folder') {
                folderTypeBtn.classList.add('active');
            }
            const folderTypeIconEl = folderTypeBtn.createSpan('BetterNotes-toggle-icon');
            setIcon(folderTypeIconEl, 'folder');
            folderTypeBtn.createSpan('BetterNotes-toggle-label').setText(t('folder'));
            
            // 设置类型切换事件
            setTypeBtn.addEventListener('click', () => {
                setTypeBtn.classList.add('active');
                folderTypeBtn.classList.remove('active');
                this.collectionType = 'set';
                planContainer.style.display = '';
            });
            
            folderTypeBtn.addEventListener('click', () => {
                folderTypeBtn.classList.add('active');
                setTypeBtn.classList.remove('active');
                this.collectionType = 'folder';
                planContainer.style.display = 'none';
            });
        }
        
        // -------------------- Plan 选择（仅 set 类型显示） --------------------
        planContainer = formEl.createDiv('BetterNotes-input-container');
        planContainer.createEl('label', { text: t('bind plan') });

        // 标签选择样式
        const planTagsContainer = planContainer.createDiv('BetterNotes-folder-tags-container');

        // 现有 plan 标签
        const plans = this.plugin.dataManager.getAllPlans();
        plans.forEach(p => {
            const tag = planTagsContainer.createDiv('BetterNotes-folder-tag');
            tag.setText(`#${p.name}`);
            if (this.selectedPlan === p.name) tag.classList.add('selected');
            tag.addEventListener('click', () => {
                // 互斥选择，且default为唯一时不可取消
                if (p.name === 'default' && plans.length === 1) {
                    // 只有default时，点击无效
                    return;
                }
                this.selectedPlan = p.name;
                updateTagSelection();
            });
        });

        // 更新标签选中状态
        function updateTagSelection() {
            planTagsContainer.childNodes.forEach((n: any) => n.classList.remove('selected'));
            planTagsContainer.childNodes.forEach((n: any) => {
                if ((n as HTMLElement).textContent === `#${that.selectedPlan}`) {
                    n.classList.add('selected');
                }
            });
        }

        const that = this; // for closure

        // 如果当前类型为 folder，隐藏计划选择
        if (this.collectionType === 'folder') {
            planContainer.style.display = 'none';
        }
        
        // 添加移动到文件夹选项（仅编辑模式下显示）
        if (this.options.mode === 'edit') {
            const moveContainer = formEl.createDiv('BetterNotes-input-container');
            moveContainer.createEl('label', { text: t('move to') });
            
            // 创建文件夹标签容器
            const folderTagsContainer = moveContainer.createDiv('BetterNotes-folder-tags-container');
            
            // 添加"根目录"选项
            const rootTag = folderTagsContainer.createDiv('BetterNotes-folder-tag');
            rootTag.classList.add('BetterNotes-root-tag');
            
            // 如果当前选择是根目录，添加选中样式
            if (this.collectionParent === '') {
                rootTag.classList.add('selected');
            }
            
            // 添加根目录图标
            const rootIconEl = rootTag.createSpan('BetterNotes-folder-tag-icon');
            setIcon(rootIconEl, 'home');
            
            // 添加根目录文本
            rootTag.createSpan('BetterNotes-folder-tag-name').setText(t('root'));
            
            // 添加点击事件
            rootTag.addEventListener('click', () => {
                // 只移除文件夹标签容器下的选中状态
                folderTagsContainer.childNodes.forEach((el: any) => el.classList.remove('selected'));
                // 选中根目录标签
                rootTag.classList.add('selected');
                this.collectionParent = '';
            });
            
            // 获取所有文件夹类型的集合（排除所有子文件夹，避免循环引用）
            const folders = this.plugin.dataManager.getAllCollections()
                .filter(c => c.type === 'folder' && !this.isSubfolderOf(c.name, this.collectionName));
            
            // 添加文件夹标签
            folders.forEach(folder => {
                const folderTag = folderTagsContainer.createDiv('BetterNotes-folder-tag');
                // 设置标签背景色为文件夹颜色的浅色版本
                const folderColor = folder.color;
                folderTag.style.backgroundColor = this.adjustColorOpacity(folderColor, 0.2);
                folderTag.style.borderColor = folderColor;
                // 如果是当前选中的父文件夹，添加选中样式
                if (folder.name === this.collectionParent) {
                    folderTag.classList.add('selected');
                }
                // 添加文件夹图标
                const folderIconEl = folderTag.createSpan('BetterNotes-folder-tag-icon');
                setIcon(folderIconEl, 'folder');
                folderIconEl.style.color = folderColor;
                // 添加文件夹名称
                folderTag.createSpan('BetterNotes-folder-tag-name').setText(folder.name);
                // 添加点击事件
                folderTag.addEventListener('click', () => {
                    // 只移除文件夹标签容器下的选中状态
                    folderTagsContainer.childNodes.forEach((el: any) => el.classList.remove('selected'));
                    // 选中当前标签
                    folderTag.classList.add('selected');
                    this.collectionParent = folder.name;
                });
            });
        }
        
        // 按钮容器
        const buttonContainer = contentEl.createDiv();
        buttonContainer.classList.add('BetterNotes-modal-buttons');
        
        // 取消按钮
        const cancelButton = buttonContainer.createEl('button', { text: t('cancel') });
        cancelButton.classList.add('BetterNotes-btn');
        cancelButton.addEventListener('click', () => {
            this.close();
        });
        
        // 确认按钮
        const confirmText = this.options.mode === 'create' ? t('create') : t('save');
        const confirmButton = buttonContainer.createEl('button', { text: confirmText });
        confirmButton.classList.add('BetterNotes-btn', 'BetterNotes-btn-primary');
        confirmButton.addEventListener('click', () => {
            if (this.collectionName.trim()) {
                // 调用确认回调
                this.options.onConfirm(
                    this.collectionName,
                    this.collectionColor,
                    this.collectionType,
                    this.collectionParent,
                    this.selectedPlan
                );
                this.close();
            } else {
                // 显示错误，集合名不能为空
                const errorMsg = contentEl.createEl('div', {
                    text: t('collection name cannot be empty'),
                    cls: 'BetterNotes-error'
                });
                
                // 将错误消息添加到表单容器中，确保它居中显示
                formEl.appendChild(errorMsg);
                nameInput.classList.add('BetterNotes-input-error');
                
                // 2秒后移除错误消息
                setTimeout(() => {
                    errorMsg.remove();
                    nameInput.classList.remove('BetterNotes-input-error');
                }, 2000);
            }
        });
    }
    
    /**
     * 调整颜色的透明度
     * @param color 原始颜色（十六进制格式）
     * @param opacity 目标透明度（0-1之间）
     * @returns 调整透明度后的颜色（rgba格式）
     */
    private adjustColorOpacity(color: string, opacity: number): string {
        // 移除可能的 # 前缀
        const hex = color.replace('#', '');
        
        // 将十六进制转换为 RGB
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // 返回 rgba 格式
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    
    /**
     * 关闭模态框
     */
    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
} 