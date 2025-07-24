import { promises as fs } from 'fs';
import { Cue } from '../types';
import { parseSrt } from '../utils';

/**
 * CaptionLoader
 * --------------------------------------------
 * 提供根据视频文件路径加载同名 `.srt` 字幕文件的能力。
 * 注意：此函数假设视频与字幕文件均位于 **Obsidian Vault 之外** 的本地磁盘。
 * 在渲染进程中可以直接使用 Node.js `fs` 模块读取。
 */

/**
 * 尝试为给定视频文件加载同名 SRT 字幕。
 *
 * @param videoPath 绝对文件系统路径，例如：`/Users/foo/Videos/clip.mp4`
 * @returns 成功时返回解析后的 `Cue[]`；若文件不存在或解析失败则返回 `null`。
 */
export async function loadSrtForVideo(videoPath: string): Promise<Cue[] | null> {
  // 将扩展名替换为 .srt
  const srtPath = videoPath.replace(/\.[^.]+$/, '.srt');

  try {
    const data = await fs.readFile(srtPath, { encoding: 'utf8' });
    // 如果文件为空视为失败
    if (!data.trim()) return null;

    return parseSrt(data);
  } catch (err) {
    // 常见场景：文件不存在 / 无读权限
    console.debug('[CaptionLoader] Unable to load SRT:', err);
    return null;
  }
} 