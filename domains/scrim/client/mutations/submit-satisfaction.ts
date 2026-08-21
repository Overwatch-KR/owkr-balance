import type { BoundraCallOptions, BoundraClient } from 'boundra';

import {
  submitSatisfactionMutation,
  type SubmitSatisfactionMutationInput,
} from '../../shared/contracts/submit-satisfaction.js';

export function submitSatisfaction(
  client: BoundraClient,
  input: SubmitSatisfactionMutationInput,
  options?: BoundraCallOptions,
) {
    return client.mutation(submitSatisfactionMutation, input, options);
}
