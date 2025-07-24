import { App, Modal, Setting } from 'obsidian';
import { BackupService } from '../services/BackupService';
import { t } from '../i18n';
/**
 * 一个用于选择特定备份版本进行恢复的模态框。
 */
export class BackupRestoreModal extends Modal {
    private backupService: BackupService;
    private backups: string[] = [];

    /**
     * 构造函数
     * @param app Obsidian 应用实例
     * @param backupService 备份服务实例
     */
    constructor(app: App, backupService: BackupService) {
        super(app);
        this.backupService = backupService;
        this.modalEl.addClass('BetterNotes-backup-modal');
    }

    /**
     * 当模态框打开时调用。
     * 获取备份列表并渲染它们。
     */
    async onOpen() {
        this.contentEl.empty();

        this.backups = await this.backupService.listBackups();

        if (this.backups.length === 0) {
            this.contentEl.createEl('p', { text: t('no backups found') });
            return;
        }
        
        const listEl = this.contentEl.createEl('div', { cls: 'BetterNotes-backup-list' });

        this.backups.forEach(backupName => {
            const isAuto = backupName.includes('_auto_');
            const match = backupName.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
            let displayTime = backupName;
            if (match) {
                displayTime = `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
            }

            const setting = new Setting(listEl)
                .setName(displayTime)
                .addButton(button => {
                    button
                        .setButtonText(t('restore'))
                        .setWarning()
                        .onClick(async () => {
                            if (confirm(t('confirm restore') + '\n\n' + displayTime + ' (' + (isAuto ? t('auto') : t('manual')) + ')\n\n' + t('this will overwrite all data and cannot be undone'))) {
                                button.setDisabled(true).setButtonText('恢复中...');
                                const success = await this.backupService.restoreBackup(backupName);
                                if (success) {
                                    this.close();
                                } else {
                                    button.setDisabled(false).setButtonText(t('restore'));
                                }
                            }
                        });
                });
            
            
        });
    }

    /**
     * 当模态框关闭时调用。
     */
    onClose() {
        this.contentEl.empty();
    }
} 