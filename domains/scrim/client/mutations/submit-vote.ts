import type { BoundraCallOptions, BoundraClient } from 'boundra';

import {
  submitVoteMutation,
  type SubmitVoteMutationInput,
} from '../../shared/contracts/submit-vote.js';

export function submitVote(
  client: BoundraClient,
  input: SubmitVoteMutationInput,
  options?: BoundraCallOptions,
) {
    return client.mutation(submitVoteMutation, input, options);
}
