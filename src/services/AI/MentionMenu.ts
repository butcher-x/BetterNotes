/**
 * MentionMenu
 * --------------------------------------------------
 * 用于在聊天输入框上方展示候选项列表（文件 / 命令等）。
 * 当前只做最小 MVP：检测到 '@' 触发后显示静态列表 [file1, file2]。
 * 未来可扩展为动态检索 vault 文件。
 */

export type MentionItem = {
  id: string;
  label: string;
};

export class MentionMenu {
  private container: HTMLElement; // 输入框所在容器 (用于定位)
  private menuEl: HTMLElement | null = null;
  private items: MentionItem[] = [];
  private onSelect: (item: MentionItem) => void;
  private currentIndex = 0;

  constructor(container: HTMLElement, onSelect: (item: MentionItem) => void) {
    this.container = container;
    this.onSelect = onSelect;
  }

  /**
   * 显示菜单。会在输入框左上角对齐。
   * @param items 列表项
   */
  public show(items: MentionItem[]): void {
    this.items = items;
    this.currentIndex = 0;
    if (!this.menuEl) {
      this.createMenu();
    }
    this.renderItems();
    this.menuEl!.style.display = 'block';
  }

  /** 隐藏菜单 */
  public hide(): void {
    if (this.menuEl) {
      this.menuEl.style.display = 'none';
    }
  }

  /** 销毁 */
  public destroy(): void {
    this.menuEl?.remove();
    this.menuEl = null;
  }

  private createMenu() {
    // 父节点定位参照 inputContainer (position: relative 已在 CSS?)
    this.menuEl = this.container.createDiv('sn-mention-menu');
    this.menuEl.style.position = 'absolute';
    this.menuEl.style.left = '0';
    this.menuEl.style.top = '0';
    this.menuEl.style.zIndex = '9999';
    this.menuEl.style.transform = 'translateY(-100%)';
  }

  private renderItems() {
    if (!this.menuEl) return;
    this.menuEl.empty();
    this.items.forEach((item, idx) => {
      const el = this.menuEl!.createDiv('sn-mention-item');
      el.setText(item.label);
      if (idx === this.currentIndex) el.addClass('selected');

      el.addEventListener('mousedown', (ev) => {
        ev.preventDefault(); // 防止 textarea 失焦
        this.onSelect(item);
        this.hide();
      });
    });
  }

  public isVisible(): boolean {
    return !!this.menuEl && this.menuEl.style.display !== 'none';
  }

  public move(delta: number): void {
    if (!this.isVisible()) return;
    const len = this.items.length;
    this.currentIndex = (this.currentIndex + delta + len) % len;
    this.renderItems();
  }

  public choose(): void {
    if (!this.isVisible()) return;
    const item = this.items[this.currentIndex];
    if (item) {
      this.onSelect(item);
    }
    this.hide();
  }

  /**
   * 获取当前高亮项
   */
  public getCurrentItem(): MentionItem | undefined {
    return this.items[this.currentIndex];
  }
} 