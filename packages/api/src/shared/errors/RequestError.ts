import { RequestErrors } from '@app/contracts/shared/errors';
import { defineErrors } from '@app/core/defineErrors';

export const RequestError = defineErrors(RequestErrors);
