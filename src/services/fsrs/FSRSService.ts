import { FSRSAdapter } from './FSRSAdapter';
import { DEFAULT_FSRS_PARAMETERS, FSRSParameters, FSRSRating, FlashcardState } from './FSRSTypes';

export class FSRSService {
  private adapter: FSRSAdapter;
  private params: FSRSParameters;

  constructor(params: Partial<FSRSParameters> = {}) {
    this.params = { ...DEFAULT_FSRS_PARAMETERS, ...params };
    this.adapter = new FSRSAdapter(this.params);
  }

  initializeCard(): FlashcardState {
    return this.adapter.initializeCard();
  }

  review(card: FlashcardState, rating: FSRSRating): FlashcardState {
    return this.adapter.review(card, rating);
  }

  isDue(card: FlashcardState) {
    return this.adapter.isDue(card);
  }

  setParameters(p: Partial<FSRSParameters>) {
    this.params = { ...this.params, ...p };
    this.adapter.updateParams(this.params);
  }

  getParameters() {
    return { ...this.params };
  }
} 