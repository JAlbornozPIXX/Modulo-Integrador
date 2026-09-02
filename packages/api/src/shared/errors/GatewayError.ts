import { GatewayErrors } from '@app/contracts/shared/errors';
import { defineErrors } from '@app/core/defineErrors';

export const GatewayError = defineErrors(GatewayErrors);
