import BetterNotesPlugin from '../main';
import { Collection } from '../models/Collection';
import { setIcon } from 'obsidian';
import { t } from '../i18n';
/**
 * ReviewSelectGrid
 * 复习集合多选网格组件
 * 以灵动可爱的卡片风格展示所有 set 类型集合，支持多选，底部有确认按钮。
 */
export class ReviewSelectGrid {
    private container: HTMLElement;
    private plugin: BetterNotesPlugin;
    private selected: Set<string> = new Set();
    private onConfirm: (selected: string[]) => void;
    private gridElement: HTMLElement;

    /**
     * @param container 容器元素
     * @param plugin 插件实例
     * @param onConfirm 确认回调，参数为选中的集合名称数组
     */
    constructor(container: HTMLElement, plugin: BetterNotesPlugin, onConfirm: (selected: string[]) => void) {
        this.container = container;
        this.plugin = plugin;
        this.onConfirm = onConfirm;
        this.gridElement = this.container.createEl('div');
        this.gridElement.classList.add('BetterNotes-grid');
    }

    /** 渲染选择网格 */
    public render(): void {
        // 先清空网格
        this.gridElement.empty();

        // 获取所有 set 类型的集合
        const sets = this.plugin.dataManager.getAllCollections().filter(c => c.type === 'set');

        // 渲染每张卡片
        sets.forEach(set => this.renderCard(set));

        // 渲染底部操作栏（全选 / 开始复习 / 统计信息）
        this.renderConfirmButton(sets);
    }

    /** 渲染单个集合卡片 */
    private renderCard(collection: Collection): void {
        const cardEl = this.gridElement.createEl('div');
        cardEl.classList.add('BetterNotes-card', 'BetterNotes-selectable-card');
        cardEl.style.backgroundColor = collection.color;
        cardEl.style.cursor = 'pointer';
        if (this.selected.has(collection.name)) {
            cardEl.classList.add('selected');
        }

        // 标题
        const titleEl = cardEl.createEl('div', { cls: 'BetterNotes-card-title', text: collection.name });
        // 图标
        const iconEl = cardEl.createEl('div', { cls: 'BetterNotes-card-icon' });
        setIcon(iconEl, 'note');

        // 选中动画
        const checkEl = cardEl.createEl('div', { cls: 'BetterNotes-card-check' });
        setIcon(checkEl, 'check');
        checkEl.style.display = this.selected.has(collection.name) ? '' : 'none';

        cardEl.addEventListener('click', () => {
            if (this.selected.has(collection.name)) {
                this.selected.delete(collection.name);
            } else {
                this.selected.add(collection.name);
            }

            // 刷新界面以更新统计信息与按钮状态
            this.render();
        });
    }

    /**
     * 渲染底部操作栏
     * @param allSets 当前展示的所有集合
     */
    private renderConfirmButton(allSets: Collection[]): void {
        // 先移除旧的 footer（若存在）
        const oldFooter = this.container.querySelector('.review-select-footer');
        if (oldFooter) oldFooter.remove();

        // 底部容器
        const footer = this.container.createDiv({ cls: 'BetterNotes-modal-footer review-select-footer' });
        footer.style.flexDirection = 'column';
        footer.style.alignItems = 'center';
        footer.style.gap = '15px';

        // 统计信息
        const totalEntries = Array.from(this.selected).reduce((acc, setName) => {
            return acc + this.plugin.dataManager.getEntriesBySet(setName).length;
        }, 0);

        const summaryEl = footer.createEl('div', {
            text: `${t('total')} ${totalEntries} ${t('cards')}`
        });
        summaryEl.style.color = 'var(--text-normal)';
        summaryEl.style.fontWeight = '600';
        summaryEl.style.fontSize = '15px';
        summaryEl.style.textAlign = 'center';
        
        // 创建按钮容器
        const buttonContainer = footer.createDiv({ cls: 'review-buttons-container' });
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.gap = '15px';

        // 全选 / 取消全选 按钮
        const selectAllBtnText = this.selected.size === allSets.length ? t('cancel select all') : t('select all');
        const selectAllBtn = buttonContainer.createEl('button', { 
            cls: 'flashforge-review-button',
            text: selectAllBtnText 
        });

        selectAllBtn.addEventListener('click', () => {
            if (this.selected.size === allSets.length) {
                // 已全选，再次点击则取消全选
                this.selected.clear();
            } else {
                // 选择全部集合
                allSets.forEach(s => this.selected.add(s.name));
            }
            // 重新渲染以更新 UI
            this.render();
        });

        // 开始复习按钮
        const confirmBtn = buttonContainer.createEl('button', { 
            cls: 'flashforge-review-button primary',
            text: t('start review') 
        });

        confirmBtn.addEventListener('click', () => {
            if (this.selected.size === 0) {
                confirmBtn.classList.add('shake');
                setTimeout(() => confirmBtn.classList.remove('shake'), 500);
                return;
            }
            this.onConfirm(Array.from(this.selected));
        });
    }
} 