import { defineErrors } from '@app/core/defineErrors';

export const RouteError = defineErrors({
    domain: 'Route',
    causes: {
        PrefixMismatch: 500
    }
});
