/**
 * SettingsManager.ts
 * ----------------
 * 设置管理器，负责：
 * 1. 处理插件配置
 * 2. 管理预设提示词(Preset)
 * 3. 保存和加载data.json文件
 */

import { App, Notice } from 'obsidian';
import { Preset } from '../models/Preset';
import * as path from 'path';
import { t } from '../i18n';
/**
 * 设置数据接口
 */
interface SettingsData {
  /** 预设提示词列表 */
  presets: Preset[];
  /** 应用设置 */
  settings: any;
}

/**
 * 设置管理器
 * 负责管理插件设置和预设提示词
 */
export class SettingsManager {
  /** Obsidian应用实例 */
  private app: App;
  /** 插件ID */
  private pluginId: string;
  /** 预设提示词映射 */
  private presets: Map<string, Preset> = new Map();
  /** 应用设置 */
  private settings: any = {};
  
  /**
   * 构造函数
   * @param app Obsidian应用实例
   * @param pluginId 插件ID
   */
  constructor(app: App, pluginId: string) {
    this.app = app;
    this.pluginId = pluginId;
  }
  
  /**
   * 获取设置文件路径
   * @returns 完整的设置文件路径
   */
  private getSettingsFilePath(): string {
    return `${this.app.vault.configDir}/plugins/${this.pluginId}/data.json`;
  }
  
  /**
   * 加载设置和预设
   * @returns 是否加载成功
   */
  async loadSettings(): Promise<boolean> {
    try {
      const filePath = this.getSettingsFilePath();
      if (!(await this.app.vault.adapter.exists(filePath))) {
        //console.log('[设置] 设置文件不存在，使用默认设置');
        return false;
      }
      
      const content = await this.app.vault.adapter.read(filePath);
      const data: SettingsData = JSON.parse(content);
      
      // 加载预设提示词
      this.presets.clear();
      if (Array.isArray(data.presets)) {
        data.presets.forEach(p => this.presets.set(p.label, p));
      }
      
      // 加载其他设置
      this.settings = data.settings || {};
      
      //console.log('[设置] 设置和预设已加载');
      return true;
    } catch (error) {
      console.error('[设置] 加载设置失败:', error);
      new Notice(t('load settings failed'));
      return false;
    }
  }
  
  /**
   * 保存设置和预设
   * @returns 是否保存成功
   */
  async saveSettings(): Promise<boolean> {
    try {
      const filePath = this.getSettingsFilePath();
      const dirPath = path.dirname(filePath);
      
      // 确保目录存在
      try {
        const adapter = this.app.vault.adapter;
        const exists = await adapter.exists(dirPath);
        
        if (!exists) {
          //console.log(`[设置] 创建目录: ${dirPath}`);
          await adapter.mkdir(dirPath);
        }
      } catch (error) {
        console.error(`[设置] 创建目录失败: ${dirPath}`, error);
      }
      
      // 构建数据
      const data: SettingsData = {
        presets: Array.from(this.presets.values()),
        settings: this.settings
      };
      
      await this.app.vault.adapter.write(
        filePath, 
        JSON.stringify(data, null, 2)
      );
      
      //console.log('[设置] 设置和预设已保存');
      return true;
    } catch (error) {
      console.error('[设置] 保存设置失败:', error);
      new Notice(t('save settings failed'));
      return false;
    }
  }
  
  /**
   * 获取所有预设提示词
   * @returns 预设提示词数组
   */
  getAllPresets(): Preset[] {
    return Array.from(this.presets.values());
  }
  
  /**
   * 获取特定预设提示词
   * @param label 预设标签
   * @returns 预设提示词或undefined
   */
  getPreset(label: string): Preset | undefined {
    return this.presets.get(label);
  }
  
  /**
   * 添加或更新预设提示词
   * @param label 预设标签
   * @param prompt 提示内容
   */
  upsertPreset(label: string, prompt: string): void {
    this.presets.set(label, { label, prompt });
  }
  
  /**
   * 删除预设提示词
   * @param label 预设标签
   * @returns 是否删除成功
   */
  deletePreset(label: string): boolean {
    return this.presets.delete(label);
  }
  
  /**
   * 获取特定设置
   * @param key 设置键
   * @param defaultValue 默认值
   * @returns 设置值或默认值
   */
  getSetting<T>(key: string, defaultValue: T): T {
    return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
  }
  
  /**
   * 设置特定设置
   * @param key 设置键
   * @param value 设置值
   */
  setSetting(key: string, value: any): void {
    this.settings[key] = value;
  }
} 