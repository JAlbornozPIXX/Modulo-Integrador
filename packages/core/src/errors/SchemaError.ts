import { defineErrors } from '../defineErrors';

export const SchemaError = defineErrors({
    domain: 'Schema',
    causes: {
        PendingMigrations: 500,
        Irreversible: 500
    }
});
