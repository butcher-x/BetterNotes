import { Notice, requestUrl } from 'obsidian';
import { ServerNotificationModal } from '../components/ServerNotificationModal';
import { t } from '../i18n';

export interface ServerNotification {
  title: string;
  content: string;
  published_at: string;
}

/**
 * NotificationService
 * --------------------------------------------------
 * 负责从服务器获取最新的通知消息，并在插件启动时显示
 * 实现了防止重复提示的功能，只有新的通知才会显示
 */
export class NotificationService {
  private readonly API_ENDPOINT = 'https://www.butcher-x.com/notifications/get_notification.php';
  private lastNotificationTimestamp: string | null = null;
  private pluginVersion: string;

  /**
   * 创建通知服务
   * @param pluginVersion 插件当前版本号
   * @param lastNotificationTimestamp 上次显示的通知时间戳(如果有)
   */
  constructor(pluginVersion: string, lastNotificationTimestamp?: string) {
    this.pluginVersion = pluginVersion;
    this.lastNotificationTimestamp = lastNotificationTimestamp || null;
  }

  /**
   * 从服务器检查并获取通知
   * 只有当通知是新的（基于时间戳比较）才会显示
   * @returns Promise<ServerNotification|null> 如果有新通知则返回通知对象，否则返回null
   */
  public async checkForNotifications(): Promise<ServerNotification | null> {
    try {
      // 构建请求URL
      const url = `${this.API_ENDPOINT}?version=${encodeURIComponent(this.pluginVersion)}`;
      
      // 发送请求
      const response = await requestUrl({
        url,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });

      // 检查请求是否成功
      if (response.status !== 200) {
        console.error(`[BetterNotes] 获取通知失败: ${response.status}`);
        return null;
      }

      // 解析返回的JSON
      const notification = response.json;
      
      // 如果没有通知(空对象)，直接返回null
      if (!notification || !notification.title) {
        //console.log(response);
        //console.log('[BetterNotes] 没有新通知');
        return null;
      }

      // 检查是否为新通知(基于时间戳比较)
      if (this.lastNotificationTimestamp && 
          notification.published_at <= this.lastNotificationTimestamp) {
        //console.log('[BetterNotes] 通知已读过，不再显示');
        return null;
      }

      // 更新本地的最后通知时间戳
      this.lastNotificationTimestamp = notification.published_at;
      
      // 返回通知对象
      return notification as ServerNotification;
    } catch (error) {
      console.error('[BetterNotes] 获取通知出错:', error);
      return null;
    }
  }

  /**
   * 获取上次显示的通知时间戳
   * @returns 上次通知的时间戳
   */
  public getLastNotificationTimestamp(): string | null {
    return this.lastNotificationTimestamp;
  }

  /**
   * 显示通知给用户
   * @param notification 要显示的通知对象
   */
  public displayNotification(notification: ServerNotification): void {
    // 使用自定义模态框显示通知正文（不含标题）
    new ServerNotificationModal((window as any).app || (window as any).BetterNotes?.app || (document as any).app || (this as any).app, notification.content).open();

    // 控制台仍打印内容，方便调试
    //console.log(`[BetterNotes] server notification: ${notification.title}\n${notification.content}`);
  }
} 