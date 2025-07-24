import { Plugin, PluginSettingTab, App, Setting, Notice, WorkspaceLeaf, Editor, MarkdownView, TFile,debounce } from 'obsidian';
import { DataManager } from './services/DataManager';
import { StorageManager } from './services/StorageManager';
import { SidebarView } from './views/SidebarView';
import { Collection, DEFAULT_COLLECTION } from './models/Collection';
import { Entry } from './models/Entry';
import { AnnotationModal } from './components/AnnotationModal';
import { generateHash } from './utils/utils';
import { HashSpanHandler } from './services/HashSpanHandler';
import { EntryNavigation } from './services/EntryNavigation';
import { Plan } from './models/Plan';
import { PdfBacklinkHighlighter } from './services/pdf/PdfBacklinkHighlighter';
import { SetSelectionService } from './services/SetSelectionService';
import { QuickCaptureService } from './services/QuickCaptureService';
import { PdfIOService } from './services/pdf/PdfIOService';
import { PdfHighlightHandler } from './services/pdf/PdfHighlightHandler';
import { capturePdfViewerState, PdfViewerState, restorePdfViewerState } from './utils/pdfViewState';
import { PdfRectCaptureService } from './services/pdf/PdfRectCaptureService';
import { PdfViewerPatchService } from './services/pdf/PdfViewerPatchService';
import { RectHighlightManager } from './services/pdf/RectHighlightManager';
import { setupSubtitleNavigationKeys } from './services/video/caption/SubtitleSelectionManager';
import { OpenLinkService } from './services/openLinkPatch';
import { DEFAULT_LINK_TEMPLATES, LinkService, LinkTemplates } from './services/LinkService';
import { InternalLinkService } from './services/InternalLinkService';
import { FSRSParameters, DEFAULT_FSRS_PARAMETERS } from './services/fsrs/FSRSTypes';
import { FSRSService } from './services/fsrs/FSRSService';
import { AiChatService, AiServiceConfig } from './services/AiChatService';
// 设备标识符 / 激活码校验工具
import { verifyLicense } from './utils/license';
import { AiChatView, AI_CHAT_VIEW_TYPE } from './services/AI/AiChatView';
import { RagService } from './services/rag/RagService';
import { RagConfig } from './services/rag/types';


import { BackupService } from './services/BackupService';
import { BackupRestoreModal } from './components/BackupRestoreModal';
// 国际化
import { t } from './i18n';
import { registerMarkdownPreviewInterceptor } from './services/video/markdownPreview';
import { VideoView, VIDEO_VIEW_TYPE } from './services/video/view';
import { openFilePickerAndPlay } from './services/video/filePicker';
import { NotificationService } from './services/NotificationService';
import * as path from 'path';
import { pathToFileURL } from 'url';
import moment from 'moment';

export interface BetterNotesSettings {
	snippetContext: number; // 每侧上下文长度
	highlightOpacity: number; // PDF 高亮透明度 (0-1)
	linkTemplates: LinkTemplates; // 链接模板配置
	mdImmediateAnnotation: boolean; // Markdown文件选中后是否立即标注
	fsrsParams: FSRSParameters; // FSRS 全局参数
	ai: AiServiceConfig;        // AI 服务配置
	rag: RagConfig;             // RAG 嵌入设置
	activationCode?: string;    // 用户填入的激活码
	license?: string;           // 服务器返回的 license
	pdfHighlightMode: 'embedded' | 'layer'; // PDF高亮模式

	/** 上次显示通知的时间戳 */
	lastNotificationTimestamp?: string;
}

export const DEFAULT_SETTINGS: BetterNotesSettings = {
	snippetContext: 10,
	highlightOpacity: 0.5,
	linkTemplates: DEFAULT_LINK_TEMPLATES,
	mdImmediateAnnotation: false, // 默认为立即标注模式
	fsrsParams: { ...DEFAULT_FSRS_PARAMETERS },
	ai: { enabled:false, baseUrl:'', apiKey:'', model:'gpt4.1' },
	rag: { embeddingModel:'text-embedding-3-small', embeddingEndpoint:'', apiKey:'' },
	activationCode: '',
	license: '',
	pdfHighlightMode: 'embedded', // 默认内嵌高亮
	lastNotificationTimestamp: '', // 初始为空字符串，表示没有显示过通知
};

/**
 * BetterNotes主插件类
 * 负责初始化插件、管理设置和协调各模块
 */
export default class BetterNotesPlugin extends Plugin {
	dataManager: DataManager;
	storageManager: StorageManager;
	sidebarView: SidebarView | null = null;
	hashSpanHandler: HashSpanHandler;
	entryNavigation: EntryNavigation;
	settings: BetterNotesSettings;
	pdfBacklinkHighlighter: PdfBacklinkHighlighter;
	setSelectionService: SetSelectionService;
	quickCaptureService: QuickCaptureService;
	pdfHighlightHandler: PdfHighlightHandler;
	pdfRectCaptureService: PdfRectCaptureService;
	pdfViewerPatchService: PdfViewerPatchService;

	rectHighlightManager: RectHighlightManager;
	videoLinkService: OpenLinkService;
	linkService: LinkService;
	internalLinkService: InternalLinkService;
	fsrsService: FSRSService;
	aiService: AiChatService;
	aiChatView: AiChatView | null = null;
	ribbonToggleIcon?: HTMLElement;
	ragService: RagService;

	public deviceId: string = '';
	public licenseValid: boolean = false;
	// 备份服务
	public backupService: BackupService;
	// 通知服务
	public notificationService: NotificationService;
	/**
	 * Tracks the last active leaf that is NOT the sidebar.
	 * Used to display relevant comments when the sidebar itself is focused.
	 */
	public lastActiveViewLeaf: WorkspaceLeaf | null = null;
	public readonly ignoredViewTypes = [
		'BetterNotes-sidebar-view',
		'BetterNotes-ai-chat-view',
		'file-explorer',
		'search',
		'bookmarks'
	];
	
	/**
	 * 插件加载时调用
	 */
	async onload() {
		//console.log('loading plugin BetterNotes');
		const raw = await this.loadData();
 		const savedSettings = (raw as any)?.settings ?? raw;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings || {});

		// Track the last active non-sidebar leaf
		this.app.workspace.onLayoutReady(() => {
			this.lastActiveViewLeaf = this.app.workspace.activeLeaf;
			const eventRef = this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf) {
					//console.log('active-leaf-change', leaf.view.getViewType());
					if (!this.isIgnoredView(leaf.view.getViewType())) {
						this.lastActiveViewLeaf = leaf;
					}
				}
			});
			this.register(() => {
				this.app.workspace.offref(eventRef);
			});
		});
		
		// 初始化通知服务
		this.notificationService = new NotificationService(
			this.manifest.version,
			this.settings.lastNotificationTimestamp
		);
		
		// 异步检查服务器通知
		this.checkServerNotifications();

		// -------- License 逻辑 --------
		const vaultPath = this.getVaultPath();
		this.deviceId = vaultPath;
		this.licenseValid = await verifyLicense(this.settings.license || '', this.settings.activationCode || '', vaultPath);
		// 根据授权状态自动开关 AI
		this.settings.ai.enabled = this.licenseValid;

		// FSRS Service
		this.fsrsService = new FSRSService(this.settings.fsrsParams);

		// AI Service
		this.aiService = new AiChatService(this.settings.ai);

		// RAG Service
		this.ragService = new RagService(this.app, this.settings.rag);

		// 视频服务
		registerMarkdownPreviewInterceptor(this);




		// 初始化数据和存储管理器
		this.dataManager = new DataManager();
		this.storageManager = new StorageManager(this.app, this.dataManager, this.manifest.id);
		
		// 初始化备份服务
		this.backupService = new BackupService(this.app, this.manifest.id);
		
		// 注册每小时一次的自动备份任务
		this.registerInterval(
			window.setInterval(() => {
				//console.log('[BetterNotes] Running automatic backup...');
				this.backupService.automaticBackup();
			}, 60 * 60 * 1000) // 1 hour
		);
		
		// 提前创建全局 RectHighlightManager，后续流程需要
		this.rectHighlightManager = new RectHighlightManager();
		
		// 加载保存的数据
		await this.storageManager.loadData();
		
		// ---- 初始化 Rect 数据 ----
		this.initRectData();
		
		// 注册视图类型
		this.registerView(
			SidebarView.VIEW_TYPE,
			(leaf: WorkspaceLeaf) => (this.sidebarView = new SidebarView(leaf, this))
		);

		this.registerView(
			AI_CHAT_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => (this.aiChatView = new AiChatView(leaf, this))
		);

		this.registerView(VIDEO_VIEW_TYPE, (leaf) => new VideoView(leaf));

		// 监听文件重命名和移动事件，自动更新条目的 sourceFile
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			this.handleFileRename(oldPath, file.path);
		}));

		// 添加"BetterNotes"图标到右侧边栏
		this.addRibbonIcon('sparkles', 'BetterNotes', async () => {
			await this.activateSidebarView();
		});
		
		// 添加命令：打开BetterNotes侧边栏
		this.addCommand({
			id: 'open-BetterNotes-sidebar',
			name: t('open-BetterNotes-sidebar'),
			callback: async () => {
				await this.activateSidebarView();
			}
		});
		
		// 添加"AI助手"图标到右侧边栏
		this.addRibbonIcon('bot', t('AI assistant'), async () => {
			await this.activateAiChatView();
		});

		// 添加命令：打开AI聊天侧边栏
		this.addCommand({
			id: 'open-ai-chat-sidebar',
			name: t('open-ai-chat-sidebar'),
			callback: async () => {
				await this.activateAiChatView();
			}
		});

		// 快捷开关：Markdown 即时标注
		const toggleIcon = this.addRibbonIcon('wand-2', t('toggle-md-immediate-annotation'), () => {
			this.toggleImmediateAnnotation();
		});
		toggleIcon.addClass('BetterNotes-toggle-ann');
		if (this.settings.mdImmediateAnnotation) toggleIcon.addClass('is-active');
		this.ribbonToggleIcon = toggleIcon;

		// 添加"播放本地视频"图标到左侧边栏
		this.addRibbonIcon('play', t('open local video'), async () => {
			await openFilePickerAndPlay(this);
		});

		// 快捷键命令：切换即时标注
		this.addCommand({
			id: 'toggle-md-immediate-annotation',
			name: t('toggle-md-immediate-annotation'),
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'm' }],
			callback: () => this.toggleImmediateAnnotation(),
		});

		// ---------- RAG 索引命令 ----------
		this.addCommand({
			id: 'index-vault',
			name: t('index-vault'),
			callback: async () => {
				await this.ragService.indexVault();
			},
		});

		this.addCommand({
			id: 'reindex-vault',
			name: t('reindex-vault'),	
			callback: async () => {
				await this.ragService.indexVault(true);
			},
		});
		
		this.addCommand({
			id: 'index-notes',
			name: t('index-notes'),
			callback: async () => {
				await this.ragService.indexNotes(this.dataManager)
			},
		})

		this.addCommand({
			id: 'reindex-notes',
			name: t('reindex-notes'),
			callback: async () => {
				await this.ragService.indexNotes(this.dataManager, true)
			},
		})
		
		// 添加命令：取消内部链接操作
		this.addCommand({
			id: 'cancel-internal-linking',
			name: t('cancel-internal-linking'),
			callback: () => {
				if (this.internalLinkService.isInLinkingMode()) {
					this.internalLinkService.cancelLinking();
					return true;
				}
				return false;
			}
		});

		// 添加命令：PDF 矩形截取
	this.addCommand({
		id: 'capture-pdf-rectangle',
		name: t('capture-pdf-rectangle'),
		callback: () => this.pdfRectCaptureService.startCapture(),
		hotkeys: [
			{
				modifiers: ['Mod', 'Shift'],
				key: 'r'
			}
		]
	});

	this.addCommand({
		id: 'open-local-file-picker',
		name: 'Open Local File Picker',
		hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'o' }],
		callback: () => openFilePickerAndPlay(this)
	});

		// 添加插件设置面板
		this.addSettingTab(new BetterNotesSettingTab(this.app, this));
		
		// 初始化样式
		this.loadStyles();
		
		// 初始化Hash Span处理器
		this.hashSpanHandler = new HashSpanHandler(this.app, this);
		
		// 初始化条目导航服务
		this.entryNavigation = new EntryNavigation(this.app, this);
		
		// 初始化 PDF 反向连接高亮服务，强制使用内嵌高亮模式
		// 图层高亮功能还不成熟，暂时禁用
		this.pdfBacklinkHighlighter = new PdfBacklinkHighlighter(this.app, this);
		this.pdfBacklinkHighlighter.setUseEmbeddedHighlights(true); // 强制使用内嵌高亮
		
		// 初始化 Set 选择服务
		this.setSelectionService = new SetSelectionService();
		
		// 初始化链接服务
		this.linkService = new LinkService(this);
		
		// 初始化内部链接服务
		this.internalLinkService = new InternalLinkService(this);
		
		
		
		// 将当前选中集合的颜色写入 HTML 根节点 dataset，供字幕选择器使用
		this.setSelectionService.onChange((selected) => {
			const color = selected ? this.dataManager.getCollection(selected)?.color || '' : '';
			document.documentElement.dataset.snCurrentColor = color;
		});
		
		// 快速截取服务（依赖 setSelectionService）
		this.quickCaptureService = new QuickCaptureService(this.app, this, this.setSelectionService);
		
		
		// 初始化 PDF 高亮点击跳转服务
		this.pdfHighlightHandler = new PdfHighlightHandler(this.app, this);
		
		// 初始化 PDF 矩形截取服务
		this.pdfRectCaptureService = new PdfRectCaptureService(this.app, this);
		
	// PDF viewer loadFile patch (console debug)
	this.pdfViewerPatchService = new PdfViewerPatchService(this);
	

		
	
	
	// 初始化 VideoLinkService
	this.videoLinkService = new OpenLinkService(this.app, this);
	
	// 监听字幕选择事件以创建视频条目
	document.addEventListener('BetterNotes-subtitle-entry', async (ev: any) => {
		const detail = ev.detail as {
			element: HTMLElement;
			text: string;
			line: number;
			start: number;
			end: number;
			url: string;
			time: number;
		};

		const setName = this.setSelectionService.getSelected();
		if (!setName) {
			new Notice(t('please select a collection first'));
			return;
		}

		const collection = this.dataManager.getCollection(setName);
		if (!collection) {
			new Notice(t(`collection not found`));
			return;
		}

		// 着色选中文本
		detail.element.style.color = collection.color;

		// 构造 index 字符串：time&line&start&end&url
		const indexStr = `${detail.time}&${detail.line}&${detail.start}&${detail.end}&${detail.url}`;

		try {
			const entry = await this.createEntry(detail.text, setName, {
				type: 'video',
				index: indexStr,
			});
			// 将条目hash添加到元素中，以便后续能够导航到该条目
			detail.element.setAttr('data-entry-hash', entry.hash);
			// 自动导航到侧边栏中的条目
			await this.navigateToEntryInComments(entry);
		} catch (e) {
			console.error('创建视频条目失败', e);
		}
	});
		
	// 播放过程中根据已保存条目高亮字幕
	document.addEventListener('BetterNotes-subtitle-line-rendered', (ev: any) => {
		const { line, container } = ev.detail as { line: number; container: HTMLElement };
		const videoUrl = container.dataset.videoUrl || '';
		if (!videoUrl) return;

		// 获取所有 video 条目，筛选 index 里 url 匹配的
		const entries = this.dataManager
		  .getAllEntries()
		  .filter(e => e.type === 'video' && typeof e.index === 'string' && e.index.endsWith(videoUrl));

		if (entries.length === 0) return;

		// 进一步过滤 line 匹配的
		const lineEntries = entries.filter(e => {
			const parts = e.index.split('&');
			if (parts.length < 5) return false;
			const l = Number(parts[1]);
			return l === line;
		});

		if (lineEntries.length === 0) return;

		// 按每个条目高亮 start~end
		lineEntries.forEach((entry) => {
			const parts = entry.index.split('&');
			const l = parts[1];
			const s = parts[2];
			const eIdx = parts[3];
			const startIdx = Number(s);
			const endIdx = Number(eIdx);
			const set = entry.set;
			const collection = this.dataManager.getCollection(set);
			const color = collection?.color || 'yellow';

			const lineEl = container.querySelector<HTMLElement>(`[line="${l}"]`);
			if (!lineEl) return;

			// 若已存在选中元素就着色后返回
			if (lineEl.querySelector(`span[data-entry-hash="${entry.hash}"]`)) return;

			const words = Array.from(lineEl.querySelectorAll<HTMLElement>('span[index]'));
			const frag: HTMLElement[] = [];
			words.forEach(w => {
				const idx = Number(w.getAttribute('index'));
				if (idx >= startIdx && idx <= endIdx) {
					frag.push(w);
				}
			});

			if (frag.length === 0) return;
			const mergedText = frag.map(f => f.textContent || '').join(' ');

			const newSpan = document.createElement('span');
			newSpan.textContent = mergedText;
			newSpan.classList.add('subtitle-auto-highlight');
			newSpan.style.color = color;
			newSpan.setAttr('data-entry-hash', entry.hash);

			// Remove original frag (with spaces) similar to merge logic
			const first = frag[0];
			const last = frag[frag.length - 1];
			let n: ChildNode | null = first;
			const toRemove: ChildNode[] = [];
			while (n) {
				toRemove.push(n);
				if (n === last) break;
				n = n.nextSibling;
			}
			first.parentElement?.insertBefore(newSpan, first);
			toRemove.forEach(t => t.remove());
		});
	});
		

	// 初始化字幕条目导航键
	setupSubtitleNavigationKeys();

	// 监听字幕条目导航事件
	document.addEventListener('BetterNotes-navigate-to-entry', async (ev: any) => {
		const { hash } = ev.detail as { hash: string };
		if (!hash) return;

		try {
			const entry = this.dataManager.getEntry(hash);
			if (entry) {
				await this.navigateToEntryInComments(entry);
			}
		} catch (e) {
			console.error('导航失败', e);
		}
	});

	// 监听视频条目删除事件，移除对应高亮
	document.addEventListener('BetterNotes-video-entry-deleted', (ev: any) => {
		const { hash } = ev.detail as { hash: string };
		if (!hash) return;

		try {
			// 查找所有带有该 hash 的高亮元素
			const highlightedSpans = document.querySelectorAll(`span.subtitle-auto-highlight[data-entry-hash="${hash}"]`);
			
			highlightedSpans.forEach(span => {
				const text = span.textContent || '';
				// 只有当包含文本时才处理
				if (!text.trim()) return;
				
				// 获取父元素，用于后续插入单词元素
				const parent = span.parentElement;
				if (!parent) return;
				
				// 获取可能存在的 line 属性
				const line = span.getAttribute('line');
				
				// 创建文本片段，将合并的文本拆分为单独的单词
				const words = text.trim().split(/\s+/);
				const fragment = document.createDocumentFragment();
				
				words.forEach((word, i) => {
					// 创建新的单词元素，保持与 SubtitleRenderer 一致的属性
					const wordSpan = document.createElement('span');
					wordSpan.textContent = word;
					wordSpan.setAttribute('index', String(i + 1));
					if (line) {
						wordSpan.setAttribute('line', line);
					}
					
					fragment.appendChild(wordSpan);
					
					// 添加单词间的空格，最后一个词除外
					if (i < words.length - 1) {
						fragment.appendChild(document.createTextNode(' '));
					}
				});
				
				// 替换高亮元素为拆分后的单词
				parent.insertBefore(fragment, span);
				span.remove();
			});
		} catch (e) {
			console.error('移除视频条目高亮失败', e);
		}
	});

	

	// 监听相机截图并创建条目
	document.addEventListener('BetterNotes-video-screenshot-entry', async (ev: any) => {
		const detail = ev.detail as {
			time: number;
			videoUrl: string;
			sourceFile: string;
			attachmentPath: string;
		};

		const setName = this.setSelectionService.getSelected();
		if (!setName) return;

		const indexStr = `${detail.time}&timestamp&&&${detail.videoUrl}`;

		try {
			const entry = await this.createEntry('', setName, {
				type: 'video',
				sourceFile: detail.sourceFile,
				index: indexStr,
				attachmentFile: [detail.attachmentPath]
			});
			await this.navigateToEntryInComments(entry);
		} catch (e) {
			console.error('创建视频截图条目失败', e);
		}
	});

	
	}


	/**
	 * 插件卸载时调用
	 */
	async onunload() {
		// 保存数据
		this.storageManager.saveData(this.settings);
		
		// 注销视图
		this.app.workspace.detachLeavesOfType(SidebarView.VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(AI_CHAT_VIEW_TYPE);
		
		// 清理事件监听器
		if (this.hashSpanHandler) {
			this.hashSpanHandler.cleanup();
		}
		
		// 无需手动清理 pdfBacklinkHighlighter，该服务会通过 plugin.registerEvent 自动处理
		this.quickCaptureService.cleanup();
		// 保存并卸载 RAG 数据库
		await this.ragService.onunload();

		// openLinkPatchService 由 register 自动恢复
		
	}

	/**
	 * 处理文件重命名和移动事件
	 * 自动更新相关条目的 sourceFile 字段
	 * @param oldPath 旧文件路径
	 * @param newPath 新文件路径
	 */
	private async handleFileRename(oldPath: string, newPath: string): Promise<void> {
		try {
			//console.log(`[BetterNotes] File renamed/moved: ${oldPath} -> ${newPath}`);
			
			// 查找所有需要更新的条目
			const allEntries = this.dataManager.getAllEntries();
			const affectedEntries: Array<{entry: Entry, updates: Partial<Entry>}> = [];
			
			for (const entry of allEntries) {
				const updates: Partial<Entry> = {};
				
				// 1. 检查 sourceFile 字段
				if (entry.sourceFile === oldPath) {
					updates.sourceFile = newPath;
				}
				
				// 2. 检查 PDF 条目的 index 字段
				if (entry.type === 'pdf' && entry.index && typeof entry.index === 'string') {
					// PDF index 格式: "documents/99sentences.pdf#page=1&annotation=571R"
					// 需要替换完整的文件路径
					if (entry.index.includes(oldPath)) {
						updates.index = entry.index.replace(oldPath, newPath);
					}
				}
				
				// 3. 检查视频条目的 index 字段
				if (entry.type === 'video' && entry.index && typeof entry.index === 'string') {
					// 视频 index 格式: "time&line&start&end&url"
					// URL 部分可能包含文件路径
					const parts = entry.index.split('&');
					if (parts.length >= 5 && parts[4].includes(oldPath)) {
						parts[4] = parts[4].replace(oldPath, newPath);
						updates.index = parts.join('&');
					}
				}
				
				// 如果有需要更新的字段，添加到列表中
				if (Object.keys(updates).length > 0) {
					affectedEntries.push({ entry, updates });
				}
			}
			
			if (affectedEntries.length === 0) {
				//console.log(`[BetterNotes] No entries found for path: ${oldPath}`);
				return;
			}
			
			//console.log(`[BetterNotes] Found ${affectedEntries.length} entries to update`);
			
			// 批量更新条目
			let updatedCount = 0;
			for (const { entry, updates } of affectedEntries) {
				try {
					await this.updateEntry(entry.hash, updates);
					updatedCount++;
					
					// 记录具体更新的内容
					const updateDetails = Object.keys(updates).map(key => 
						`${key}: ${(entry as any)[key]} -> ${(updates as any)[key]}`
					).join(', ');
					//console.log(`[BetterNotes] Updated entry ${entry.hash}: ${updateDetails}`);
					
				} catch (error) {
					console.error(`[BetterNotes] Failed to update entry ${entry.hash}:`, error);
				}
			}
			
			if (updatedCount > 0) {
				//console.log(`[BetterNotes] Successfully updated ${updatedCount} entries with new path: ${newPath}`);
				new Notice(`${t('file path updated for entries')}: ${updatedCount} ${t('entries')}`);
				
				// 刷新视图以反映更改
				await this.refreshViews();
			}
			
		} catch (error) {
			console.error('[BetterNotes] Error handling file rename:', error);
			new Notice(t('failed to update file paths'));
		}
	}
	
	/**
	 * 创建集合并保存
	 */
	async createCollection(name: string, options: Partial<Collection> = {}): Promise<Collection> {
		const collection = this.dataManager.createCollection(name, options);
		await this.storageManager.saveData(this.settings);
		await this.refreshViews();
		return collection;
	}
	
	/**
	 * 更新集合并保存
	 */
	async updateCollection(name: string, updates: Partial<Collection>): Promise<Collection> {
		// 先获取旧集合用于对比颜色变化
		const prevCollection = this.dataManager.getCollection(name);

		const collection = this.dataManager.updateCollection(name, updates);
		await this.storageManager.saveData(this.settings);

		// 若颜色变动，批量更新 Markdown span 颜色
		if (prevCollection && updates.color && updates.color !== prevCollection.color) {
			try {
				await this.batchUpdateCollectionColor(name, prevCollection.color, updates.color as string);
			} catch (e) {
				console.error('批量更新集合颜色失败', e);
			}
		}

		return collection;
	}

	/**
	 * 批量更新指定集合在 Markdown 文件中的颜色
	 */
	private async batchUpdateCollectionColor(setName: string, oldColor: string, newColor: string) {
		const entries = this.dataManager.getEntriesBySet(setName).filter(e => e.type === 'md' && e.sourceFile);
		if (entries.length === 0) return;

		const fileMap = new Map<string, Entry[]>();
		for (const entry of entries) {
			const path = entry.sourceFile as string;
			if (!fileMap.has(path)) fileMap.set(path, []);
			fileMap.get(path)!.push(entry);
		}

		for (const [path, list] of fileMap.entries()) {
			const af = this.app.vault.getAbstractFileByPath(path);
			if (!(af instanceof TFile)) continue;
			let content = await this.app.vault.read(af);
			let modified = false;
			for (const entry of list) {
				const hash = entry.hash;
				const spanRegex = new RegExp(`<span[^>]*data-hash="${hash}"[^>]*>([\\s\\S]*?)<\\/span>`, 'g');
				content = content.replace(spanRegex, (_m, inner) => {
					modified = true;
					return `<span class=\"BetterNotes-hash-span\" style=\"color:${newColor}\" data-hash=\"${hash}\">${inner}</span>`;
				});
			}
			if (modified) {
				await this.app.vault.modify(af, content);
				//console.log(`[BetterNotes] Updated colors in ${path}`);
			}
		}
	}
	
	/**
	 * 删除集合并保存
	 */
	async deleteCollection(name: string): Promise<boolean> {
		// 获取集合中的所有条目
		const entries = this.dataManager.getEntriesBySet(name);
		
		if (entries.length > 0) {
			// 按文件路径对条目进行分组
			const fileEntryMap = new Map<string, Entry[]>();
			const videoEntries: Entry[] = [];
			
			// 对所有条目按文件路径进行分组
			for (const entry of entries) {
				if (entry.type === 'video') {
					videoEntries.push(entry);
					continue;
				}
				
				if (!entry.sourceFile) continue;
				
				if (!fileEntryMap.has(entry.sourceFile)) {
					fileEntryMap.set(entry.sourceFile, []);
				}
				
				fileEntryMap.get(entry.sourceFile)?.push(entry);
			}
			
			// 处理视频条目
			for (const entry of videoEntries) {
				document.dispatchEvent(new CustomEvent('BetterNotes-video-entry-deleted', {
					detail: { hash: entry.hash }
				}));
			}
			
			// -------- 清理图层高亮缓存/DOM --------
			for (const entry of entries) {
				if (entry.type === 'pdf') {
					this.rectHighlightManager.removeRectByHash(entry.hash);
				}
			}

			// -------- 按文件批量处理 --------
			for (const [filePath, fileEntries] of fileEntryMap.entries()) {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (!(file instanceof TFile)) continue;
				
				// 按条目类型分组
				const mdEntries = fileEntries.filter(e => e.type === 'md');
				const pdfEntries = fileEntries.filter(e => e.type === 'pdf');
				
				// 批量处理Markdown文件中的标签
				if (mdEntries.length > 0 && file.extension === 'md') {
					await this.batchCleanMarkdownEntries(file, mdEntries);
				}
				
				// 批量处理PDF文件中的注释
				if (pdfEntries.length > 0 && file.extension === 'pdf') {
					await this.batchCleanPdfEntries(file, pdfEntries);
				}
			}
		}

		// 从数据管理器中删除集合
		const result = this.dataManager.deleteCollection(name);
		if (result) {
			await this.storageManager.saveData(this.settings);
			await this.refreshViews();
		}
		return result;
	}
	
	/**
	 * 批量清理Markdown文件中的span标签
	 */
	private async batchCleanMarkdownEntries(file: TFile, entries: Entry[]): Promise<void> {
		try {
			// 读取文件内容
			const content = await this.app.vault.read(file);
			
			// 构建包含所有哈希值的正则表达式
			const hashList = entries.map(e => e.hash).join('|');
			const regex = new RegExp(`<span[^>]*data-hash="(${hashList})"[^>]*>([^<]*?)<\\/span>`, 'g');
			
			// 一次性替换所有匹配的span标签
			if (regex.test(content)) {
				const newContent = content.replace(regex, (_match, inner) => {
					return inner.replace(/<br>\s*/g, '\n'); // 去除 <br> 转换成换行
				});
				await this.app.vault.modify(file, newContent);
				//console.log(`Batch cleaned ${entries.length} markdown entries from ${file.path}`);
			}
		} catch (e) {
			console.error('批量清理Markdown条目失败', e);
		}
	}
	
	/**
	 * 批量清理PDF文件中的高亮注释
	 */
	private async batchCleanPdfEntries(file: TFile, entries: Entry[]): Promise<void> {
		try {
			// 收集要删除的注释信息
			const annotationsToDelete: Array<{pageNumber: number, objectNumber: number}> = [];
			
			// 解析每个条目的页码和对象编号
			for (const entry of entries) {
				if (entry.index) {
					const match = entry.index.match(/page=(\d+)&annotation=(\d+)R/);
					if (match) {
						const pageNum = Number(match[1]);
						const objNum = Number(match[2]);
						annotationsToDelete.push({pageNumber: pageNum, objectNumber: objNum});
					}
				}
			}
			
			if (annotationsToDelete.length > 0) {
				// 获取当前活动叶子（标签页）
				const activeLeaf = this.app.workspace.getLeaf();
				let child = undefined;
				
				try {
					if (activeLeaf && activeLeaf.view) {
						const viewFile = (activeLeaf.view as any).file;
						if (viewFile && viewFile.path === file.path) {
							child = (activeLeaf.view as any).viewer?.child;
						}
					}
				} catch (e) {
					console.error('获取PDF视图状态失败', e);
				}
				
				// 批量删除注释
				const pas = new PdfIOService(this.app);
				await pas.batchDeleteAnnotations(file, annotationsToDelete, child);
			}
		} catch (e) {
			console.error('批量清理PDF条目失败', e);
		}
	}
	
	/**
	 * 创建条目（md/pdf），并在侧边栏评论视图中自动导航到该条目。
	 * @param value 条目内容
	 * @param set 集合名
	 * @param options 其他条目参数
	 * @returns 创建的 Entry
	 */
	async createEntry(value: string, set: string, options = {}): Promise<Entry> {
		const entry = this.dataManager.createEntry(value, set, options);
		await this.storageManager.saveData(this.settings);
		return entry;
	}
	
	/**
	 * 辅助函数：在侧边栏评论视图中导航并高亮指定条目。
	 * @param entry 目标条目
	 */
	async navigateToEntryInComments(entry: Entry): Promise<void> {
		// 激活侧边栏视图（如未打开则自动打开）
		await this.activateSidebarView();
		if (this.sidebarView) {
			await this.sidebarView.openCommentsViewAndHighlightEntry(entry);
		}
	}
	
	/**
	 * 更新条目并保存
	 * 同时更新文档中的HTML表示
	 * @param hash 条目哈希
	 * @param updates 更新内容
	 * @returns 更新后的条目
	 */
	async updateEntry(hash: string, updates: Partial<Entry>): Promise<Entry> {
		// 获取原始条目
		const originalEntry = this.dataManager.getEntry(hash);
		if (!originalEntry) {
			throw new Error(`条目 "${hash}" 不存在`);
		}
		
		// 更新条目
		const updatedEntry = this.dataManager.updateEntry(hash, updates);
		
		// 保存数据
		await this.storageManager.saveData(this.settings);
		
		// 如果集合发生变化，需要更新HTML表示中的颜色
		if (updates.set && updates.set !== originalEntry.set) {
			// 获取新集合
			const newCollection = this.dataManager.getCollection(updates.set);
			if (newCollection && originalEntry.sourceFile) {
				// 只更新源文件中的span标签的颜色
				this.updateEntrySpanInSourceFile(hash, newCollection.color, originalEntry.sourceFile);
			}
		}
		
		// 如果 PDF 注释需更新内容
		if (originalEntry.type === 'pdf' && updates.comment !== undefined && originalEntry.index) {
			try {
				const match = originalEntry.index.match(/page=(\d+)&annotation=(\d+)R/);
				if (match) {
					const pageNum = Number(match[1]);
					const objNum = Number(match[2]);
					const file = this.app.vault.getAbstractFileByPath(originalEntry.sourceFile);
					if (file instanceof TFile) {
						// 获取当前活动叶子（标签页）
						const activeLeaf = this.app.workspace.getLeaf();
						let child = undefined;
						let viewerState: PdfViewerState | undefined = undefined;
						
						try {
							if (activeLeaf && activeLeaf.view) {
								const viewFile = (activeLeaf.view as any).file;
								if (viewFile && viewFile.path === originalEntry.sourceFile) {
									child = (activeLeaf.view as any).viewer?.child;

									console.warn('capturePdfViewerState', capturePdfViewerState(child));
									viewerState = capturePdfViewerState(child);
								}
							}
						} catch (e) {
							console.error('获取PDF视图状态失败', e);
						}
						
						const pas = new PdfIOService(this.app);
						await pas.updateHighlightAnnotationContent(file, pageNum, objNum, updates.comment || '', child);
					}
				}
			} catch(e){console.error('更新 PDF 注释内容失败', e);} 
		}
		
		// 显示成功提示
		
		return updatedEntry;
	}
	
	/**
	 * 更新源文件中包含指定hash的span标签的颜色
	 * @param hash 条目哈希
	 * @param color 新颜色
	 * @param sourceFile 源文件路径
	 */
	private async updateEntrySpanInSourceFile(hash: string, color: string, sourceFile: string): Promise<void> {
		// 检查源文件是否存在
		if (!sourceFile) return;
		
		// 尝试获取源文件对应的视图
		const file = this.app.vault.getAbstractFileByPath(sourceFile);
		
		// 确保文件存在且是 TFile 类型
		if (!file || !(file instanceof TFile)) return;
		
		// 确保是 markdown 文件
		if (file.extension !== 'md') return;
		
		try {
			// 读取文件内容
			const content = await this.app.vault.read(file);
			
			// 查找包含此hash的span标签
			const regex = new RegExp(`<span[^>]*data-hash="${hash}"[^>]*>([\\s\\S]*?)<\\/span>`, 'g');
			let match;
			let modified = false;
			let newContent = content;
			
			while ((match = regex.exec(content)) !== null) {
				// 获取原始文本内容和整个span标签
				const originalText = match[1];
				const originalSpan = match[0];
				
				// 创建新的span标签，保留原始文本内容，并添加CSS类
				const newSpan = `<span class="BetterNotes-hash-span" style="color:${color}" data-hash="${hash}">${originalText}</span>`;
				
				// 替换内容
				newContent = newContent.replace(originalSpan, newSpan);
				modified = true;
			}
			
			// 如果有修改，更新文件内容
			if (modified) {
				await this.app.vault.modify(file, newContent);
			}
		} catch (error) {
			console.error(`更新文件 ${sourceFile} 中的标注失败:`, error);
		}
	}
	
	async deleteEntry(hash: string): Promise<boolean> {
		const entry = this.dataManager.getEntry(hash);
		let cleaned = false;
		if (entry && entry.type === 'md' && entry.sourceFile) {
			try {
				const file = this.app.vault.getAbstractFileByPath(entry.sourceFile);
				if (file instanceof TFile) {
					const content = await this.app.vault.read(file);
					const regex = new RegExp(`<span[^>]*data-hash="${hash}"[^>]*>([\\s\\S]*?)<\\/span>`, 'g');
					if (regex.test(content)) {
						const newContent = content.replace(regex, (_match, inner) => {
							return inner.replace(/<br>\s*/g, '\n'); // 去除 <br> 转换成换行
						});
						await this.app.vault.modify(file, newContent);
						cleaned = true;
					}
				}
			} catch (e) {
				console.error('删除条目时清理 span 失败', e);
			}
		}

		// 删除 PDF 注释
		if (entry && entry.type === 'pdf' && entry.index) {
			try {
				const match = entry.index.match(/page=(\d+)&annotation=(\d+)R/);
				if (match) {
					const pageNum = Number(match[1]);
					const objNum = Number(match[2]);
					const file = this.app.vault.getAbstractFileByPath(entry.sourceFile);
					if (file instanceof TFile) {
						const pas = new PdfIOService(this.app);
						
						// 尝试获取当前活动叶子（标签页）
						const activeLeaf = this.app.workspace.getLeaf();
						let child = undefined;
						
						try {
							if (activeLeaf && activeLeaf.view) {
								const viewFile = (activeLeaf.view as any).file;
								if (viewFile && viewFile.path === entry.sourceFile) {
									child = (activeLeaf.view as any).viewer?.child;
								}
							}
						} catch (e) {
							console.error('获取PDF视图状态失败', e);
						}
						
						await pas.deleteHighlightAnnotation(file, pageNum, objNum, child);
					}
				}
				// 若为矩形或文本选区条目，额外处理高亮框删除
				if (entry.index.includes('rect=') || entry.index.includes('selection=')) {
					this.rectHighlightManager.removeRectByHash(entry.hash);
				}
				cleaned = true;
			} catch(e) {console.error('删除 PDF 注释失败',e);} 
		}

		if (entry && entry.type === 'video') {
			// 视频条目删除后，派发事件通知视图移除高亮
			document.dispatchEvent(new CustomEvent('BetterNotes-video-entry-deleted', {
				detail: { hash: entry.hash }
			}));
			cleaned = true;
		}

		if (entry?.attachmentFile?.length) {
			for (const rawPath of entry.attachmentFile) {
				const normPath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
				try {
					const af = this.app.vault.getAbstractFileByPath(normPath);
					if (af instanceof TFile) {
						await this.app.vault.delete(af, true);
						//console.log(`[BetterNotes] Deleted attachment: ${normPath}`);
					}
				} catch (e) {
					console.error(`删除附件失败 (${normPath})`, e);
				}
			}
		}

		// 删除条目
		const result = this.dataManager.deleteEntry(hash);
		if (result) {
			await this.storageManager.saveData(this.settings);
			//console.log('deleteEntry', hash, cleaned);
			if (cleaned) await this.refreshViews();
		}
		return result;
	}
	
	/**
	 * 激活侧边栏视图
	 */
	async activateSidebarView(): Promise<void> {
		const { workspace } = this.app;
		
		// 检查视图是否已经存在
		const existingView = workspace.getLeavesOfType(SidebarView.VIEW_TYPE);
		
		if (existingView.length) {
			// 如果视图已经存在，激活它
			workspace.revealLeaf(existingView[0]);
			return;
		}
		
		// 在右侧边栏打开视图
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: SidebarView.VIEW_TYPE,
				active: true,
			});
			
			// 激活视图
			const newView = workspace.getLeavesOfType(SidebarView.VIEW_TYPE);
			if (newView.length > 0) {
				workspace.revealLeaf(newView[0]);
			}
		}
	}

	/**
	 * 激活 AI 聊天侧边栏
	 */
	async activateAiChatView(): Promise<void> {
		if (!this.licenseValid) {
			new Notice(t('please input valid activation code'));
			return;
		}
		const { workspace } = this.app;
		
		// 检查视图是否已经存在
		const existingView = workspace.getLeavesOfType(AI_CHAT_VIEW_TYPE);
		
		if (existingView.length) {
			// 如果视图已经存在，激活它
			workspace.revealLeaf(existingView[0]);
			return;
		}
		
		// 在右侧边栏打开视图
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: AI_CHAT_VIEW_TYPE,
				active: true,
			});
			
			// 激活视图
			const newView = workspace.getLeavesOfType(AI_CHAT_VIEW_TYPE);
			if (newView.length > 0) {
				workspace.revealLeaf(newView[0]);
			}
		}
	}
	
	/**
	 * 刷新所有视图
	 */
	async refreshViews(): Promise<void> {
		// 刷新侧边栏视图
		if (this.sidebarView) {
			await this.sidebarView.refresh();
		}
	}
	
	/**
	 * 加载CSS样式
	 */
	private loadStyles(): void {
		// 添加样式元素
		const styleEl = document.createElement('style');
		styleEl.id = 'BetterNotes-styles';
		document.head.appendChild(styleEl);
		
		// 加载styles.css文件内容
		this.app.vault.adapter.read(this.manifest.dir + '/styles.css')
			.then(cssText => {
				styleEl.textContent = cssText;
			})
			.catch(error => {
				console.error('无法加载样式文件:', error);
			});
	}

	/**
	 * 打开标注模态框
	 * @param selectedText 选中的文本
	 * @param sourcePath 源文件路径
	 * @param editor 编辑器实例，用于替换选中文本
	 */
	openAnnotationModal(selectedText: string, sourcePath: string, editor?: Editor): void {
		// 预先生成一个hash，确保编辑器中的hash与数据库中的一致
		const hash = generateHash();
		
		// 创建标注模态框
		const modal = new AnnotationModal(this, {
			selectedText,
			sourcePath,
			onConfirm: async (entry) => {
				try {
					// 获取选中的集合
					const collection = this.dataManager.getCollection(entry.set!);
					if (!collection) {
						throw new Error(`集合 "${entry.set}" 不存在`);
					}
					
					// 生成带有颜色和hash的span标签，添加CSS类
					const colorValue = collection.color;
					const htmlText = selectedText.replace(/\n/g, '<br>\n');
					const spanHtml = `<span class="BetterNotes-hash-span" style="color:${colorValue}" data-hash="${hash}">${htmlText}</span>`;
					
					// 创建条目，使用预先生成的hash，并将spanHtml保存到index字段
					await this.createEntryWithHash(entry.value!, entry.set!, hash, {
						comment: entry.comment,
						tag: entry.tag,
						sourceFile: sourcePath, // 确保保存源文件路径
						type: entry.type || 'md',
						index: spanHtml, // 将spanHtml保存到index字段
						attachmentFile: entry.attachmentFile || [] // 添加附件文件路径
					});
					
					// 如果有编辑器实例，替换选中的文本为带有样式和hash的span标签
					if (editor) {
						editor.replaceSelection(spanHtml);
					}
					
					
					// 刷新视图
					await this.refreshViews();
					
					return Promise.resolve();
				} catch (error) {
					console.error('创建标注失败:', error);
					return Promise.reject(error);
				}
			}
		});
		
		// 打开模态框
		modal.open();
	}
	
	/**
	 * 创建条目并使用指定的hash
	 * @param value 条目内容
	 * @param set 所属集合
	 * @param hash 指定的hash值
	 * @param options 其他选项
	 * @returns 创建的条目
	 */
	async createEntryWithHash(value: string, set: string, hash: string, options: Partial<Entry> = {}): Promise<Entry> {
		// 使用DataManager创建条目，但使用指定的hash
		const entry = this.dataManager.createEntryWithHash(value, set, hash, options);
		await this.storageManager.saveData(this.settings);
		return entry;
	}

	// --------------------------- Plan ---------------------------

	/** 创建 Plan 并保存 */
	async createPlan(name: string, options: Partial<Plan> = {}): Promise<Plan> {
		const plan = this.dataManager.createPlan(name, options);
		await this.storageManager.saveData(this.settings);
		return plan;
	}

	/** 更新 Plan 并保存（不可修改 name） */
	async updatePlan(name: string, updates: Partial<Plan>): Promise<Plan> {
		const plan = this.dataManager.updatePlan(name, updates);
		await this.storageManager.saveData(this.settings);
		return plan;
	}

	/** 删除 Plan 并保存 */
	async deletePlan(name: string): Promise<boolean> {
		const res = this.dataManager.deletePlan(name);
		if (res) {
			await this.storageManager.saveData(this.settings);
		}
		return res;
	}

	/*
	 * 从 dataManager 的条目中收集所有 PDF 矩形信息加载到 RectHighlightManager
	 */
	private initRectData() {
		const mgr = this.rectHighlightManager;
		const entries = this.dataManager.getAllEntries();
		entries.forEach((e) => {
		  if (e.type !== 'pdf' || typeof e.index !== 'string') return;
		  // 矩形截取格式：page=..&rect=..
		  if (e.index.includes('rect=')) {
			const m = e.index.match(/page=(\d+)&rect=([\d,]+)/);
			if (!m) return;
			const page = Number(m[1]);
			const rectNums = m[2].split(',').map((n) => Number(n)) as [number, number, number, number];
			mgr.addRect(e.sourceFile, page, rectNums, e.hash);
		  }
		  // selection 参数现在保存的是文本层索引，无法在此阶段转换为矩形，待 PDF 打开后由 PdfViewerPatchService 注入
		  else if (e.index.includes('selection=')) {
		    // skip: conversion deferred until viewer loaded
			}
		});
	}

	/**
	 * 清理单个条目在源文件中的可见标记（md span 或 pdf 注释）。
	 */
	private async cleanEntryArtifact(entry: Entry): Promise<void> {
		if (entry.type === 'md' && entry.sourceFile) {
			try {
				const file = this.app.vault.getAbstractFileByPath(entry.sourceFile);
				if (file instanceof TFile) {
					const content = await this.app.vault.read(file);
					const regex = new RegExp(`<span[^>]*data-hash="${entry.hash}"[^>]*>([\\s\\S]*?)<\\/span>`, 'g');
					if (regex.test(content)) {
						const newContent = content.replace(regex, (_match, inner) => {
							return inner.replace(/<br>\s*/g, '\n'); // 去除 <br> 转换成换行
						});
						await this.app.vault.modify(file, newContent);
					}
				}
			} catch (e) { console.error('clean md artifact failed', e); }
		} else if (entry.type === 'pdf' && entry.index) {
			try {
				const match = entry.index.match(/page=(\d+)&annotation=(\d+)R/);
				if (match) {
					const pageNum = Number(match[1]);
					const objNum = Number(match[2]);
					const file = this.app.vault.getAbstractFileByPath(entry.sourceFile);
					if (file instanceof TFile) {
						// 获取当前活动叶子（标签页）
						const activeLeaf = this.app.workspace.getLeaf();
						let child = undefined;
						
						try {
							if (activeLeaf && activeLeaf.view) {
								const viewFile = (activeLeaf.view as any).file;
								if (viewFile && viewFile.path === entry.sourceFile) {
									child = (activeLeaf.view as any).viewer?.child;
								}
							}
						} catch (e) {
							console.error('获取PDF视图状态失败', e);
						}
						
						const pas = new PdfIOService(this.app);
						await pas.deleteHighlightAnnotation(file, pageNum, objNum, child);
					}
				}
				// 若为矩形或文本选区条目，额外处理高亮框删除
				if (entry.index.includes('rect=') || entry.index.includes('selection=')) {
					this.rectHighlightManager.removeRectByHash(entry.hash);
				}
			} catch (e) { console.error('clean pdf annotation failed', e); }
		} else if (entry.type === 'video') {
			// 视频条目删除后，派发事件通知视图移除高亮
			document.dispatchEvent(new CustomEvent('BetterNotes-video-entry-deleted', {
				detail: { hash: entry.hash }
			}));
		}
	}

	/**
	 * 切换 Markdown 即时标注功能并持久化设置。
	 * 会在状态更改时通过 Notice 提示当前状态。
	 */
	public async toggleImmediateAnnotation() {
		this.settings.mdImmediateAnnotation = !this.settings.mdImmediateAnnotation;
		await this.saveData(this.settings);
		new Notice(t('markdown immediate annotation is now') + (this.settings.mdImmediateAnnotation ? t('enabled') : t('disabled')));
		if (this.ribbonToggleIcon) {
			this.ribbonToggleIcon.toggleClass('is-active', this.settings.mdImmediateAnnotation);
		}
	}

	/** 获取当前 Vault 的绝对路径（兼容桌面 / 移动） */
	private getVaultPath(): string {
		const adapter = this.app.vault.adapter as any;
		let vaultPath: string = this.app.vault.getName();
		if (adapter && adapter.basePath) {
			vaultPath = `${adapter.basePath}/${vaultPath}`;
		}
		return vaultPath;
	}

	/** 激活并向服务器验证，成功后保存 license */
	public async validateActivation(code: string): Promise<boolean> {
		const trimmedCode = code.trim();
		const vaultPath = this.getVaultPath();

		let success = false;
		let licenseStr = '';
		try {
			const resp = await fetch('https://butcher-x.com/activate/index.php', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: trimmedCode, device_id: vaultPath }),
			});

			if (resp.ok) {
				const data = await resp.json();
				if (data.success && data.license) {
					licenseStr = String(data.license).trim();
					success = true;
				} else {
					new Notice(t('activation failed') + ': ' + (data.message || t('unknown error')));
				}
			} else {
				new Notice(t('server error') + ': ' + resp.status);
			}
		} catch (e) {
			console.error('[BetterNotes] 激活请求失败:', e);
			new Notice(t('network request failed, please check your network connection'));
		}

		if (success) {
			this.settings.activationCode = trimmedCode;
			this.settings.license = licenseStr;
			this.licenseValid = await verifyLicense(licenseStr, trimmedCode, vaultPath);
		} else {
			this.licenseValid = false;
		}

		this.settings.ai.enabled = this.licenseValid;
		await this.saveData(this.settings);
		this.aiService.updateConfig(this.settings.ai);

		new Notice(this.licenseValid ? t('activation successful') : t('activation failed'));
		return this.licenseValid;
	}

	/** 更新 AI 配置，并刷新服务实例 */
	public async updateAiConfig(cfg: AiServiceConfig) {
		this.settings.ai = cfg;
		await this.saveData(this.settings);
		this.aiService.updateConfig(cfg);
	}

	/**
	 * 重写 Plugin.saveData：
	 * 1) 仍调用基类方法，保持 Obsidian 默认行为（以防第三方工具读取）
	 * 2) 随后将业务数据 + 设置通过 StorageManager 统一写入，避免相互覆盖。
	 */
	public async saveData(data: any): Promise<void> {
		// 调用父类，保证兼容性
		await super.saveData(data);
		// 将完整设置写入业务数据文件
		await this.storageManager.saveData(this.settings);
	}

	// --------- RAG 索引命令 ----------

	/**
	 * 解绑（反激活）当前设备。
	 * 向服务器发送 `{code, device_id}` 到 /unregister.php。
	 * 成功后将本地 activationCode / license 清空并保存。
	 *
	 * @returns 是否解绑成功
	 */
	public async deactivateLicense(): Promise<boolean> {
		if (!this.settings.activationCode) {
			new Notice(t('no activation info found'));
			return false;
		}
		const vaultPath = this.getVaultPath();
		let success = false;
		try {
			const resp = await fetch('https://butcher-x.com/activate/unregister.php', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: this.settings.activationCode, device_id: vaultPath }),
			});

			if (resp.ok) {
				const data = await resp.json();
				success = !!data.success;
				if (!success) {
					new Notice(t('deactivation failed') + ': ' + (data.message || t('unknown error')));
				}
			} else {
				new Notice(t('server error') + ': ' + resp.status);
			}
		} catch (e) {
			console.error('[BetterNotes] 解绑请求失败:', e);
			new Notice(t('network request failed, please check your network connection'));
		}

		if (success) {
			// 清除本地授权信息
			this.settings.activationCode = '';
			this.settings.license = '';
			this.licenseValid = false;
			this.settings.ai.enabled = false;
			await this.saveData(this.settings);
			this.aiService.updateConfig(this.settings.ai);
		}
		return success;
	}

	/**
	 * 检查服务器通知
	 * 异步获取服务器通知并显示给用户
	 */
	async checkServerNotifications(): Promise<void> {
		try {
			// 异步获取通知，避免阻塞其他初始化过程
			const notification = await this.notificationService.checkForNotifications();
			
			// 如果有新通知，显示并更新设置
			if (notification) {
				// 显示通知
				this.notificationService.displayNotification(notification);
				
				// 更新设置中的通知时间戳
				this.settings.lastNotificationTimestamp = notification.published_at;
				await this.saveData(this.settings);
				
				//console.log('[BetterNotes] 已更新最后通知时间戳:', notification.published_at);
			}
		} catch (error) {
			console.error('[BetterNotes] 检查通知出错:', error);
		}
	}

	/**
	 * Checks if a given view type should be ignored when tracking the last active leaf.
	 * @param viewType The view type string to check.
	 * @returns True if the view should be ignored, false otherwise.
	 */
	public isIgnoredView(viewType: string): boolean {
		return this.ignoredViewTypes.includes(viewType);
	}
}

/**
 * 插件设置面板
 */
class BetterNotesSettingTab extends PluginSettingTab {
	plugin: BetterNotesPlugin;

	constructor(app: App, plugin: BetterNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();


		// --------------- 数据备份与恢复 ---------------
		new Setting(containerEl).setName(t('Data backup and restore')).setHeading();
		new Setting(containerEl)
			.setName(t('data backup'))
			.addButton(btn => btn
				.setButtonText(t('backup now'))
				.setCta()
				.onClick(async () => {
					await this.plugin.backupService.backupData();
				}));

		new Setting(containerEl)
			.setName(t('restore data'))
			.addButton(btn => btn
				.setButtonText(t('restore data'))
				.setWarning()
				.onClick(async () => {
					new BackupRestoreModal(this.plugin.app, this.plugin.backupService).open();
				}));


		// general settings
		new Setting(containerEl).setName(t('General notes settings')).setHeading();



				
		new Setting(containerEl)
			.setName(t('search context length'))
			.addText(text => text
				.setPlaceholder('例如 10')
				.setValue(String(this.plugin.settings.snippetContext))
				.onChange(async (value) => {
					const num = parseInt(value) || 10;
					this.plugin.settings.snippetContext = num;
					await this.plugin.saveData(this.plugin.settings);
				}));

		new Setting(containerEl)
			.setName(t('pdf highlight opacity'))
			.addText(text => text
				.setPlaceholder('0.7')
				.setValue(String(this.plugin.settings.highlightOpacity))
				.onChange(async (value) => {
					let num = parseFloat(value);
					if (isNaN(num) || num < 0 || num > 1) {
						new Notice(t('please input a number between 0 and 1'));
						return;
					}
					this.plugin.settings.highlightOpacity = num;
					await this.plugin.saveData(this.plugin.settings);
				}));
				
		// PDF 高亮模式设置 - 暂时注释掉，强制使用内嵌高亮
		// 图层高亮功能还不成熟，暂时禁用选择
		/*
		new Setting(containerEl)
			.setName(t('pdf highlight mode'))
			.addDropdown(drop => {
				drop.addOption('embedded', t('embedded'));
				drop.addOption('layer', t('layer'));
				const mode = (this.plugin.settings.pdfHighlightMode === 'layer' ? 'layer' : 'embedded') as 'embedded' | 'layer';
				drop.setValue(mode);
				drop.onChange(async (val) => {
					const typedVal = (val === 'layer' ? 'layer' : 'embedded') as 'embedded' | 'layer';
					this.plugin.settings.pdfHighlightMode = typedVal;
					// 同步切换高亮器模式
					this.plugin.pdfBacklinkHighlighter.setUseEmbeddedHighlights(typedVal === 'embedded');
					await this.plugin.saveData(this.plugin.settings);
					new Notice(t('pdf highlight mode switched') + ': ' + (typedVal === 'embedded' ? t('embedded') : t('layer')));
				 });
			});
		*/

		// 链接模板设置区域
		
		// PDF链接模板
		new Setting(containerEl)
			.setName(t('pdf link template'))
			.addText(text => text
				.setPlaceholder('[[{index}|{value}]]')
				.setValue(this.plugin.settings.linkTemplates.pdfTemplate || DEFAULT_LINK_TEMPLATES.pdfTemplate)
				.onChange(async (value) => {
					if (!this.plugin.settings.linkTemplates) {
						this.plugin.settings.linkTemplates = {...DEFAULT_LINK_TEMPLATES};
					}
					this.plugin.settings.linkTemplates.pdfTemplate = value;
					await this.plugin.saveData(this.plugin.settings);
				}));
		
		// Markdown链接模板
		new Setting(containerEl)
			.setName(t('markdown link template'))
			.setDesc('{index} {file} {value}')
			.addText(text => text
				.setPlaceholder('[[{index}|{value}]]')
				.setValue(this.plugin.settings.linkTemplates.mdTemplate || DEFAULT_LINK_TEMPLATES.mdTemplate)
				.onChange(async (value) => {
					if (!this.plugin.settings.linkTemplates) {
						this.plugin.settings.linkTemplates = {...DEFAULT_LINK_TEMPLATES};
					}
					this.plugin.settings.linkTemplates.mdTemplate = value;
					await this.plugin.saveData(this.plugin.settings);
				}));
		
		// 视频链接模板
		new Setting(containerEl)
			.setName(t('video link template'))
			.setDesc('{index} {file} {value} {url} {timestamp}')
			.addText(text => text
				.setPlaceholder('[[{index}|{value}]]')
				.setValue(this.plugin.settings.linkTemplates.videoTemplate || DEFAULT_LINK_TEMPLATES.videoTemplate)
				.onChange(async (value) => {
					if (!this.plugin.settings.linkTemplates) {
						this.plugin.settings.linkTemplates = {...DEFAULT_LINK_TEMPLATES};
					}
					this.plugin.settings.linkTemplates.videoTemplate = value;
					await this.plugin.saveData(this.plugin.settings);
				}));
		
		// 卡片模板
		new Setting(containerEl)
			.setName(t('card template'))
			.setDesc('{link} {comment} {value} {addTime} {tag} {type} {proficiency} {set}')
			.addTextArea(text => text
				.setPlaceholder(DEFAULT_LINK_TEMPLATES.cardTemplate)
				.setValue(this.plugin.settings.linkTemplates.cardTemplate || DEFAULT_LINK_TEMPLATES.cardTemplate)
				.onChange(async (value) => {
					if (!this.plugin.settings.linkTemplates) {
						this.plugin.settings.linkTemplates = {...DEFAULT_LINK_TEMPLATES};
					}
					this.plugin.settings.linkTemplates.cardTemplate = value;
					await this.plugin.saveData(this.plugin.settings);
				}))
			.settingEl.style.gridTemplateColumns = "auto auto"; // 调整布局，使文本区域更宽
		
		// HTML导出模板
		new Setting(containerEl)
			.setName(t('html export template'))
			.setDesc('{link} {comment} {value} {addTime} {tag} {type} {proficiency} {set} {color}')
			.addTextArea(text => text
				.setPlaceholder(DEFAULT_LINK_TEMPLATES.htmlTemplate)
				.setValue(this.plugin.settings.linkTemplates.htmlTemplate || DEFAULT_LINK_TEMPLATES.htmlTemplate)
				.onChange(async (value) => {
					if (!this.plugin.settings.linkTemplates) {
						this.plugin.settings.linkTemplates = {...DEFAULT_LINK_TEMPLATES};
					}
					this.plugin.settings.linkTemplates.htmlTemplate = value;
					await this.plugin.saveData(this.plugin.settings);
				}))
			.settingEl.style.gridTemplateColumns = "auto auto"; // 调整布局，使文本区域更宽
		
		// 添加重置按钮
		new Setting(containerEl)
			.setName(t('reset all templates'))
			.addButton(btn => btn
				.setButtonText(t('reset'))
				.onClick(async () => {
					this.plugin.settings.linkTemplates = {...DEFAULT_LINK_TEMPLATES};
					await this.plugin.saveData(this.plugin.settings);
					// 重新加载设置面板以更新显示
					this.display();
					new Notice(t('all templates reset'));
				}));

		// ---------- FSRS 参数 ----------
		new Setting(containerEl)
			.setName(t('fsrs target retention rate'))
			.setDesc(t('the probability of remembering the target on the next review; the higher the value, the shorter the review interval'))
			.addSlider(s => {
				s.setLimits(0.8, 0.95, 0.01)
				.setDynamicTooltip()
				.setValue(this.plugin.settings.fsrsParams.request_retention)
				.onChange(val => {
					this.plugin.settings.fsrsParams.request_retention = val;
					this.plugin.fsrsService.setParameters({ request_retention: val });
					this.plugin.saveData(this.plugin.settings);
				});
			})

		new Setting(containerEl)
			.setName(t('fsrs maximum interval'))
			.setDesc(t('maximum_interval: the maximum review interval allowed to prevent the interval from extending indefinitely'))
			.addText(t => t
				.setPlaceholder('36500')
				.setValue(String(this.plugin.settings.fsrsParams.maximum_interval))
				.onChange(val => {
					const num = Number(val);
					if (!isNaN(num)) {
						this.plugin.settings.fsrsParams.maximum_interval = num;
						this.plugin.fsrsService.setParameters({ maximum_interval: num });
						this.plugin.saveData(this.plugin.settings);
					}
				}));

		// 17 维权重按钮
		new Setting(containerEl)
			.setName(t('fsrs detailed weights'))
			.addButton(b => b.setButtonText(t('open')).onClick(()=>{
				(new (require('./components/FSRSWeightModal').FSRSWeightModal)(this.plugin)).open();
			}));

		// ---------- AI 服务设置 ----------
		new Setting(containerEl).setName(t('AI service (OpenAI compatible)')).setHeading();

		// 开关（只读，依据授权状态自动显示）
		new Setting(containerEl)
			.setName(t('enable ai function'))
			.setDesc(t('need activation'))
			.addToggle(tgl => {
				tgl.setValue(this.plugin.licenseValid);
				tgl.setDisabled(true);
			});

		// Base URL
		new Setting(containerEl)
			.setName(t('base url'))
			.setDesc(t('interface base address, such as https://api.openai.com/v1'))
			.addText(txt => txt
				.setPlaceholder('https://api.openai.com/v1')
				.setValue(this.plugin.settings.ai.baseUrl)
				.onChange(async (val) => {
					this.plugin.settings.ai.baseUrl = val.trim();
					await this.plugin.updateAiConfig(this.plugin.settings.ai);
				}));

		// API Key
		new Setting(containerEl)
			.setName(t('api key'))
			.setDesc(t('bearer token'))
			.addText(txt => txt
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.ai.apiKey)
				.onChange(async (val) => {
					this.plugin.settings.ai.apiKey = val.trim();
					await this.plugin.updateAiConfig(this.plugin.settings.ai);
				}));

		// 默认模型
		new Setting(containerEl)
			.setName(t('default model name'))
			.setDesc(t('gpt-4o is recommended'))
			.addText(txt => txt
				.setPlaceholder('gpt-4o')
				.setValue(this.plugin.settings.ai.model)
				.onChange(async (val) => {
					this.plugin.settings.ai.model = val.trim();
					await this.plugin.updateAiConfig(this.plugin.settings.ai);
				}));

		// 测试按钮
		new Setting(containerEl)
			.setName(t('test connection'))
			.setDesc(t('display available model list'))
			.addButton(btn => btn.setButtonText(t('test'))
				.onClick(async () => {
					try {
						await this.plugin.aiService.testConnection();
					} catch (err) {
						const msg = (err as any)?.message || String(err);
						new Notice(t('test failed') + ': ' + msg);
					}
				}));

		// ---------- Preset 提示词 ----------
		new Setting(containerEl)
			.setName(t('ai preset prompt'))
			.setDesc(t('manage common prompt, can be quickly selected in the chat input box through /'))
			.addButton(b => b.setButtonText(t('manage')).onClick(() => {
				import('./components/PresetModal').then(mod => {
					const PresetModal = (mod as any).default;
					new PresetModal(this.plugin).open();
				});
			}));

		// ---------- RAG 嵌入设置 ----------
		new Setting(containerEl).setName(t('Rag embedding settings')).setHeading();

		new Setting(containerEl)
			.setName(t('embedding model'))
			.setDesc(t('text-embedding-3-small is recommended'))
			.addText(txt => txt
				.setPlaceholder('text-embedding-3-small')
				.setValue(this.plugin.settings.rag.embeddingModel)
				.onChange(async (val) => {
					this.plugin.settings.rag.embeddingModel = val.trim();
					await this.plugin.saveData(this.plugin.settings);
					this.plugin.ragService.updateConfig(this.plugin.settings.rag);
				}));

		new Setting(containerEl)
			.setName(t('embedding base url'))
			.addText(txt => txt
				.setPlaceholder('https://api.openai.com/v1')
				.setValue(this.plugin.settings.rag.embeddingEndpoint)
				.onChange(async (val) => {
					this.plugin.settings.rag.embeddingEndpoint = val.trim();
					await this.plugin.saveData(this.plugin.settings);
					this.plugin.ragService.updateConfig(this.plugin.settings.rag);
				}));

		new Setting(containerEl)
			.setName(t('embedding api key'))
			.addText(txt => txt
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.rag.apiKey || '')
				.onChange(async (val) => {
					this.plugin.settings.rag.apiKey = val.trim();
					await this.plugin.saveData(this.plugin.settings);
					this.plugin.ragService.updateConfig(this.plugin.settings.rag);
			}));

		// 相似度阈值设置
		new Setting(containerEl)
			.setName(t('minimum similarity threshold'))
			.setDesc(t('the larger the value, the higher the result similarity; too high may result in no results; should not exceed 0.4'))
			.addSlider(s => {
				s.setLimits(0, 0.5, 0.01)
				 .setDynamicTooltip()
				 .setValue(this.plugin.settings.rag.minSimilarity ?? 0.25)
				 .onChange(async (val) => {
					this.plugin.settings.rag.minSimilarity = parseFloat(val.toFixed(2));
					await this.plugin.saveData(this.plugin.settings);
					this.plugin.ragService.updateConfig({ minSimilarity: this.plugin.settings.rag.minSimilarity });
				 });
			});

		

		/* -------------------------- License 区域 -------------------------- */
		new Setting(containerEl).setName(t('License')).setHeading();

		
		// 激活码输入 + 激活按钮
		new Setting(containerEl)
			.setName(t('activation code'))
			.setDesc(t('input activation code and click "activate" button'))
			.addText(t => t
				.setValue(this.plugin.settings.activationCode || '')
				.onChange((val) => {
					// 仅保存，不立即验证
					this.plugin.settings.activationCode = val.trim();
					this.plugin.saveData(this.plugin.settings);
				}))
			.addButton(btn => btn
				.setButtonText(t('activate'))
				.setCta()
				.onClick(async () => {
					const ok = await this.plugin.validateActivation(this.plugin.settings.activationCode || '');
					// 刷新面板以更新状态显示
					this.display();
					if (ok) {
						new Notice(t('activation successful'));
					}
				}));

		// 状态提示 + 解绑按钮
		new Setting(containerEl)
			.setName(t('current license status'))
			.addText(t => t.setValue(this.plugin.licenseValid ? 'activated' : 'not activated').setDisabled(true))
			.addButton(btn => btn
				.setButtonText(t('unbind'))
				.setWarning()
				.setDisabled(!this.plugin.licenseValid)
				.onClick(async () => {
					const ok = await this.plugin.deactivateLicense();
					this.display();
					if (ok) new Notice(t('device unbound'));
				}));
	}
} 