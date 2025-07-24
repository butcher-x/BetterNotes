/**
 * QuickCaptureService
 * -------------------------------------------------------
 * 当用户在 SetSelectionBar 选中某个 set 后，监听全局文本选区（Markdown/PDF），
 * 在 PointerUp 时自动将选中文本作为条目标注加入对应集合，批注(comment)留空。
 *
 * 设计要点：
 * 1. 该服务只在选中 set 时生效，取消选择立即停止插入。
 * 2. 通过 Obsidian Workspace 获取当前活动文件的路径及类型(md/pdf)。
 * 3. 避免重复插入：若用户连续拖动过程中多次 pointerup，会因选区未变化重复；
 *    简易做法：记录上一次插入的 (hash, text, file, set) 与时间，短时间(1s) 内重复则忽略。
 * 4. 与 UI 解耦，仅依赖 SetSelectionService 及 Plugin API。
 */

import { App, MarkdownView, Menu } from 'obsidian';
import BetterNotesPlugin from '../main';
import { SetSelectionService } from './SetSelectionService';
import { generateHash } from '../utils/utils';

interface RecentCapture {
  text: string;
  filePath: string;
  set: string;
  timestamp: number;
}

export class QuickCaptureService {
  private readonly app: App;
  private readonly plugin: BetterNotesPlugin;
  private readonly setService: SetSelectionService;
  private recent?: RecentCapture;

  private boundPointerUp: (e: PointerEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;

  constructor(app: App, plugin: BetterNotesPlugin, setService: SetSelectionService) {
    this.app = app;
    this.plugin = plugin;
    this.setService = setService;

    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundContextMenu = this.handleContextMenu.bind(this);
    
    document.addEventListener('pointerup', this.boundPointerUp, true);
    document.addEventListener('contextmenu', this.boundContextMenu, true);
  }

  /** 在插件卸载时调用 */
  public cleanup() {
    document.removeEventListener('pointerup', this.boundPointerUp, true);
    document.removeEventListener('contextmenu', this.boundContextMenu, true);
  }

  /** 处理全局 pointerup，若有非空选区则尝试插入条目 */
  private async handlePointerUp(_: PointerEvent) {
    const setName = this.setService.getSelected();
    if (!setName) return; // 未选中 set 时忽略

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text) return;

    // 活动文件
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return;

    const filePath = activeFile.path;
    const isPdf = activeFile.extension.toLowerCase() === 'pdf';

    // 简易重复检测：1 秒内插入相同内容同文件同 set 则忽略
    const now = Date.now();
    if (
      this.recent &&
      now - this.recent.timestamp < 1000 &&
      this.recent.text === text &&
      this.recent.filePath === filePath &&
      this.recent.set === setName
    ) {
      return;
    }

    try {
      if (isPdf) {
        // 对 PDF 由 PdfBacklinkHighlighter 负责创建条目和批注
        return;
      } else {
        // 检查 Markdown 即时标注设置
        if (!this.plugin.settings.mdImmediateAnnotation) {
          // 如果设置为非即时标注，则不在 pointerup 时处理
          return;
        }
        
        // Markdown：插入 span 并使用固定 hash
        await this.createMdAnnotation(text, filePath, setName);
      }
    } catch (e) {
      console.error('QuickCaptureService createEntry error', e);
    }
  }
  
  /** 处理右键菜单，为选中文本提供"加入集合"选项 */
  private async handleContextMenu(event: MouseEvent) {
    // 仅当设置为非即时标注且有选中文本时处理
    if (this.plugin.settings.mdImmediateAnnotation) return;
    
    const setName = this.setService.getSelected();
    if (!setName) return; // 未选中 set 时忽略
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    const text = selection.toString().trim();
    if (!text) return;
    
    // 活动文件
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension.toLowerCase() !== 'md') return;
    
    const filePath = activeFile.path;
    
    // 获取编辑器实例
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView || !mdView.editor) return;
    
    // 阻止默认的右键菜单
    event.preventDefault();
    
    // 创建我们自己的菜单
    const menu = new Menu();
    
    // 首先添加我们的"加入集合"选项
    const collection = this.plugin.dataManager.getCollection(setName);
    const colorStyle = collection ? `color: ${collection.color};` : '';
    
    menu.addItem((item) => {
      item.setTitle(`加入集合 "${setName}"`)
          .setIcon("note-glyph")
          .setSection("BetterNotes")
          .onClick(async () => {
            await this.createMdAnnotation(text, filePath, setName);
          });
      
      // 设置菜单项的样式
      if (colorStyle) {
        setTimeout(() => {
          const menuItem = document.querySelector('.menu-item[data-section="BetterNotes"] .menu-item-icon');
          if (menuItem) {
            (menuItem as HTMLElement).setAttribute('style', colorStyle);
          }
        }, 0);
      }
    });
    
    // 添加分隔线
    menu.addSeparator();
    
    // 添加剪切选项
    menu.addItem((item) => {
      item.setTitle("剪切")
          .setIcon("scissors")
          .onClick(() => {
            navigator.clipboard.writeText(text);
            mdView.editor.replaceSelection("");
          });
    });
    
    // 添加复制选项
    menu.addItem((item) => {
      item.setTitle("复制")
          .setIcon("copy")
          .onClick(() => {
            navigator.clipboard.writeText(text);
          });
    });
    
    // 添加粘贴选项
    menu.addItem((item) => {
      item.setTitle("粘贴")
          .setIcon("paste")
          .onClick(async () => {
            try {
              const clipText = await navigator.clipboard.readText();
              mdView.editor.replaceSelection(clipText);
            } catch (e) {
              console.error("粘贴失败:", e);
            }
          });
    });
    
    // 显示菜单
    menu.showAtMouseEvent(event);
  }
  
  /**
   * 创建 Markdown 标注
   * @param text 选中的文本
   * @param filePath 文件路径
   * @param setName 集合名称
   */
  private async createMdAnnotation(text: string, filePath: string, setName: string): Promise<void> {
    const hash = generateHash();
    const collection = this.plugin.dataManager.getCollection(setName);
    if (!collection) {
      console.warn('QuickCapture: 未找到集合', setName);
      return;
    }
    const color = collection.color;

    const htmlText = text.replace(/\n/g, '<br>\n');

    const spanHtml = `<span class="BetterNotes-hash-span" style="color:${color}" data-hash="${hash}">${htmlText}</span>`;

    // 获取编辑器
    const mdView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = mdView?.editor;

    if (editor) {
      editor.replaceSelection(spanHtml);
      // 立即失去焦点，避免继续处于编辑状态选中
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active) active.blur();
      }, 0);
    } else {
      // 无编辑器或未处于编辑模式：退化为仅创建条目
      console.warn('QuickCapture: 无法插入 span（未处于编辑模式）');
    }

    const entry = await this.plugin.createEntryWithHash(text, setName, hash, {
      comment: '',
      sourceFile: filePath,
      type: 'md',
      index: spanHtml
    });
    await this.plugin.navigateToEntryInComments(entry);

    
    // 记录
    this.recent = { text, filePath, set: setName, timestamp: Date.now() };
    
    // 清除当前选区，避免后续重复 pointerup 仍然触发
    window.getSelection()?.removeAllRanges();
  }
} 