import BetterNotesPlugin from '../main';
import { Plan } from '../models/Plan';
import { PlanCard } from './PlanCard';
import { setIcon } from 'obsidian';
import { PlanModal } from './PlanModal';

/**
 * PlanGrid
 * 以网格形式展示 Plan。
 */
export class PlanGrid {
    private container: HTMLElement;
    private plugin: BetterNotesPlugin;
    private gridElement: HTMLElement;

    constructor(container: HTMLElement, plugin: BetterNotesPlugin) {
        this.container = container;
        this.plugin = plugin;
        this.gridElement = this.container.createEl('div');
        this.gridElement.classList.add('BetterNotes-grid');
    }

    /** 渲染全部 Plan */
    public render(): void {
        this.gridElement.empty();
        const plans = this.plugin.dataManager.getAllPlans().sort((a, b) => a.name.localeCompare(b.name));
        plans.forEach(p => this.renderCard(p));
        this.renderAddCard();
    }

    private renderCard(plan: Plan): void {
        const cardEl = this.gridElement.createEl('div');
        const card = new PlanCard(cardEl, plan, this.plugin);
        card.render();
    }

    private renderAddCard(): void {
        const addCardEl = this.gridElement.createEl('div');
        addCardEl.classList.add('BetterNotes-card', 'BetterNotes-add-card');
        addCardEl.style.backgroundColor = '#FFCDD2';

        const iconCtn = addCardEl.createEl('div', { cls: 'BetterNotes-add-icon-container' });
        setIcon(iconCtn, 'plus');

        addCardEl.addEventListener('click', () => this.openCreateModal());
    }

    private openCreateModal(): void {
        const modal = new PlanModal(this.plugin, {
            mode: 'create',
            onConfirm: async (name, intervals, min, max, fsrs) => {
                await this.plugin.dataManager.createPlan(name, { intervals, min, max, fsrs });
                this.render();
            },
        });
        modal.open();
    }
} 