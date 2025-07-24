import { Card, createEmptyCard, fsrs, generatorParameters, Rating, Grade, State, FSRSParameters as TsParams } from 'ts-fsrs';
import { FlashcardState, FSRSRating, FSRS_RATING, FSRSParameters } from './FSRSTypes';

export class FSRSAdapter {
  private fsrsInstance: ReturnType<typeof fsrs>;
  private params: TsParams;

  constructor(custom: Partial<FSRSParameters> = {}) {
    this.params = this.convertParams(custom);
    this.fsrsInstance = fsrs(this.params);
  }

  private convertParams(custom: Partial<FSRSParameters>): TsParams {
    return generatorParameters({
      request_retention: custom.request_retention ?? 0.9,
      maximum_interval: custom.maximum_interval ?? 36500,
      enable_fuzz: true,
      enable_short_term: true,
      w: custom.w && custom.w.length ? custom.w : [],
    });
  }

  toTsCard(card: FlashcardState): Card {
    if (!card.lastReview) {
      const now = new Date(card.nextReview || Date.now());
      return createEmptyCard(now);
    }
    let state = State.New;
    if (card.reviews > 0) state = card.lapses > 0 ? State.Relearning : State.Review;
    const elapsed = card.lastReview ? (Date.now() - card.lastReview) / 86400000 : 0;
    const sched = card.lastReview ? (card.nextReview - card.lastReview) / 86400000 : 0;
    return {
      due: new Date(card.nextReview),
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: elapsed,
      scheduled_days: sched,
      reps: card.reviews,
      lapses: card.lapses,
      state,
      last_review: card.lastReview ? new Date(card.lastReview) : undefined,
      learning_steps: 0,
    } as Card;
  }

  convertRating(r: FSRSRating): Rating {
    switch (r) {
      case FSRS_RATING.AGAIN: return Rating.Again;
      case FSRS_RATING.HARD: return Rating.Hard;
      case FSRS_RATING.GOOD: return Rating.Good;
      case FSRS_RATING.EASY: return Rating.Easy;
      default: return Rating.Good;
    }
  }

  fromTs(cardOld: FlashcardState, res: any): FlashcardState {
    const { card, log } = res;
    return {
      ...cardOld,
      difficulty: card.difficulty,
      stability: card.stability,
      lastReview: log.review.getTime(),
      nextReview: card.due.getTime(),
      reviews: card.reps,
      lapses: card.lapses,
    };
  }

  initializeCard(): FlashcardState {
    const now = Date.now();
    const empty = createEmptyCard(new Date(now));
    return {
      difficulty: empty.difficulty,
      stability: empty.stability,
      lastReview: 0,
      nextReview: now,
      reviews: 0,
      lapses: 0,
    };
  }

  review(cardState: FlashcardState, rating: FSRSRating): FlashcardState {
    const tsCard = this.toTsCard(cardState);
    const result = this.fsrsInstance.next(tsCard, new Date(), this.convertRating(rating) as Grade);
    return this.fromTs(cardState, result);
  }

  predict(cardState: FlashcardState) {
    const tsCard = this.toTsCard(cardState);
    const rec = this.fsrsInstance.repeat(tsCard, new Date());
    return rec;
  }

  isDue(card: FlashcardState) {
    return Date.now() >= card.nextReview;
  }

  updateParams(p: Partial<FSRSParameters>) {
    this.params = this.convertParams(p);
    this.fsrsInstance = fsrs(this.params);
  }
} 