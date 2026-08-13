import type { BoundraCallOptions, BoundraClient } from 'boundra';

import {
  getPublicParticipationQuery,
  type GetPublicParticipationQueryInput,
  type GetPublicParticipationQueryResult,
} from '../../shared/contracts/get-public-participation';

export function getPublicParticipation(
  client: BoundraClient,
  input: GetPublicParticipationQueryInput,
  options?: BoundraCallOptions,
): Promise<GetPublicParticipationQueryResult> {
    return client.query(getPublicParticipationQuery, input, options);
}
