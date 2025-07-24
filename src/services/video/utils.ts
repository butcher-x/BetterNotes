/**
 * Video component utility functions
 * Contains helper functions for parsing parameters
 */

import { Cue } from './types';
import { Plugin, FileSystemAdapter } from 'obsidian';
import { pathToFileURL } from 'url';
import * as nodePath from 'path';


/**
 * Parse SRT subtitle format into cue objects
 * 
 * @param srt - SRT format string
 * @returns Array of time-aligned cues
 */
export function parseSrt(srt: string): Cue[] {
  const lines = srt.split(/\r?\n/);
  const cues: Cue[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const idxLine = lines[i].trim();
    if (!idxLine) { i++; continue; }
    
    const maybeNumber = parseInt(idxLine, 10);
    // Handle malformed SRT without index numbers
    if (isNaN(maybeNumber)) {
      if (idxLine.includes("-->")) {
        // This line is actually a timing line without an index
      } else { 
        i++; 
        continue; 
      }
    }

    // Read timing line
    let timingLine: string;
    if (idxLine.includes("-->")) {
      timingLine = idxLine; // There was no numeric index
    } else {
      i++;
      timingLine = (lines[i] || "").trim();
    }

    // Parse timing information
    const timeMatch = timingLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
    if (!timeMatch) { 
      i++; 
      continue; 
    }
    
    const start = timeToSeconds(timeMatch[1]);
    const end = timeToSeconds(timeMatch[2]);

    // Collect text lines until blank line
    i++;
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      textLines.push(lines[i]);
      i++;
    }
    
    cues.push({ start, end, text: textLines.join("\n"), lineNumber: isNaN(maybeNumber) ? undefined : maybeNumber });
    i++; // skip blank line
  }
  
  return cues;
}

/**
 * Convert SRT/VTT timestamp format to seconds
 * 
 * @param t - Timestamp string (hh:mm:ss,ms or hh:mm:ss.ms)
 * @returns Seconds (float)
 */
export function timeToSeconds(t: string): number {
  const [h, m, s] = t.replace(",", ".").split(":").map(parseFloat);
  return h * 3600 + m * 60 + s;
} 



/**
 * Normalize a `video-source` string (found in front-matter) to a usable **file URL** and **file system path**.
 *
 * Supported formats:
 * 1. Absolute / relative paths that point to local files
 * 2. Fully-qualified URLs that start with http/https/file scheme
 *
 * When the path is resolved relative paths are considered relative to the Obsidian vault root directory.
 *
 * @param plugin  Current plugin instance – used to access the vault adapter.
 * @param source  Raw value from the front-matter `video-source` key
 * @returns `{ fileUrl, filePath }` – *fileUrl* is `null` when the source format is not supported.
 */
export function normalizeVideoSource(
    plugin: Plugin,
    source: string
): { fileUrl: string | null; filePath: string } {
    // Case 1: already an URL (contains "://") – return directly.
    if (/^[a-z]+:\/\//i.test(source)) {
        // Special handling for file:// URLs – we still want the plain file path for later use.
        if (source.startsWith('file://')) {
            try {
                const p = nodePath.normalize(new URL(source).pathname);
                return { fileUrl: source, filePath: p };
            } catch {
                return { fileUrl: null, filePath: '' };
            }
        }
        // http / https / others – nothing to resolve on the local file-system.
        return { fileUrl: source, filePath: '' };
    }

    // Case 2: treat as a file path that should live on the local file-system.
    const adapter = plugin.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
        return { fileUrl: null, filePath: '' };
    }

    // Resolve relative path against the vault root.
    const absPath = nodePath.isAbsolute(source)
        ? source
        : nodePath.join(adapter.getBasePath(), source);

    return { fileUrl: pathToFileURL(absPath).href, filePath: absPath };
} 