import { Plugin, TFile } from 'obsidian';
import { VIDEO_VIEW_TYPE } from './view';
import { normalizeVideoSource } from './utils';

/**
 * Listen to workspace layout changes and automatically switch a markdown preview
 * to `VideoView` when its front-matter contains `video-source`.
 */
export function registerMarkdownPreviewInterceptor(plugin: Plugin): void {
    const handler = async () => {
        const leaf = plugin.app.workspace.activeLeaf;
        if (!leaf) return;
        if ((leaf.view as any).getViewType?.() !== 'markdown') return;
        const mdView = leaf.view as any;
        if (mdView.getMode?.() !== 'preview') return;

        const file = mdView.file as TFile | undefined;
        if (!file) return;

        const cache = plugin.app.metadataCache.getFileCache(file);
        const videoSource = cache?.frontmatter?.['video-source'] as string | undefined;
        if (!videoSource) return;

        
        const { fileUrl, filePath } = normalizeVideoSource(plugin, videoSource);
        if (!fileUrl) {
            console.warn('Unsupported video-source', videoSource);
            return;
        }

        await leaf.setViewState({
            type: VIDEO_VIEW_TYPE,
            active: true,
            state: { fileUrl, filePath }
        });
    };

    plugin.registerEvent(plugin.app.workspace.on('layout-change', handler));
} 