/**
 * BackupService.ts
 * ----------------
 * 备份服务，负责将数据备份到单一压缩包中并进行版本控制。
 */

import { App, Notice } from 'obsidian';
import JSZip from 'jszip';
import { t } from '../i18n';

/**
 * 备份服务
 * 负责插件数据的备份和恢复，所有备份版本存储在单一压缩包内。
 * 支持手动备份和自动备份两种类型，并分别管理版本数量。
 */
export class BackupService {
    private app: App;
    private pluginId: string;
    
    private backupArchiveName = '.BetterNotes_backups.zip';
    
    // Regex to match both manual (data_<ts>.json) and auto (data_auto_<ts>.json) backups
    private manualBackupRegex = /^data_(\d{14})\.json$/;
    private autoBackupRegex = /^data_auto_(\d{14})\.json$/;
    
    private maxManualBackups = 10;
    private maxAutoBackups = 24;

    /**
     * 构造函数
     * @param app Obsidian 应用实例
     * @param pluginId 插件 ID
     */
    constructor(app: App, pluginId: string) {
        this.app = app;
        this.pluginId = pluginId;
    }

    /**
     * 获取插件数据文件路径
     * @returns 插件数据文件路径
     */
    private getPluginDataPath(): string {
        return `${this.app.vault.configDir}/plugins/${this.pluginId}/data.json`;
    }

    /**
     * 获取备份压缩包的路径
     * @returns 备份压缩包的路径
     */
    private getBackupArchivePath(): string {
        return this.backupArchiveName;
    }

    /**
     * 生成当前时间的格式化字符串
     * @returns YYYYMMDDHHmmss 格式的时间戳
     */
    private getCurrentTimestamp(): string {
        const now = new Date();
        const Y = now.getFullYear();
        const M = String(now.getMonth() + 1).padStart(2, '0');
        const D = String(now.getDate()).padStart(2, '0');
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        return `${Y}${M}${D}${h}${m}${s}`;
    }

    /**
     * 核心备份逻辑。将当前数据作为新版本添加到压缩包中。
     * @param isAuto - 标记是否为自动备份
     * @returns 是否备份成功
     */
    private async performBackup(isAuto: boolean): Promise<boolean> {
        try {
            const dataPath = this.getPluginDataPath();
            if (!(await this.app.vault.adapter.exists(dataPath))) {
                if (!isAuto) new Notice(t('backup failed') + ': ' + t('source data file data.json does not exist'));
                console.error('[BetterNotes] 备份失败: 源数据文件 data.json 不存在');
                return false;
            }

            const content = await this.app.vault.adapter.read(dataPath);
            const timestamp = this.getCurrentTimestamp();
            const archivePath = this.getBackupArchivePath();

            let zip: JSZip;
            try {
                const existingZipBuffer = await this.app.vault.adapter.readBinary(archivePath);
                zip = await JSZip.loadAsync(existingZipBuffer);
            } catch (e) {
                // 如果文件不存在或损坏，创建一个新的 zip 实例
                zip = new JSZip();
            }

            const backupRegex = isAuto ? this.autoBackupRegex : this.manualBackupRegex;
            const maxBackups = isAuto ? this.maxAutoBackups : this.maxManualBackups;

            // 修剪旧的备份
            const backupEntries = Object.keys(zip.files)
                .filter(name => backupRegex.test(name))
                .sort(); // 默认升序，最旧的在前

            if (backupEntries.length >= maxBackups) {
                const toDeleteCount = backupEntries.length - maxBackups + 1;
                for (let i = 0; i < toDeleteCount; i++) {
                    zip.remove(backupEntries[i]);
                }
            }

            // 添加新的备份条目
            const newBackupFilename = `data_${isAuto ? 'auto_' : ''}${timestamp}.json`;
            zip.file(newBackupFilename, content);

            const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
            await this.app.vault.adapter.writeBinary(archivePath, zipBuffer);

            if (!isAuto) {
                new Notice(t('backup success') + ': ' + archivePath);
            }
            //console.log(`[BetterNotes] ${isAuto ? '自动' : '手动'}备份成功: ${newBackupFilename}`);
            return true;
        } catch (error) {
            console.error(`[BetterNotes] ${isAuto ? '自动' : '手动'}备份失败:`, error);
            if (!isAuto) new Notice(t('backup failed'));
            return false;
        }
    }

    /**
     * 执行手动备份操作。
     * @returns 是否备份成功
     */
    public async backupData(): Promise<boolean> {
        return this.performBackup(false);
    }

    /**
     * 执行自动备份操作。
     * @returns 是否备份成功
     */
    public async automaticBackup(): Promise<boolean> {
        return this.performBackup(true);
    }

    /**
     * 列出备份压缩包中所有可用的备份版本。
     * @returns Promise<string[]> 一个按时间降序排列的备份条目名称列表。
     */
    public async listBackups(): Promise<string[]> {
        const archivePath = this.getBackupArchivePath();
        if (!(await this.app.vault.adapter.exists(archivePath))) {
            return [];
        }

        const zipBuffer = await this.app.vault.adapter.readBinary(archivePath);
        const zip = await JSZip.loadAsync(zipBuffer);

        const backupEntries = Object.keys(zip.files)
            .filter(name => this.manualBackupRegex.test(name) || this.autoBackupRegex.test(name))
            .sort()
            .reverse();

        return backupEntries;
    }

    /**
     * 从备份压缩包中恢复指定版本的数据。
     * @param backupEntryName 要恢复的备份条目的完整文件名 (e.g., "data_20231027103000.json")。
     * @returns 是否恢复成功
     */
    public async restoreBackup(backupEntryName: string): Promise<boolean> {
        try {
            const archivePath = this.getBackupArchivePath();
            if (!(await this.app.vault.adapter.exists(archivePath))) {
                new Notice(t('restore failed') + ': ' + t('backup file does not exist'));
                return false;
            }

            const zipBuffer = await this.app.vault.adapter.readBinary(archivePath);
            const zip = await JSZip.loadAsync(zipBuffer);

            const dataFile = zip.file(backupEntryName);
            if (!dataFile) {
                new Notice(t('restore failed') + ': ' + t('backup file does not contain the version') + ' ' + backupEntryName);
                return false;
            }

            const content = await dataFile.async('string');

            try {
                JSON.parse(content);
            } catch (e) {
                new Notice(t('restore failed') + ': ' + t('backup file does not contain the version') + ' ' + backupEntryName);
                return false;
            }

            const dataPath = this.getPluginDataPath();
            await this.app.vault.adapter.write(dataPath, content);

            new Notice(t('restore success') + ': ' + backupEntryName + ', ' + t('please restart Obsidian to apply changes'));
            return true;
        } catch (error) {
            console.error('[BetterNotes] 恢复数据失败:', error);
            new Notice(t('restore failed'));
            return false;
        }
    }
} 