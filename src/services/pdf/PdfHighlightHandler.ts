import { App, Notice } from 'obsidian';
import BetterNotesPlugin from '../../main';
import { Entry } from '../../models/Entry';
import { t } from '../../i18n';
/**
 * PdfHighlightHandler
 * -------------------------------------------------------
 * 监听 PDF.js 渲染出的 `section.highlightAnnotation` 元素和 `div.rect-capture-highlight` 元素。
 * 当用户按下 CMD/CTRL/Home 并点击高亮或矩形时，自动在侧边栏定位对应条目。
 */
export class PdfHighlightHandler {
  private isModifierKeyPressed = false;
  private plugin: BetterNotesPlugin;
  private processed = new Set<HTMLElement>();

  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundClick: (e: MouseEvent) => void;

  constructor(private app: App, plugin: BetterNotesPlugin) {
    this.plugin = plugin;

    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundClick = this.handleClick.bind(this);

    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);

    // 事件委托，捕获任何点击
    document.addEventListener('click', this.boundClick, true);
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.key === 'Home') this.isModifierKeyPressed = true;
    document.body.classList.add('mod-pressed');
  }
  private handleKeyUp(e: KeyboardEvent) {
    if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Home') this.isModifierKeyPressed = false;
    document.body.classList.remove('mod-pressed');
  }

  private async handleClick(e: MouseEvent) {
    if (!this.isModifierKeyPressed) return;
    const target = e.target as HTMLElement;
    
    if (target.classList.contains('highlightAnnotation')) {
    const id = target.getAttribute('data-annotation-id') ?? target.id;
    if (!id) return;

    const entry = this.findEntryByAnnotation(id);
      if (entry) {
        this.navigateToEntry(e, entry);
        return;
      }
    }
    
    const rectEl = this.findRectElement(target);
    if (rectEl) {
      const hash = rectEl.dataset.hash;
      if (!hash) return;
      
      const entry = this.findEntryByHash(hash);
      if (entry) {
        this.navigateToEntry(e, entry);
        return;
      }
    }
  }
  
  private findRectElement(target: HTMLElement): HTMLElement | null {
    if (target.classList.contains('rect-capture-highlight')) {
      return target;
    }
    
    let element: HTMLElement | null = target;
    while (element && element !== document.body) {
      if (element.classList.contains('rect-capture-highlight')) {
        return element;
      }
      element = element.parentElement;
    }
    
    return null;
  }
  
  private async navigateToEntry(e: MouseEvent, entry: Entry) {
    e.preventDefault();
    e.stopPropagation();

    await this.plugin.activateSidebarView();
    if (!this.plugin.sidebarView) {
      new Notice(t('cannot open sidebar view'));
      return;
    }
    this.plugin.sidebarView.openCommentsViewAndHighlightEntry(entry);
  }

  private findEntryByAnnotation(annotId: string): Entry | undefined {
    const all = this.plugin.dataManager.getAllEntries();
    return all.find(e => e.type === 'pdf' && typeof e.index === 'string' && e.index.includes(`annotation=${annotId}`));
  }
  
  private findEntryByHash(hash: string): Entry | undefined {
    const all = this.plugin.dataManager.getAllEntries();
    return all.find(e => e.hash === hash);
  }

  public cleanup() {
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('keyup', this.boundKeyUp);
    document.removeEventListener('click', this.boundClick, true);
  }
} 