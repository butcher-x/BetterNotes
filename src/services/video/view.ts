import { ItemView, WorkspaceLeaf, FileSystemAdapter } from 'obsidian';
import { CaptionSync } from './caption/CaptionSync';
import { loadSrtForVideo } from './caption/CaptionLoader';
// 本文件无需直接使用 Node.js 'url' 模块，此处引入仅为类型完整性示例，实际逻辑已在 main.ts 内完成

// Electron 的 WebviewTag 在 @types/electron 的命名空间下，不是顶层导出。
// 这里使用局部类型别名，避免编译器找不到。
type WebviewTag = HTMLElement & { src: string };

/**
 * Public minimal控制接口，供宿主端（OpenLinkService 等）调用。
 */
export interface VideoController {
    /**
     * 跳转到指定秒数（浮点）。
     * 若 WebView 端尚未 ready，则先缓存，待握手完成后再发送。
     */
    seekTo(time: number): void;
    /**
     * 截取当前视频帧。
     * @param type - 图片格式 (e.g., 'image/png')
     * @param quality - 图片质量 (0-1)
     * @returns Promise，resolve 后为截图数据，包含 ArrayBuffer、MIME type 和时间戳。
     */
    takeScreenshot(
        type?: string, quality?: number
    ): Promise<{ arrayBuffer: ArrayBuffer; type: string; time: number }>;
}

export const VIDEO_VIEW_TYPE = "mini-video-view";

export class VideoView extends ItemView implements VideoController {
    /**
     * HTML5 <video> element用于播放位于当前 Obsidian Vault 内的媒体文件。
     * 之所以只在 Vault 文件使用 <video>，是因为 Vault 文件可以通过
     * `vault.getResourcePath` 获得一个 app:// 协议的安全资源路径，
     * 直接赋给 <video>.src 即可。
     */
    videoEl: HTMLVideoElement | null = null;

    /**
     * Electron <webview> 元素用于播放 Vault 之外的本地文件。
     * 直接在普通 <video> 上设置 file:// 会被 Electron 限制，
     * 但 <webview> 拥有独立的进程与权限，可以安全加载本地资源。
     */
    webviewEl: WebviewTag | null = null;
    /** 包裹播放器的 Flex 容器 */
    wrapperEl: HTMLDivElement | null = null;
    playerHolder: HTMLDivElement | null = null;
    /** 字幕容器 */
    captionEl: HTMLDivElement | null = null;
    /** 字幕同步器 */
    captionSync: CaptionSync | null = null;

    /** MessageChannel port 用于 RPC；握手成功后赋值 */
    private activePort: MessagePort | null = null;
    private portReady = false;
    /** 若在 ready 前收到 seekTo 请求，暂存至此 */
    private pendingSeek: number | null = null;
    /** RPC 调用表，用于匹配响应 */
    private pendingRpcCalls = new Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; }>();


    /** 最近一次从 webview 收到的播放时间 */
    private lastKnownTime = 0;

    /** 最近一次播放的文件信息，用于持久化 workspace 状态 */
    private _currentFileUrl: string | null = null;
    private _currentFilePath: string | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() {
        return VIDEO_VIEW_TYPE;
    }

    getDisplayText() {
        // 从视图状态中获取文件名，显示在标签页上
        const filePath = this.getState()?.filePath as string | undefined;
        return filePath?.split('/').pop()?.split('\\').pop() || "Video";
    }

    getIcon() {
        return "play";
    }



    /** 清空播放器容器，释放已有元素 */
    private clearContainer() {
        if (this.wrapperEl) {
            this.wrapperEl.remove();
            this.wrapperEl = null;
            this.playerHolder = null;
            this.captionEl = null;
            this.captionSync = null;
        }
        if (this.videoEl) {
            this.videoEl.pause();
            this.videoEl.remove();
            this.videoEl = null;
        }
        if (this.webviewEl) {
            // 关闭 webview，释放进程资源
            this.webviewEl.src = "";
            this.webviewEl.remove();
            this.webviewEl = null;
        }
    }

    /**
     * 在容器中渲染合适的播放器（<video> 或 <webview>）。
     */
    private renderPlayer(fileUrl: string, filePath: string) {
        this.clearContainer();

        // 记录当前文件信息，供 getState() 序列化
        this._currentFileUrl = fileUrl;
        this._currentFilePath = filePath;

        // 统一使用 <webview> 渲染，无论文件是否位于 Vault
            this.ensureWrapper();
            this.webviewEl = document.createElement('webview') as WebviewTag;
            this.webviewEl.src = fileUrl;
            // 允许在未手动交互时自动播放媒体
            this.webviewEl.setAttribute('webpreferences', 'allowRunningInsecureContent=yes, autoplayPolicy=no-user-gesture-required');
            this.webviewEl.style.width = '100%';
            this.webviewEl.style.height = '100%';
            this.playerHolder!.appendChild(this.webviewEl);

        // ---------------- 加载同名字幕 ----------------
        (async () => {
            // 只设置 videoUrl，不再查找 mdPath/sourceFile
            const cues = await loadSrtForVideo(filePath);
            if (cues && this.captionEl) {
                this.captionEl.dataset.videoUrl = fileUrl;
                this.captionSync = new CaptionSync(cues, this.captionEl);
                //console.log('[MiniVideo] SRT loaded:', cues.length, 'cues');
            }
        })();

            // 注入 CSS：让内部 <video> 填充并去除黑底
            this.webviewEl.addEventListener('dom-ready', () => {
                const wv: any = this.webviewEl;
                if (wv?.insertCSS) {
                    wv.insertCSS(`
                        html, body {
                            background: transparent !important;
                            margin: 0;
                        }
                        video {
                            width: 100% !important;
                            height: 100% !important;
                            object-fit: contain !important;
                            background: transparent !important;
                        }
                    `);
                }

            if (wv?.executeJavaScript) {
                 const bootstrap = `(()=>{
   /** 等待页面出现 <video>，MutationObserver 兜底 */
   function waitVideo(){
     const v=document.querySelector('video');
     if(v) return Promise.resolve(v);
     return new Promise(r=>{
       const mo=new MutationObserver(()=>{
         const vv=document.querySelector('video');
         if(vv){mo.disconnect();r(vv);} });
       mo.observe(document,{childList:true,subtree:true});
     });
   }
 
   window.addEventListener('message',async(e)=>{
     if(e.data==='init-port'){
       const port=e.ports[0];
       if(!port) return;
       const vid=await waitVideo();
 
       // -- RPC 方法处理器 --
       const rpcHandlers={
         seek(time){
           vid.currentTime=time;
           if(vid.paused||vid.ended) vid.play().catch(()=>{});
         },
         async screenshot(type='image/png',quality=0.9){
           const canvas=document.createElement('canvas');
           canvas.width=vid.videoWidth;
           canvas.height=vid.videoHeight;
           const ctx=canvas.getContext('2d');
           if(!ctx) throw new Error('Could not get 2d context');
           ctx.drawImage(vid,0,0,canvas.width,canvas.height);
           const blob=await new Promise(r=>canvas.toBlob(r,type,quality));
           if(!blob) throw new Error('Failed to create blob from canvas');
           const arrayBuffer=await blob.arrayBuffer();
           return {
             value: { arrayBuffer, type: blob.type, time: vid.currentTime },
             transfer: [arrayBuffer]
           };
         }
       };
 
       port.onmessage=async(ev)=>{
         const d=ev.data;
         if(d?.type==='invoke' && d.id && rpcHandlers[d.method]){
           try {
             const result=await rpcHandlers[d.method](...d.args);
             if (result?.transfer) {
               port.postMessage({type:'response',id:d.id,result:result.value}, result.transfer);
             } else {
               port.postMessage({type:'response',id:d.id,result});
             }
           } catch(err){
             port.postMessage({type:'response',id:d.id,error:err.message});
           }
         }
       };
 
       // -- 事件推送 --
       vid.addEventListener('timeupdate',()=>{
         port.postMessage({type:'timeupdate',current:vid.currentTime});
       });
 
       // -- 握手 --
       port.postMessage({type:'ready'});
     }
   });
 })();`;
                wv.executeJavaScript(bootstrap, true);
            }
        });

        /* ---------------- Host ↔︎ WebView MessageChannel ---------------- */
        let ready = false;               // 是否已握手成功
        let activePort: MessagePort | null = null; // 保存已连接的 port，以便后续通信
        let attempts = 0;                // 重试计数
        const MAX_ATTEMPTS = 3;          // 最多尝试 3 次，避免无限循环

        const tryInitChannel = () => {
            if (ready || attempts >= MAX_ATTEMPTS) return;
            attempts++;

            const channel = new MessageChannel();

            // 监听 WebView 端消息：RPC 响应 或 事件推送
            channel.port1.onmessage = (ev) => {
                const data = ev.data;

                switch (data?.type) {
                    case 'ready':
                        ready = true;
                        this.portReady = true;
                        this.activePort = channel.port1;
                        // 若有待处理的 seek，立即执行
                        if (this.pendingSeek != null) {
                            this.seekTo(this.pendingSeek);
                            this.pendingSeek = null;
                        }
                        break;
                    case 'timeupdate':
                        this.lastKnownTime = data.current;
                        this.captionSync?.update(data.current);
                        break;
                    case 'response':
                        this.handleRpcResponse(data);
                        break;
                }
            };

            // 发送端口给 WebView
            try {
                const cw = (this.webviewEl as any)?.contentWindow;
                if (cw) {
                    // 将 port2 移交到 webview，建立通信
                    cw.postMessage('init-port', '*', [channel.port2]);
                } else {
                    // 若 contentWindow 不可用，则稍后重试
                    console.warn('[BetterNotes] contentWindow not available, will retry channel init.');
                }
            } catch (err) {
                console.error('[MiniVideo] postMessage failed:', err);
            }
        };

        // 初次加载完成尝试握手；若 1 秒后仍未成功则重试一次
        this.webviewEl.addEventListener('did-stop-loading', () => {
            tryInitChannel();
            setTimeout(() => { if (!ready) tryInitChannel(); }, 1000);
        });
    }

    /**
     * 创建或复用 wrapperEl：上下两栏，播放器占 50%，spacer 占 50%。
     */
    private ensureWrapper() {
        if (this.wrapperEl) return;
        this.wrapperEl = document.createElement('div');
        this.wrapperEl.style.display = 'flex';
        this.wrapperEl.style.flexDirection = 'column';
        this.wrapperEl.style.width = '100%';
        this.wrapperEl.style.height = '100%';
        this.wrapperEl.style.overflow = 'hidden';

        // playerHolder: 固定16:9，高度随宽度调整
        this.playerHolder = document.createElement('div');
        this.playerHolder.style.width = '100%';
        this.playerHolder.style.aspectRatio = '16/9';
        this.playerHolder.style.overflow = 'hidden';
        this.playerHolder.style.display = 'flex';
        this.playerHolder.style.alignItems = 'stretch';
        this.playerHolder.style.justifyContent = 'stretch';
        // 字幕容器将在 playerHolder 之后追加，不再作为其子元素

        const spacer = document.createElement('div');
        spacer.style.flex = '1 1 auto';

        this.wrapperEl.appendChild(this.playerHolder);

        // 字幕外层容器：flex 布局，文本居中，右侧固定相机按钮
        const captionWrapper = document.createElement('div');
        captionWrapper.className = 'video-caption-wrapper';
        captionWrapper.style.display = 'flex';
        captionWrapper.style.alignItems = 'center';
        captionWrapper.style.justifyContent = 'center';
        captionWrapper.style.position = 'relative';

        // 文本容器（真正被 CaptionSync 更新）
        this.captionEl = document.createElement('div');
        this.captionEl.className = 'video-caption';
        // 让文本占据剩余空间，保证相机按钮贴右侧
        this.captionEl.style.flex = '1 1 auto';

        // 相机按钮
        const camBtn = document.createElement('div');
        camBtn.className = 'video-caption-camera';
        camBtn.style.flex = '0 0 auto';
        camBtn.style.marginLeft = '12px';
        camBtn.style.marginRight = '20px';
        camBtn.style.width = '24px';
        camBtn.style.height = '24px';
        camBtn.style.cursor = 'pointer';
        camBtn.style.opacity = '0.8';
        camBtn.onmouseenter = () => camBtn.style.opacity = '1';
        camBtn.onmouseleave = () => camBtn.style.opacity = '0.8';
        // 使用 Obsidian 内置 lucide 图标
        camBtn.textContent = '📷';
        camBtn.style.fontSize = '40px';

        captionWrapper.appendChild(this.captionEl);
        captionWrapper.appendChild(camBtn);

        // -------- 相机点击事件 --------
        camBtn.onclick = async () => {
            // 若未选中集合（由 main.ts 在 setSelectionService.onChange 中写入 dataset），则忽略
            if (!document.documentElement.dataset.snCurrentColor) return;
            try {
                const { arrayBuffer, type, time } = await this.takeScreenshot();

                // 动态导入 AttachmentService 以避免循环依赖
                const { AttachmentService } = await import('../AttachmentService');
                const svc = new AttachmentService(this.app);

                // 根据视频文件名和时间戳生成文件名
                const videoName = this._currentFilePath ? this._currentFilePath.split(/[\\/]/).pop()!.split('.').shift() : 'video';
                const ext = type === 'image/jpeg' ? '.jpg' : '.png';
                const tStr = time.toFixed(2).replace(/\./, '_');
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `${videoName}_${tStr}_${ts}-front${ext}`;

                const savedPath = await svc.saveBinaryAttachment(fileName, arrayBuffer);
                //console.log('[BetterNotes] Screenshot saved:', savedPath);

                document.dispatchEvent(new CustomEvent('BetterNotes-video-screenshot-entry', {
                    detail: {
                        time,
                        videoUrl: this._currentFileUrl,
                        attachmentPath: savedPath
                    }
                }));
            } catch (e) {
                console.error('Failed to take or save screenshot:', e);
            }
        };

        this.wrapperEl.appendChild(captionWrapper);

        this.wrapperEl.appendChild(spacer);

        this.containerEl.appendChild(this.wrapperEl);
    }

    async onOpen() {
        this.containerEl.empty();
        this.containerEl.addClass('mini-video-player-container');
        // 固定容器宽高比 16:9，并裁剪溢出，避免上下黑边
        (this.containerEl as HTMLElement).style.setProperty('aspect-ratio', '16/9');
        (this.containerEl as HTMLElement).style.overflow = 'hidden';

        const state = this.getState();
        if (state?.fileUrl && state?.filePath) {
            this.renderPlayer(state.fileUrl as string, state.filePath as string);
        }

        
    }

    async setState(state: any, options: any): Promise<void> {
        if (state?.fileUrl && state?.filePath) {
            this.renderPlayer(state.fileUrl, state.filePath);
        }
        return super.setState(state, options);
    }

    /**
     * 返回需要持久化到 workspace.json 的视图状态。
     * 必须包含 fileUrl / filePath，才能在 Obsidian 重启后自动恢复播放。
     */
    getState() {
        const base = super.getState() ?? {};
        return {
            ...base,
            fileUrl: this._currentFileUrl,
            filePath: this._currentFilePath
        };
    }

    async onClose() {
        // 停止播放并清理资源
        this.clearContainer();
    }

    /**
     * 对外公开：跳转到指定播放时间（秒）。
     * @param time 目标时间（秒，可带小数）
     */
    public seekTo(time: number): void {
        if (Number.isNaN(time) || time < 0) return;

        if (this.portReady && this.activePort) {
            // 端口就绪，直接发起 RPC
            this.invokeRpc('seek', time).catch(err => console.error("Seek failed:", err));
        } else {
            // 否则暂存，等待握手完成后自动发送
            this.pendingSeek = time;
        }
    }

    /**
     * 截取当前视频帧。
     * @param type The image format (e.g., 'image/png', 'image/jpeg').
     * @param quality The image quality (0 to 1) for formats that support it.
     * @returns A promise that resolves with the screenshot data.
     */
    public async takeScreenshot(
        type: string = 'image/png',
        quality: number = 0.9
    ): Promise<{ arrayBuffer: ArrayBuffer; type: string; time: number }> {
        return this.invokeRpc('screenshot', type, quality);
    }

    /**
     * 内部 RPC 调用函数。
     * @param method WebView 端注册的方法名
     * @param args 传递给方法的参数
     */
    private invokeRpc(method: string, ...args: any[]): Promise<any> {
        if (!this.portReady || !this.activePort) {
            return Promise.reject(new Error("MessagePort not ready for RPC."));
        }
        const id = crypto.randomUUID();
        const promise = new Promise((resolve, reject) => {
            this.pendingRpcCalls.set(id, { resolve, reject });
        });

        this.activePort.postMessage({ type: 'invoke', id, method, args });
        return promise;
    }

    /**
     * 处理来自 WebView 的 RPC 响应。
     */
    private handleRpcResponse(response: { id: string, result?: any, error?: any }): void {
        const rpc = this.pendingRpcCalls.get(response.id);
        if (!rpc) return;

        if (response.error) {
            rpc.reject(new Error(response.error));
        } else {
            rpc.resolve(response.result);
        }
        this.pendingRpcCalls.delete(response.id);
    }


} 