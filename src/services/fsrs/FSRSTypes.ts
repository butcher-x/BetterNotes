// FSRS 类型定义 (简化版，仅保留本插件需要的字段)



// 卡片状态
export interface FlashcardState {
  difficulty: number;
  stability: number;
  lastReview: number;  // ms
  nextReview: number;  // ms
  reviews: number;     // 总复习次数
  lapses: number;      // Again 次数
  retrievability?: number; // 可提取概率，可运行时计算
}

// 评分常量
export const FSRS_RATING = {
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4,
} as const;
export type FSRSRating = typeof FSRS_RATING[keyof typeof FSRS_RATING];

// 全局 FSRS 参数
export interface FSRSParameters {
  request_retention: number;
  maximum_interval: number;
  w: number[]; // 17 元，默认空数组，则fsrs会使用最佳值
}

export const DEFAULT_FSRS_PARAMETERS: FSRSParameters = {
  request_retention: 0.9,
  maximum_interval: 36500,
  w: [0.4872,1.4003,3.7145,13.8206,5.1618,1.2298,0.8975,0.031,1.6474,0.1367,1.0461,2.1072,0.0793,0.3246,1.587,0.2272,2.8755],
}; 