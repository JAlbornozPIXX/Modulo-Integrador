import RuntimeError from './RuntimeError';
import type { ErrorTable } from '@app/contracts/shared/errors';

type ErrorFactory = (detail?: string) => RuntimeError;

export const defineErrors = <T extends ErrorTable>({ domain, causes }: T): Record<keyof T['causes'], ErrorFactory> => {
    const factories = {} as Record<keyof T['causes'], ErrorFactory>;
    for(const [cause, status] of Object.entries(causes)){
        factories[cause as keyof T['causes']] = (detail?: string) => {
            const code = detail === undefined ? `${domain}::${cause}` : `${domain}::${cause}:${detail}`;
            return new RuntimeError(code, status);
        };
    }
    return factories;
};
