import { AsyncLocalStorage } from 'node:async_hooks';

class AbortScope{
    #storage = new AsyncLocalStorage<AbortSignal>();

    run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T>{
        return this.#storage.run(signal, work);
    }

    signal(): AbortSignal | undefined{
        return this.#storage.getStore();
    }
}

export const abortScope = new AbortScope();
