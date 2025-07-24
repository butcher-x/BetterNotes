/**
 * CaptionFormatter.ts
 * Utilities to convert transcript lines into various subtitle formats.
 * Supports JSON, plain text, WebVTT and SubRip (SRT).
 */

import { TranscriptLine, CaptionFormat } from '../types';

/**
 * Convert transcript lines into the requested format.
 * @param lines - Transcript lines as returned by CaptionService
 * @param fmt - Target caption format. Defaults to 'json'.
 * @returns String representation of the captions in the requested format
 * @throws Error if format is unsupported
 */
export function formatTranscript(lines: TranscriptLine[], fmt: CaptionFormat = 'json'): string {
  switch (fmt) {
    case 'srt':
      return formatSRT(lines);
    default:
      throw new Error(`Unsupported format: ${fmt}`);
  }
}

/**
 * Convert seconds to a formatted timestamp string (hh:mm:ss[separator]ms)
 * @param sec - Seconds (can include fractional seconds)
 * @param msSep - Separator character between seconds and milliseconds (. for VTT, , for SRT)
 * @returns Formatted timestamp string
 */
function secondsToTimestamp(sec: number, msSep: string): string {
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}${msSep}${pad(ms, 3)}`;
}

/**
 * Pad a number with leading zeros
 * @param n - Number to pad
 * @param len - Desired length (default: 2)
 * @returns Padded string
 */
function pad(n: number, len = 2): string {
  return n.toString().padStart(len, '0');
}

/**
 * Compute the end time for a caption
 * Using the next caption's start time if it's earlier than the current caption's end time
 * @param lines - All transcript lines
 * @param idx - Index of the current line
 * @returns End time in seconds
 */
function computeEnd(lines: TranscriptLine[], idx: number): number {
  const cur = lines[idx];
  const endCandidate = cur.start + cur.duration;
  
  // If there's a next line and it starts before our computed end,
  // use the next line's start as our end to avoid overlap
  if (idx < lines.length - 1 && lines[idx + 1].start < endCandidate) {
    return lines[idx + 1].start;
  }
  
  return endCandidate;
}


/**
 * Format transcript lines as SubRip (SRT)
 * @param lines - Transcript lines
 * @returns SRT formatted string
 */
function formatSRT(lines: TranscriptLine[]): string {
  const parts: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const start = secondsToTimestamp(lines[i].start, ',');
    const end = secondsToTimestamp(computeEnd(lines, i), ',');
    
    // SRT format requires a sequence number for each subtitle
    parts.push(String(i + 1));
    parts.push(`${start} --> ${end}`);
    parts.push(lines[i].text);
    parts.push(''); // Empty line separating entries
  }
  
  return parts.join('\n');
} 