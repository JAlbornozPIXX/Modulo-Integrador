import { defineErrors } from '@app/core/defineErrors';

export const EventError = defineErrors({
    domain: 'Events',
    causes: {
        UndefinedGroup: 500
    }
});
