import { setIcon } from 'obsidian';
import BetterNotesPlugin from '../main';
import { FSRSService } from '../services/fsrs/FSRSService';
import { FSRS_RATING } from '../services/fsrs/FSRSTypes';
import { AnnotationModal } from './AnnotationModal';
import { t } from '../i18n';
import { ImageEditorModal } from './ImageEditorModal';
/**
 * ReviewSessionView
 * 负责渲染复习阶段的 UI，仅包含视觉元素与交互回调占位。
 */
export class ReviewSessionView {
    private container: HTMLElement;
    private plugin: BetterNotesPlugin;
    private sets: string[];
    private queue: any[] = [];
    private currentEntry: any | null = null;
    private totalCount = 0;
    private progressFilled!: HTMLElement;
    private isShowingAnnotation = false; // 是否正在显示批注
    private fsrsService: FSRSService;

    /**
     * @param container 容器
     * @param plugin 插件实例
     * @param sets 复习的集合名称数组
     */
    constructor(container: HTMLElement, plugin: BetterNotesPlugin, sets: string[]) {
        this.container = container;
        this.plugin = plugin;
        this.sets = sets;
        this.fsrsService = plugin.fsrsService;
    }

    /** 渲染复习 UI */
    public render(): void {
        this.container.empty();
        // 构建复习队列
        this.queue = this.buildReviewQueue();
        this.totalCount = this.queue.length;
        this.renderProgressBar();
        this.renderCardArea();
        this.renderActionButtons();
        this.nextCard();
    }

    /** 渲染顶部进度条 */
    private renderProgressBar(): void {
        const barWrapper = this.container.createDiv('flashforge-progress-wrapper');
        this.progressFilled = barWrapper.createDiv('flashforge-progress-filled');
    }

    /** 渲染卡片区域 */
    private renderCardArea(): void {
        const cardContainer = this.container.createDiv('flashforge-review-card-container');
        this.renderCard(cardContainer, t('review content will be shown here'));
        // 保存卡片容器引用用于刷新
        this.cardParent = cardContainer;
    }

    private renderCard(parent: HTMLElement, content: string, isAnnotation = false): void {
        parent.empty();
        const cardFront = parent.createDiv('flashforge-review-card-front');
        
        // 如果是批注，添加暗紫色背景类
        if (isAnnotation) {
            cardFront.addClass('annotation-mode');
        }
        
        const contentEl = cardFront.createDiv('flashforge-review-card-content');
        if (content) {
        contentEl.setText(content);
        }

        // 附件现在渲染在内容元素内部
        if (isAnnotation) {
            this.renderAttachments(contentEl, 'back');
        } else {
            this.renderAttachments(contentEl, 'front');
        }
    }

    /**
     * 渲染指定侧（正面/背面）的附件图片。
     * @param container - 图片将被添加到的父级DOM元素。
     * @param side - 'front' 或 'back'，用于筛选文件名。
     */
    private renderAttachments(container: HTMLElement, side: 'front' | 'back'): void {
        if (!this.currentEntry || !this.currentEntry.attachmentFile?.length) {
            return;
        }

        const attachments = this.currentEntry.attachmentFile as string[];
        const filtered = attachments.filter(p => p.toLowerCase().includes(`-${side}.`));

        if (filtered.length === 0) return;

        const attachmentsContainer = container.createDiv('flashforge-review-attachments');
        filtered.forEach(path => {
            const imgEl = attachmentsContainer.createEl('img');
            imgEl.src = this.plugin.app.vault.adapter.getResourcePath(path);
            imgEl.style.width = '100%';
            imgEl.style.borderRadius = '8px';
            imgEl.style.marginTop = '12px';
            imgEl.style.cursor = 'pointer';

            imgEl.addEventListener('click', () => {
                new ImageEditorModal(this.plugin, { imagePath: path }).open();
            });
        });
    }

    /** 渲染按钮与功能条 */
    private renderActionButtons(): void {
        const btnContainer = this.container.createDiv('flashforge-review-btn-container');

        this.createReviewButton(btnContainer, 'again', 'repeat');
        this.createReviewButton(btnContainer, 'hard', 'alert-triangle');
        this.createReviewButton(btnContainer, 'easy', 'check');

        // 功能条
        const barCtn = this.container.createDiv('flashforge-extra-bar-container');
        const contextBtn = this.createExtraBar(barCtn, t('context'));
        contextBtn.addEventListener('click', () => this.handleContextClick());

        const editBtn = this.createExtraBar(barCtn, t('edit'));
        editBtn.addEventListener('click', () => this.openEditModal());
        
        const viewBtn = this.createExtraBar(barCtn, t('view'));
        viewBtn.addEventListener('click', () => this.toggleAnnotation());
    }

    /** 打开编辑模态框 */
    private openEditModal(): void {
        if (!this.currentEntry) return;
        const entry = this.currentEntry;
        const modal = new AnnotationModal(this.plugin, {
            selectedText: entry.value,
            sourcePath: entry.sourceFile,
            entry: entry,
            onConfirm: async (updates) => {
                // 保存更新
                await this.plugin.updateEntry(entry.hash, updates);
                // 同步当前卡片展示内容
                Object.assign(entry, updates);
                if (this.cardParent) {
                    if (this.isShowingAnnotation) {
                        this.renderCard(this.cardParent, entry.comment , true);
                    } else {
                        this.renderCard(this.cardParent, entry.value);
                    }
                }
            }
        });
        modal.open();
    }

    private createReviewButton(parent: HTMLElement, label: 'again'|'hard'|'easy', icon: string): HTMLElement {
        const btn = parent.createDiv('flashforge-review-btn');
        setIcon(btn, icon);
        btn.createSpan({ text: ` ${label}` });
        btn.addEventListener('click', () => this.handleResponse(label));
        return btn;
    }

    private createExtraBar(parent: HTMLElement, text: string): HTMLElement {
        const bar = parent.createDiv('flashforge-extra-bar');
        bar.setText(text);
        return bar;
    }

    // 处理"语境"按钮点击
    private handleContextClick(): void {
        if (this.currentEntry && this.currentEntry.hash) {
            // 使用 EntryNavigation 服务导航到原始条目
            this.plugin.entryNavigation.navigateToEntry(this.currentEntry);
        }
    }

    // 切换显示批注
    private toggleAnnotation(): void {
        if (!this.currentEntry) return;
        
        this.isShowingAnnotation = !this.isShowingAnnotation;
        
        if (this.cardParent && this.cardParent.firstElementChild) {
            const currentCard = this.cardParent.firstElementChild as HTMLElement;
            
            // 添加CSS类以实现收拢动画
            currentCard.classList.add('card-scroll-collapse');
            
            // 等待动画完成后更新内容并展开
            setTimeout(() => {
                const cardParent = this.cardParent!;
                if (this.isShowingAnnotation) {
                    // 显示批注内容
                    const annotation = this.currentEntry.comment;
                    this.renderCard(cardParent, annotation, true);
                } else {
                    // 显示原始内容
                    this.renderCard(cardParent, this.currentEntry!.value, false);
                }
                
                // 给新卡片添加展开动画类
                if (this.cardParent?.firstElementChild) {
                    const newCard = this.cardParent.firstElementChild as HTMLElement;
                    newCard.classList.add('card-scroll-expand');
                    
                    // 动画完成后移除动画类
                    setTimeout(() => {
                        newCard.classList.remove('card-scroll-expand');
                    }, 600);
                }
            }, 400); // 收拢动画持续时间
        }
    }

    /** 跳到下一张卡片(仅 UI 占位) */
    private nextCard(): void {
        // 如果队列为空，说明复习完成
        if (this.queue.length === 0) {
            this.cardParent?.empty();
            this.cardParent?.createSpan({ text: t('🎉 review completed') });
            this.updateProgress(1); // 100%
            return;
        }

        // 重置批注显示状态
        this.isShowingAnnotation = false;

        // 取出下一张卡片
        this.currentEntry = this.queue.shift();

        // 在显示新卡片前更新进度（当前卡片尚未完成，因此 -1）
        const progressRatio = (this.totalCount - this.queue.length - 1) / this.totalCount;
        this.updateProgress(Math.max(0, progressRatio));
        
        // 实现卡片卷轴收拢和展开的效果
        if (this.cardParent && this.currentEntry) {
            // 先收拢当前卡片
            if (this.cardParent.firstElementChild) {
                const currentCard = this.cardParent.firstElementChild as HTMLElement;
                
                // 添加CSS类以实现收拢动画
                currentCard.classList.add('card-scroll-collapse');
                
                // 等待动画完成后更新内容并展开
                setTimeout(() => {
                    this.renderCard(this.cardParent!, this.currentEntry!.value);
                    
                    // 给新卡片添加展开动画类
                    if (this.cardParent?.firstElementChild) {
                        const newCard = this.cardParent.firstElementChild as HTMLElement;
                        newCard.classList.add('card-scroll-expand');
                        
                        // 动画完成后移除动画类
                        setTimeout(() => {
                            newCard.classList.remove('card-scroll-expand');
                        }, 600);
                    }
                }, 400); // 收拢动画持续时间
            } else {
                this.renderCard(this.cardParent, this.currentEntry.value);
                if (this.cardParent?.firstElementChild) {
                    const newCard = this.cardParent.firstElementChild as HTMLElement;
                    newCard.classList.add('card-scroll-expand');
                    setTimeout(() => {
                        newCard.classList.remove('card-scroll-expand');
                    }, 600);
                }
            }
        }
    }

    private handleResponse(action: 'again'|'hard'|'easy'): void {
        if (!this.currentEntry) return;
        const entry = this.currentEntry;
        const collection = this.plugin.dataManager.getCollection(entry.set);
        const plan = collection ? this.plugin.dataManager.getPlan(collection.plan) : undefined;
        const pro = entry.proficiency ?? 0;
        const intervalVal = plan?.intervals[pro] ?? 0;

        if (intervalVal !== 0 || !plan?.fsrs) {
            // Legacy 分支
            if (action === 'again') {
                entry.proficiency = Math.max(0, entry.proficiency - 1);
            } else if (action === 'hard') {
                entry.proficiency = 0;
            } else if (action === 'easy') {
                this.calculateNextExpire(entry, entry.proficiency);
                entry.proficiency++;
            }
        } else {
            // FSRS 分支
            let card = this.plugin.dataManager.getFSRSState(entry.hash);
            if (!card) {
                card = this.fsrsService.initializeCard();
            }
            const ratingMap: Record<'again'|'hard'|'easy', import("../services/fsrs/FSRSTypes").FSRSRating> = {
                again: FSRS_RATING.AGAIN,
                hard: FSRS_RATING.HARD,
                easy: FSRS_RATING.EASY,
            };
            const newCard = this.fsrsService.review(card, ratingMap[action]);
            this.plugin.dataManager.setFSRSState(entry.hash, newCard);
            entry.expireTime = new Date(newCard.nextReview).toISOString().slice(0,10);
            entry.proficiency++;
        }

        // update entry
        this.plugin.updateEntry(entry.hash, {expireTime: entry.expireTime });

        // 放回队列规则
        if (action !== 'easy') {
            this.queue.push(entry);
        }
        this.nextCard();
    }

    /** 根据 proficiency 计算下次复习时间 */
    private calculateNextExpire(entry: any, pro: number) {
        const collection = this.plugin.dataManager.getCollection(entry.set);
        if (!collection) return;
        const planName = collection.plan;
        const plan = this.plugin.dataManager.getPlan(planName);
        if (!plan) return;
        const idx = pro >= plan.intervals.length ? plan.intervals.length - 1 : pro;
        let days = plan.intervals[idx];
        if (days === 0) {
            days = Math.floor(Math.random() * (plan.max - plan.min + 1)) + plan.min;
        }
        const target = new Date();
        target.setDate(target.getDate() + days);
        entry.expireTime = target.toISOString().slice(0,10);
    }

    /** 构建复习队列 */
    private buildReviewQueue(): any[] {
        const list: any[] = [];
        const todayStr = new Date().toISOString().slice(0,10);

        this.sets.forEach(name => {
            const collection = this.plugin.dataManager.getCollection(name);
            if (!collection) return;
            const planName = collection.plan || 'default';
            const plan = this.plugin.dataManager.getPlan(planName);
            if (!plan) return;

            const entries = this.plugin.dataManager.getEntriesBySet(name);

            entries.forEach(entry => {
                const pro: number = entry.proficiency ?? 0;
                const intervalVal = plan.intervals[pro] ?? 0;

                if (intervalVal !== 0) {
                    // 固定间隔逻辑：检查 expireTime
                    if (!entry.expireTime || entry.expireTime <= todayStr) {
                        list.push(entry);
                    }
                } else {
                    if (!plan.fsrs) {
                        // 随机区间逻辑，同样检查过期
                        if (!entry.expireTime || entry.expireTime <= todayStr) {
                            list.push(entry);
                        }
                    } else {
                        // FSRS 模式
                        let card = this.plugin.dataManager.getFSRSState(entry.hash);
                        if (!card) {
                            card = this.fsrsService.initializeCard();
                            this.plugin.dataManager.setFSRSState(entry.hash, card);
                        }
                        if (this.fsrsService.isDue(card)) {
                            list.push(entry);
                        }
                    }
                }
            });
        });

        return list;
    }

    private cardParent: HTMLElement | null = null;

    /** 更新进度条 0~1 */
    private updateProgress(ratio: number) {
        if (this.progressFilled) {
            this.progressFilled.style.width = `${Math.floor(ratio * 100)}%`;
        }
    }
} 