import { around } from 'monkey-around';
import { App, Editor, MarkdownView, Notice, TFile } from 'obsidian';
import BetterNotesPlugin from '../main';
import { t } from '../i18n';
import { VIDEO_VIEW_TYPE, VideoView } from './video/view';
import { pathToFileURL } from 'url';



/**
 * OpenLinkService
 * --------------------------------------------------
 * 处理视频链接和条目哈希链接的拦截与处理服务
 * 
 * 功能：
 * 1. 拦截格式为 [filepath#video='url'&timestamp=time] 的链接对拦截到的链接进行处理，如打开视频并跳转到指定时间点
 * 2. 拦截格式为 [filepath#hash='xxx'] 的链接，用于导航到MD文件中的条目位置
 */
export class OpenLinkService {
    private isPatched = false;
    
    /**
     * 构造函数
     * @param app Obsidian App 实例
     * @param plugin BetterNotes 插件实例
     */
    constructor(private app: App, private plugin: BetterNotesPlugin) {
        this.patchOpenLinkText();
        this.addHighlightStyle();
    }
    
    /**
     * 对 Workspace.prototype.openLinkText 进行补丁，拦截视频链接和哈希链接
     */
    private patchOpenLinkText(): void {
        if (this.isPatched) return;
        
        const self = this; // 保存 this 引用，以便在闭包中使用
        
        // 使用 monkey-around 对 openLinkText 方法进行劫持
        const openLinkpatch = around(this.app.workspace.constructor.prototype, {
            openLinkText(old) {
                return function (linktext: string, sourcePath: string, newLeaf?: boolean, openViewState?: any) {
                    // 检测视频链接格式: filepath#video='url'&timestamp=time
                    const videoMatch = linktext.match(/(.+)?#video=(['"])(.+?)\2(?:&timestamp=(\d+(?:\.\d+)?))?/);
                    
                    if (videoMatch) {
                        // 提取匹配组
                        const [, filepath, , videoUrl, timestamp] = videoMatch;
                        
                        console.warn(`BetterNotes: 拦截到视频链接 [${filepath}] 视频: ${videoUrl}, 时间点: ${timestamp || 'N/A'}`);
                        
                        // 调用服务的处理方法
                        self.handleVideoLink(filepath, videoUrl, timestamp);
                        return;
                    }
                    
                    // 检测哈希链接格式: filepath#hash='xxx'
                    const hashMatch = linktext.match(/(.+)?#hash=(['"])(.+?)\2/);
                    
                    if (hashMatch) {
                        // 提取匹配组
                        const [, filepath, , hash] = hashMatch;
                        
                        console.warn(`BetterNotes: 拦截到哈希链接 [${filepath}] 哈希: ${hash}`);
                        
                        // 调用服务的处理方法
                        self.handleHashLink(filepath, hash);
                        return;
                    }
                    
                    // 不是特殊链接，使用原始方法处理
                    return old.call(this, linktext, sourcePath, newLeaf, openViewState);
                };
            }
        });
        
        // 注册清理函数，在插件卸载时恢复原始函数
        this.plugin.register(openLinkpatch);
        
        this.isPatched = true;
        //console.log('OpenLinkService: openLinkText 补丁已应用');
    }
    
    /**
     * 添加高亮样式到文档
     * 创建一个用于闪烁高亮效果的CSS类
     */
    private addHighlightStyle(): void {
        // 检查样式是否已存在
        if (document.getElementById('BetterNotes-highlight-style')) {
            return;
        }
        
        // 创建样式元素
        const styleEl = document.createElement('style');
        styleEl.id = 'BetterNotes-highlight-style';
        
        // 定义闪烁高亮动画
        const css = `
            @keyframes BetterNotes-flash {
                0% { background-color: rgba(255, 255, 0, 0.7); }
                100% { background-color: rgba(255, 255, 0, 0); }
            }
            
            .BetterNotes-flash-highlight {
                background-color: rgba(255, 255, 0, 0);
                animation: BetterNotes-flash 2000ms ease-out;
            }
        `;
        
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
        
        //console.log('OpenLinkService: 添加高亮样式');
    }
    
    /**
     * 处理哈希链接，导航到带有指定hash的span标签
     * @param filepath 文件路径
     * @param hash 条目哈希值
     * @returns 处理是否成功
     */
    public async handleHashLink(filepath: string, hash: string): Promise<boolean> {
        try {
            //console.log(`开始处理哈希链接 - 文件: ${filepath || '未指定'}, 哈希: ${hash}`);
            
            // 检查参数
            if (!filepath) {
                new Notice(t('no file path specified'));
                return false;
            }
            
            if (!hash) {
                new Notice(t('no hash value specified'));
                return false;
            }
            
            // 获取文件对象
            const file = this.app.vault.getAbstractFileByPath(filepath);
            if (!file || !(file instanceof TFile)) {
                new Notice(t('file not found') + ': ' + filepath);
                return false;
            }
            
            // 打开文件
            await this.app.workspace.openLinkText('', filepath, false);
            
            // 获取当前活动叶子（标签页）
            const activeLeaf = this.app.workspace.getLeaf();
            if (!activeLeaf) {
                new Notice(t('cannot get active editor'));
                return false;
            }
            
            // 获取文件视图
            const view = activeLeaf.view;
            if (!(view instanceof MarkdownView)) {
                new Notice(t('current view is not markdown view'));
                return false;
            }
            
            // 切换到编辑模式
            if (view.getMode() !== 'source') {
                await view.setState({ ...view.getState(), mode: 'source' }, { history: false });
                //console.log('已将视图切换到编辑模式');
            }
            
            // 获取编辑器
            const editor = view.editor;
            
            // 查找包含此hash的span标签位置
            const position = await this.findHashPosition(editor, hash);
            
            if (!position) {
                new Notice(t('entry not found') + ': ' + hash);
                return false;
            }
            
            // 滚动到文本位置
            editor.scrollIntoView({
                from: position.from,
                to: position.to
            }, true);
            
            // 立即失去焦点，避免继续处于编辑状态选中
            const active = document.activeElement as HTMLElement | null;
            if (active) active.blur();
            
            // 添加高亮效果
            setTimeout(() => {
                this.highlightEntrySpan(hash);
            }, 200);
            
            return true;
            
        } catch (error) {
            console.error('处理哈希链接时出错:', error);
            new Notice(t('hash link processing failed'));
            return false;
        }
    }
    
    /**
     * 在编辑器中查找带有特定hash的span标签的位置
     * @param editor 编辑器实例
     * @param hash 条目哈希值
     * @returns 文本位置，如果未找到则返回null
     */
    private findHashPosition(editor: Editor, hash: string): {from: {line: number, ch: number}, to: {line: number, ch: number}} | null {
        // 获取文档内容
        const content = editor.getValue();
        
        // 查找包含此hash的span标签，不关心其内部内容
        const regex = new RegExp(`<span[^>]*data-hash="${hash}"[^>]*>`);
        const match = regex.exec(content);
        
        if (!match) {
            // 如果没有找到匹配的span标签
            return null;
        }
        
        // 找到span标签的位置
        const matchIndex = match.index;
        
        // 计算行号和列号
        let lineCount = 0;
        let charCount = 0;
        
        for (let i = 0; i < matchIndex; i++) {
            if (content[i] === '\n') {
                lineCount++;
                charCount = 0;
            } else {
                charCount++;
            }
        }
        
        // 返回位置信息
        return {
            from: { line: lineCount, ch: charCount },
            to: { line: lineCount, ch: charCount + match[0].length }
        };
    }
    
    /**
     * 高亮显示带有特定hash的span元素
     * @param hash 条目的哈希值
     */
    private highlightEntrySpan(hash: string): void {
        // 查找对应的span元素
        const spans = document.querySelectorAll(`span[data-hash="${hash}"]`);
        
        if (spans.length === 0) {
            //console.log(`未找到Hash为 ${hash} 的span元素`);
            return;
        }
        
        // 为所有匹配的span添加高亮效果
        spans.forEach(span => {
            // 添加高亮类
            span.classList.add('BetterNotes-flash-highlight');
            
            // 一段时间后移除高亮类
            setTimeout(() => {
                span.classList.remove('BetterNotes-flash-highlight');
            }, 2000); // 高亮持续2秒
        });
    }
    
    /**
     * 处理视频链接
     * @param filepath 文件路径
     * @param videoUrl 视频URL
     * @param timestamp 时间戳（秒），支持小数形式（如18.08秒）
     * @returns 处理是否成功
     */
    public async handleVideoLink(filepath: string, videoUrl: string, timestamp?: string): Promise<boolean> {
        try {
            //console.log('[BetterNotes] handleVideoLink', filepath, videoUrl, timestamp);

            // -------- 参数解析 --------
            if (!videoUrl) {
                new Notice(t('no video url specified'));
                return false;
            }

            // 统一解析出本地文件绝对路径（去掉 file:// 协议并 decode）
            let filePath = videoUrl;
            if (videoUrl.startsWith('file://')) {
                filePath = decodeURIComponent(videoUrl.replace('file://', ''));
            }

            // -------- 复用已打开的 VideoView --------
            const leaves = this.app.workspace.getLeavesOfType(VIDEO_VIEW_TYPE);
            const existing = leaves.find((leaf) => {
                const v = leaf.view as VideoView;
                const st: any = v.getState();
                return st?.filePath === filePath;
            });

            if (existing) {
                // 直接激活已有标签页
                this.app.workspace.revealLeaf(existing);
                this.app.workspace.setActiveLeaf(existing);
                //console.log('[BetterNotes] Reused existing VideoView');
                // -------- Seek if needed --------
                if (timestamp) {
                    const seek = parseFloat(timestamp);
                    if (!Number.isNaN(seek)) {
                        (existing.view as VideoView).seekTo(seek);
                    }
                }
                return true;
            }

            // -------- 创建新的 VideoView --------
            const leaf = this.app.workspace.getLeaf(true);

            // 确保是 file:// URL
            const ensuredUrl = videoUrl.startsWith('file://') ? videoUrl : pathToFileURL(filePath).href;

            await leaf.setViewState({
                type: VIDEO_VIEW_TYPE,
                active: true,
                state: {
                    fileUrl: ensuredUrl,
                    filePath: filePath
                }
            });
            this.app.workspace.revealLeaf(leaf);
            //console.log('[BetterNotes] Opened new VideoView');

            // -------- Seek if needed --------
            if (timestamp) {
                const seek = parseFloat(timestamp);
                if (!Number.isNaN(seek)) {
                    (leaf.view as VideoView).seekTo(seek);
                }
            }
            return true;
        } catch (error) {
            console.error('处理视频链接时出错:', error);
            new Notice(t('video link processing failed'));
            return false;
        }
    }
    
   
} 