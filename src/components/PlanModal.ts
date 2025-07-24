import { Modal, setIcon, Notice } from 'obsidian';
import BetterNotesPlugin from '../main';
import { Plan } from '../models/Plan';
import { t } from '../i18n';

/**
 * PlanModalOptions
 * 用于配置 PlanModal
 */
export interface PlanModalOptions {
    mode: 'create' | 'edit';
    plan?: Plan; // 编辑模式下传入
    onConfirm: (name: string, intervals: number[], min: number, max: number, fsrs: boolean) => void;
}

/**
 * PlanModal
 * 复习计划创建/编辑模态框
 */
export class PlanModal extends Modal {
    private plugin: BetterNotesPlugin;
    private options: PlanModalOptions;

    private name: string = '';
    private intervals: number[] = [0, 0, 0, 0, 0, 0];
    private min: number = 45;
    private max: number = 90;
    private fsrs: boolean = false;

    constructor(plugin: BetterNotesPlugin, options: PlanModalOptions) {
        super(plugin.app);
        this.plugin = plugin;
        this.options = options;

        if (options.mode === 'edit' && options.plan) {
            this.name = options.plan.name;
            this.intervals = [...options.plan.intervals];
            this.min = options.plan.min;
            this.max = options.plan.max;
            this.fsrs = options.plan.fsrs;
        }
    }

    /**
     * 渲染模态框内容
     */
    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.classList.add('BetterNotes-modal');

        const headerEl = contentEl.createDiv('BetterNotes-modal-header');
        
        // 表单容器
        const formEl = contentEl.createDiv('BetterNotes-modal-form');

        /** 名称输入 */
        const nameCtn = formEl.createDiv('BetterNotes-input-container');
        nameCtn.createEl('label', { text: t('name') });
        const nameInput = nameCtn.createEl('input', {
            type: 'text',
            value: this.name,
        });
        if (this.options.mode === 'edit') {
            (nameInput as HTMLInputElement).disabled = true;
        }
        nameInput.classList.add('BetterNotes-input');
        nameInput.addEventListener('input', () => {
            this.name = nameInput.value.trim();
        });

        /** intervals */
        const intervalsCtn = formEl.createDiv('BetterNotes-input-container');
        intervalsCtn.createEl('label', { text: t('In how many days will review again after remembered last time') });
        const listCtn = intervalsCtn.createDiv('BetterNotes-intervals-list');

        const renderIntervalInputs = () => {
            listCtn.empty();

            this.intervals.forEach((val, idx) => {
                if (val === 0) return; // 隐藏为 0 的行

                const item = listCtn.createDiv('BetterNotes-interval-item');

                // 文本: 上次记得
                item.createSpan({ text: t('last remembered') + ' ' });

                // 输入框
                const input = item.createEl('input', {
                    type: 'number',
                    value: String(val),
                });
                input.classList.add('BetterNotes-input', 'BetterNotes-interval-input');
                input.addEventListener('input', () => {
                    this.intervals[idx] = Number(input.value);
                });

                // 文本: 天后，第 N 次复习
                item.createSpan({ text: `days away， NO.${idx + 1} review` });

                // 删除按钮（至少保留 1 个）
                if (this.intervals.length > 1) {
                    const delBtn = item.createDiv('BetterNotes-interval-del');
                    setIcon(delBtn, 'x');
                    delBtn.addEventListener('click', () => {
                        this.intervals[idx] = 0;
                        renderIntervalInputs();
                    });
                }
            });
        };

        // 渲染初始列表
        renderIntervalInputs();

        // 大号 + 按钮，位于列表下方
        const bigAddBtn = intervalsCtn.createDiv('BetterNotes-big-add');
        setIcon(bigAddBtn, 'plus');
        bigAddBtn.addEventListener('click', () => {
            if (this.intervals.filter(v => v > 0).length >= 6) {
                new Notice(t('maximum 6 intervals'));
                return;
            }
            // 找到第一个为 0 的位置
            const idx = this.intervals.findIndex(v => v === 0);
            if (idx !== -1) {
                this.intervals[idx] = 1;
            }
            renderIntervalInputs();
        });

        /** FSRS 开关 */
        const fsrsCtn = formEl.createDiv('BetterNotes-input-container');
        const fsrsLabel = fsrsCtn.createEl('label', { text: t('FSRS for advanced intervals') });
        const fsrsCheckbox = fsrsCtn.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
        fsrsCheckbox.checked = this.fsrs;
        fsrsCheckbox.addEventListener('change', () => {
            this.fsrs = fsrsCheckbox.checked;
        });

        /** min / max */
        const rangeCtn = formEl.createDiv('BetterNotes-input-container');
        rangeCtn.createEl('label', { text: t('Random intervals (proficiency > 5)') });
        const rangeInputs = rangeCtn.createDiv('BetterNotes-range-inputs');

        const minInput = rangeInputs.createEl('input', {
            type: 'number',
            value: String(this.min),
            placeholder: t('min value'),
        });
        minInput.classList.add('BetterNotes-input');
        minInput.addEventListener('input', () => {
            this.min = Number(minInput.value);
        });

        rangeInputs.createSpan({ text: ' ~ ' });

        const maxInput = rangeInputs.createEl('input', {
            type: 'number',
            value: String(this.max),
            placeholder: t('max value'),
        });
        maxInput.classList.add('BetterNotes-input');
        maxInput.addEventListener('input', () => {
            this.max = Number(maxInput.value);
        });

        /** footer buttons */
        const footer = contentEl.createDiv('BetterNotes-modal-footer');
        const confirmBtn = footer.createEl('button', { text: t('confirm') });
        confirmBtn.classList.add('mod-cta');
        confirmBtn.addEventListener('click', () => {
            if (!this.name) {
                new Notice(t('name cannot be empty'));
                return;
            }
            const finalIntervals = [...this.intervals]; // 已经保证长度 6

            this.options.onConfirm(this.name, finalIntervals, this.min, this.max, this.fsrs);
            this.close();
        });

        const cancelBtn = footer.createEl('button', { text: t('cancel') });
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
} 