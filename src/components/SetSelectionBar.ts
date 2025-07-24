import BetterNotesPlugin from '../main';
import { Collection } from '../models/Collection';
import { SetSelectionService } from '../services/SetSelectionService';
import { t } from '../i18n';
/**
 * SetSelectionBar
 * -------------------------------------------------------
 * 横向展示所有类型为 "set" 的 Collection，当用户点击某个色块时，
 * 通过 SetSelectionService 更新当前选中集合，并在控制台输出。
 */
export class SetSelectionBar {
  private parent: HTMLElement;
  private plugin: BetterNotesPlugin;
  private service: SetSelectionService;
  private container: HTMLElement;

  constructor(parent: HTMLElement, plugin: BetterNotesPlugin, service: SetSelectionService) {
    this.parent = parent;
    this.plugin = plugin;
    this.service = service;
    this.render();
    // 监听外部改变（例如其他组件取消选择）
    this.service.onChange(() => this.updateSelectedStyle());
  }

  /**
   * 创建容器并首次渲染。
   */
  private render(): void {
    this.container = this.parent.createDiv('BetterNotes-set-selection-bar');
    this.container.style.display = 'flex';
    this.container.style.flexWrap = 'nowrap';
    this.container.style.gap = '8px';
    this.container.style.overflowX = 'visible';
    this.container.style.marginBottom = '4px';

    this.renderBlocks();
  }

  /** 重新渲染色块列表 */
  private renderBlocks(): void {
    this.container.empty();
    const sets = this.getSets();

    sets.forEach((set) => {
      const block = this.container.createDiv('BetterNotes-set-block');
      block.setAttr('title', set.name);
      block.style.backgroundColor = set.color;
      block.dataset.setName = set.name;

      block.addEventListener('click', () => {
        this.service.select(set.name);
        //console.log('[SetSelection] selected:', this.service.getSelected());
        this.updateSelectedStyle();
      });
    });

    this.updateSelectedStyle();
  }

  /**
   * 获取所有 type === 'set' 的集合
   */
  private getSets(): Collection[] {
    return this.plugin.dataManager.getAllCollections().filter((c) => c.type === 'set');
  }

  /**
   * 根据当前选中状态更新样式
   */
  private updateSelectedStyle(): void {
    const selected = this.service.getSelected();
    this.container.querySelectorAll<HTMLElement>('.BetterNotes-set-block').forEach((el) => {
      if (el.dataset.setName === selected) {
        el.classList.add('selected');
        el.style.outline = '2px solid #fff';
      } else {
        el.classList.remove('selected');
        el.style.outline = 'none';
      }
    });
  }

  /** 提供外部调用，用于在集合变动后刷新视图 */
  public refresh(): void {
    this.renderBlocks();
  }
} 