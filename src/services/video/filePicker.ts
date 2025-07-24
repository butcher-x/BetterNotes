import { Notice, Platform, Plugin, FileSystemAdapter, TFile } from 'obsidian';
import { pathToFileURL } from 'url';
import * as nodePath from 'path';
import { VIDEO_VIEW_TYPE, VideoView } from './view';

// Expose picker function so that command can be registered from main.ts
export async function openFilePickerAndPlay(plugin: Plugin): Promise<void> {
    if (!Platform.isDesktopApp) {
        new Notice('This feature is not available on mobile.');
        return;
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const dialog = require('electron').remote.dialog;
        const result = await dialog.showOpenDialog({
            title: 'Pick a video file',
            properties: ['openFile'],
            filters: [
                { name: 'Videos', extensions: ['mp4', 'mkv', 'webm', 'mov'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled || result.filePaths.length === 0) {
            new Notice('File picking cancelled.');
            return;
        }

        const filePath = result.filePaths[0];
        await playVideoInView(plugin, filePath);
    } catch (error) {
        new Notice('Failed to open file picker. Check console for details.');
        console.error('Error opening file picker:', error);
    }
}

/**
 * Decide proper URL scheme for a given *filePath* (inside or outside of vault),
 * then open a `VideoView` for playback. An existing view for the same file will
 * be re-used instead of creating duplicates.
 */
async function playVideoInView(plugin: Plugin, filePath: string): Promise<void> {
    let fileUrl: string;

    const adapter = plugin.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
        // 无论文件是否在 Vault 内，都使用标准 file:// URL。
        // 统一 url 方案可避免播放器/字幕逻辑区分路径来源。
            fileUrl = pathToFileURL(filePath).href;
    } else {
        // Rare case – mobile or non FileSystemAdapter environment.
        fileUrl = pathToFileURL(filePath).href;
    }

    // 1. Ensure companion markdown file exists in vault root.
    await createMetaNote(plugin, filePath, fileUrl);

    // 2. Re-use existing view if one already opened for the same file.
    const existingLeaves = plugin.app.workspace.getLeavesOfType(VIDEO_VIEW_TYPE);
    const existingLeaf = existingLeaves.find(
        (leaf) => (leaf.view as VideoView).getState()?.filePath === filePath
    );

    if (existingLeaf) {
        plugin.app.workspace.setActiveLeaf(existingLeaf);
        return;
    }

    // 3. Otherwise open new tab / leaf.
    const leaf = plugin.app.workspace.getLeaf(true);
    await leaf.setViewState({
        type: VIDEO_VIEW_TYPE,
        active: true,
        state: { fileUrl, filePath }
    });
    plugin.app.workspace.revealLeaf(leaf);
}

/**
 * Create or update a *metadata note* in vault root. The note contains only
 * front-matter with a `video-source` pointing back to the original local file.
 *
 * Example content:
 * ```
 * ---
 * video-source: file:///Users/foo/bar/baz.mp4
 * ---
 * ```
 */
async function createMetaNote(plugin: Plugin, filePath: string, fileUrl: string): Promise<void> {
    const adapter = plugin.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return; // Desktop only

    const mdName = `${nodePath.parse(filePath).name}.md`;
    const mdPath = mdName; // root directory

    const existing = plugin.app.vault.getAbstractFileByPath(mdPath);
    const frontMatter = `---\nvideo-source: ${fileUrl}\n---\n`;

    try {
        if (!existing) {
            await plugin.app.vault.create(mdPath, frontMatter);
        } else if (existing instanceof TFile) {
            const content = await plugin.app.vault.read(existing);
            if (!content.includes('video-source:')) {
                await plugin.app.vault.modify(existing, frontMatter + '\n' + content);
            }
        }
    } catch (e) {
        console.error('Failed to create/modify meta note', e);
    }
} 