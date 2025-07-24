/**
 * Video Player Component Types
 * Contains all shared interfaces and types used throughout the video components.
 */

/**
 * Represents a subtitle/caption cue with start time, end time, and text content.
 */
export interface Cue {
  start: number;  // Start time in seconds
  end: number;    // End time in seconds
  text: string;   // The subtitle text content
  /**
   * Sequence number as it appears in the original SRT file (1-based).
   * Not all formats include this; thus it is optional.
   */
  lineNumber?: number;
}

/**
 * Represents a single transcript line with text, start time, and duration.
 */
export interface TranscriptLine {
  text: string;       // The text content
  start: number;      // Start time in seconds
  duration: number;   // Duration in seconds
}

/**
 * Represents information about a caption/subtitle track.
 */
export interface TrackInfo {
  id: string;           // Track identifier
  languageCode: string; // Language code (e.g., "en", "zh")
  languageName: string; // Human readable language name
  isGenerated: boolean; // Whether auto-generated (e.g., ASR)
  baseUrl?: string;     // Optional direct URL to the captions
}

/**
 * Supported caption/subtitle formats for conversion.
 */
export type CaptionFormat = 'json' | 'text' | 'vtt' | 'srt';