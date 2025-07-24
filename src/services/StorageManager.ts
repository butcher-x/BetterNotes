import { App, Notice } from 'obsidian';
import { Collection } from '../models/Collection';
import { Entry } from '../models/Entry';
import { Preset } from '../models/Preset';
import { DataManager } from './DataManager';
import * as path from 'path';
import { t } from '../i18n';
/**
 * 存储管理器
 * 负责将集合和条目数据持久化到磁盘，以及从磁盘恢复数据
 * 遵循Obsidian插件规范，使用插件文件夹中的data.json
 */
export class StorageManager {
    private app: App;
    private dataManager: DataManager;
    private pluginId: string;
    
    /**
     * 构造函数
     * @param app Obsidian应用实例
     * @param dataManager 数据管理器实例
     * @param pluginId 插件ID
     */
    constructor(app: App, dataManager: DataManager, pluginId: string) {
        this.app = app;
        this.dataManager = dataManager;
        this.pluginId = pluginId;
    }
    
    /**
     * 获取数据文件路径
     * @returns 完整的数据文件路径
     */
    private getStorageFilePath(): string {
        return `${this.app.vault.configDir}/plugins/${this.pluginId}/data.json`;
    }
    
    /**
     * 确保目录存在
     * @param dirPath 目录路径
     */
    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            const exists = await adapter.exists(dirPath);
            
            if (!exists) {
                //console.log(`创建目录: ${dirPath}`);
                await adapter.mkdir(dirPath);
            }
        } catch (error) {
            console.error(`创建目录失败: ${dirPath}`, error);
        }
    }
    
    /**
     * 保存数据到磁盘
     * @returns 是否保存成功
     */
    async saveData(settings: any): Promise<boolean> {
        /**
         * 将业务数据和插件设置一次性序列化到 data.json。
         * 仅支持新版结构：{ collections, entries, ..., settings }
         */
        try {
            const filePath = this.getStorageFilePath();
            const dirPath = path.dirname(filePath);
            
            // 确保目录存在
            await this.ensureDirectoryExists(dirPath);
            
            // 业务数据序列化
            const businessData = this.dataManager.serialize();

            const payload = {
                ...businessData,
                settings
            };
            
            await this.app.vault.adapter.write(filePath, JSON.stringify(payload, null, 2));
            
            //console.log(`数据已保存到: ${filePath}`);
            return true;
        } catch (error) {
            console.error('保存数据失败:', error);
            new Notice(t('save data failed'));
            return false;
        }
    }
    
    /**
     * 从磁盘加载数据
     * @returns 是否加载成功
     */
    async loadData(): Promise<boolean> {
        /**
         * 支持读取两种文件结构：
         * 1) 旧版（仅业务数据，无 settings）
         * 2) 新版（业务数据 + settings）
         */
        try {
            const filePath = this.getStorageFilePath();
            // 检查文件是否存在
            if (!(await this.app.vault.adapter.exists(filePath))) {
                //console.log(`数据文件不存在: ${filePath}，将在首次保存时创建`);
                return false;
            }

                const content = await this.app.vault.adapter.read(filePath);
            const parsed = JSON.parse(content);

            // 直接按新版结构反序列化
            this.dataManager.deserialize(parsed as any);

                //console.log(`数据已从 ${filePath} 加载`);
                return true;
        } catch (error) {
            console.error('加载数据失败:', error);
            new Notice(t('load data failed'));
            return false;
        }
    }
} 