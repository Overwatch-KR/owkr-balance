import { requireDraft } from './model.js';

/** @description 저장할 난수 테이프만 소비하며 부족한 난수를 임의로 만들지 않는다. */
export class DraftRandom {
  private cursor = 0;
  private readonly consumed: number[] = [];

  constructor(private readonly entropy: readonly number[]) {}

  index(size: number): number {
    requireDraft(Number.isSafeInteger(size) && size > 0, 'EMPTY_DRAW', '추첨 대상이 없습니다.');
    if (size === 1) return 0;
    const value = this.entropy[this.cursor++];
    requireDraft(Number.isFinite(value) && value >= 0 && value < 1,
      'INVALID_ENTROPY', '저장 가능한 난수 값이 부족하거나 올바르지 않습니다.');
    this.consumed.push(value);
    return Math.floor(value * size);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.index(items.length)];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const target = this.index(index + 1);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  get draws(): readonly number[] {
    return [...this.consumed];
  }
}
