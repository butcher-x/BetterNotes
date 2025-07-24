import { Modal } from 'obsidian';
import { t } from '../i18n';

/**
 * ServerNotificationModal
 * -------------------------------------------------
 * 简单模态框，用于展示服务器推送的通知内容（纯 HTML）。
 * 只负责视觉呈现，不承担任何业务逻辑。
 */
export class ServerNotificationModal extends Modal {
  /** 通知正文（已排除标题） */
  private readonly htmlContent: string;

  /**
   * @param app  Obsidian App
   * @param htmlContent 来自服务器的 html 字符串（不含标题）
   */
  constructor(app: any, htmlContent: string) {
    super(app);
    this.htmlContent = htmlContent;
  }

  /** 渲染模态框内容 */
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.classList.add('BetterNotes-server-notification');

    // 容器滚动以兼容长内容
    const wrapper = contentEl.createDiv({ cls: 'sn-notification-wrapper' });
    wrapper.innerHTML = this.htmlContent;
  }

  onClose(): void {
    this.contentEl.empty();
  }
} 