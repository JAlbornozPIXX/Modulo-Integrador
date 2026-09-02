import { RateLimitErrors } from '@app/contracts/shared/errors';
import { defineErrors } from '@app/core/defineErrors';

export const RateLimitError = defineErrors(RateLimitErrors);
