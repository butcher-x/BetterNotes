import { setIcon } from 'obsidian';

/**
 * TitleBar 组件
 * 仅负责在集合/列表等页面顶部显示标题和返回按钮
 */
export class TitleBar {
    private container: HTMLElement;
    private title: string;
    private onBack: () => void;

    /**
     * 构造函数
     * @param parent 父级容器
     * @param title 标题文本
     * @param onBack 点击返回回调
     */
    constructor(parent: HTMLElement, title: string, onBack: () => void) {
        this.container = parent.createEl('div', { cls: 'BetterNotes-titlebar' });
        this.title = title;
        this.onBack = onBack;

        this.render();
    }

    /** 渲染标题栏 */
    private render(): void {
        this.container.empty();

        // 返回按钮
        const backBtn = this.container.createEl('div', { cls: 'BetterNotes-back-button' });
        setIcon(backBtn, 'arrow-left');
        backBtn.addEventListener('click', () => {
            this.onBack();
        });

        // 标题文本
        this.container.createEl('div', { cls: 'BetterNotes-title', text: this.title });
    }

    /** 更新标题 */
    public setTitle(title: string): void {
        this.title = title;
        this.render();
    }
} 