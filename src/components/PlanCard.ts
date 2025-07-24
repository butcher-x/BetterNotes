import { Plan } from "../models/Plan";
import BetterNotesPlugin from "../main";
import { setIcon } from "obsidian";
import { PlanModal } from "./PlanModal";
import { t } from '../i18n';
/**
 * PlanCard
 * 显示单个 Plan 的信息卡片。
 */
export class PlanCard {
    private container: HTMLElement;
    private plan: Plan;
    private plugin: BetterNotesPlugin;

    constructor(container: HTMLElement, plan: Plan, plugin: BetterNotesPlugin) {
        this.container = container;
        this.plan = plan;
        this.plugin = plugin;
    }

    /** 渲染卡片 */
    public render(): void {
        this.container.empty();
        this.container.classList.add('BetterNotes-card');
        this.container.style.backgroundColor = '#2b1540';//暗紫色

        // 标题
        const title = this.container.createEl('div', { cls: 'BetterNotes-card-title', text: this.plan.name });

        // icon
        const iconEl = this.container.createEl('div', { cls: 'BetterNotes-card-icon' });
        setIcon(iconEl, 'calendar');

        // 底部工具栏
        const footer = this.container.createEl('div', { cls: 'BetterNotes-card-footer' });
        const tools = footer.createEl('div', { cls: 'BetterNotes-card-tools' });

        // edit
        const editBtn = tools.createEl('div', { cls: 'BetterNotes-card-tool' });
        setIcon(editBtn, 'pencil');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openEditModal();
        });

        // delete
        if (this.plan.name !== 'default') {
            const delBtn = tools.createEl('div', { cls: 'BetterNotes-card-tool' });
            setIcon(delBtn, 'trash');
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDeleteConfirm();
            });
        }
    }

    /** 打开编辑 Plan 模态框 */
    private openEditModal(): void {
        const modal = new PlanModal(this.plugin, {
            mode: 'edit',
            plan: this.plan,
            onConfirm: async (name, intervals, min, max, fsrs) => {
                await this.plugin.dataManager.updatePlan(name, { intervals, min, max, fsrs });
                await this.plugin.refreshViews();
            },
        });
        modal.open();
    }

    /** 删除确认 */
    private openDeleteConfirm(): void {
        const confirmed = confirm(t('confirm delete plan') + ' "' + this.plan.name + '"');
        if (!confirmed) return;
        this.plugin.dataManager.deletePlan(this.plan.name);
        this.plugin.refreshViews();
    }

} 