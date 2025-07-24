import { App, TFile, Notice } from 'obsidian';
import { generateHash } from '../utils/utils';
import { t } from '../i18n';

/**
 * 附件服务类
 * 用于处理图片粘贴和保存到Obsidian附件文件夹
 */
export class AttachmentService {
    private app: App;
    
    /**
     * 构造函数
     * @param app Obsidian应用实例
     */
    constructor(app: App) {
        this.app = app;
    }
    
    /**
     * 获取附件文件夹路径
     * @returns 附件文件夹路径，如果未设置则返回根目录
     */
    public getAttachmentFolderPath(): string {
        // 尝试获取Obsidian配置的附件文件夹路径
        // 使用app.vault.configDir访问配置目录
        let basePath = '';
        
        try {
            // 从应用设置中获取附件文件夹路径
            // @ts-ignore - 访问私有API
            basePath = this.app.vault.config?.attachmentFolderPath || '';
        } catch (error) {
            console.error('无法获取附件文件夹路径:', error);
            basePath = '';
        }
        
        // 如果未设置或为空，则返回根目录
        if (!basePath || basePath === '/' || basePath === './' || basePath === '.') {
            return '/';
        }
        
        // 确保路径以斜杠开头
        return basePath.startsWith('/') ? basePath : `/${basePath}`;
    }
    
    /**
     * 处理粘贴的图片数据
     * @param event 剪贴板事件
     * @returns Promise<string[]> 保存的图片路径数组
     */
    public async handlePastedImages(event: ClipboardEvent): Promise<string[]> {
        const savedPaths: string[] = [];
        
        if (!event.clipboardData) {
            return savedPaths;
        }
        
        // 获取剪贴板中的文件
        const files = Array.from(event.clipboardData.files);
        
        // 过滤出图片文件
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
            return savedPaths;
        }
        
        // 获取附件文件夹路径
        const attachmentFolderPath = this.getAttachmentFolderPath();
        
        // 处理每个图片文件
        for (const file of imageFiles) {
            try {
                // 生成唯一文件名
                const fileExt = this.getFileExtFromMimeType(file.type);
                const fileName = `pasted-image-${generateHash()}-back${fileExt}`;
                
                // 构建完整的文件路径
                const filePath = attachmentFolderPath === '/' 
                    ? fileName 
                    : `${attachmentFolderPath}/${fileName}`;
                
                // 确保附件文件夹存在
                await this.ensureFolderExists(attachmentFolderPath);
                
                // 读取文件内容
                const buffer = await file.arrayBuffer();
                
                // 保存文件到vault
                await this.app.vault.createBinary(filePath, buffer);
                
                // 添加到保存路径列表
                savedPaths.push(filePath);
            } catch (error) {
                console.error('保存粘贴的图片失败:', error);
                new Notice(t('save image failed') + ': ' + error.message);
            }
        }
        
        return savedPaths;
    }
    
    /**
     * 确保文件夹存在，如果不存在则创建
     * @param folderPath 文件夹路径
     */
    private async ensureFolderExists(folderPath: string): Promise<void> {
        // 如果是根目录或文件夹已存在，则不需要创建
        if (folderPath === '/' || await this.app.vault.adapter.exists(folderPath)) {
            return;
        }
        
        try {
            // 创建文件夹
            await this.app.vault.createFolder(folderPath);
        } catch (error) {
            // 如果错误是因为文件夹已存在，则忽略
            if (!error.message.includes('already exists')) {
                throw error;
            }
        }
    }
    
    /**
     * 根据MIME类型获取文件扩展名
     * @param mimeType MIME类型
     * @returns 文件扩展名（带点）
     */
    private getFileExtFromMimeType(mimeType: string): string {
        const mimeToExt: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/svg+xml': '.svg',
            'image/bmp': '.bmp',
            'image/tiff': '.tiff'
        };
        
        return mimeToExt[mimeType] || '.png';
    }

    /**
     * 将任意二进制数据保存到用户配置的附件目录。
     *
     * 1. 自动解析 Obsidian 配置中的 `attachmentFolderPath`；
     * 2. 若目录不存在则自动创建；
     * 3. 最终返回相对 Vault 根目录的保存路径，供 Markdown 引用。
     *
     * @param fileName   文件名（不含目录）。由调用方负责保证其合法性和唯一性。
     * @param data       文件内容的 ArrayBuffer。
     * @returns          保存后的相对路径，例如 `assets/img.png` 或 `img.png`。
     */
    public async saveBinaryAttachment(fileName: string, data: ArrayBuffer): Promise<string> {
        if (!fileName) throw new Error('fileName is required');

        const attachmentFolderPath = this.getAttachmentFolderPath();
        const targetPath = attachmentFolderPath === '/' ? fileName : `${attachmentFolderPath}/${fileName}`;

        // 确保文件夹存在
        await this.ensureFolderExists(attachmentFolderPath);

        await this.app.vault.createBinary(targetPath, data);
        return targetPath;
    }
} 