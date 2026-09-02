import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type BaseController from '@/shared/controllers/BaseController';
import type BaseGateway from '@/shared/gateways/BaseGateway';
import type BaseQueue from '@/shared/queues/BaseQueue';

export interface MountedController{
    prefix: string;
    Controller: new () => BaseController;
}

export interface Discovered{
    controllers: MountedController[];
    entities: Function[];
    events: Array<new () => object>;
    queues: Array<new () => BaseQueue<unknown>>;
    gateways: Array<new () => BaseGateway>;
}

export default class ModuleDiscovery{
    readonly #modulesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'modules');

    async discover(): Promise<Discovered>{
        const moduleNames = (await readdir(this.#modulesDir, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();

        const discovered: Discovered = {
            controllers: [],
            entities: [],
            events: [],
            queues: [],
            gateways: []
        };

        for(const name of moduleNames){
            for(const Controller of await this.#loadDefaults<new () => BaseController>(name, 'controllers')){
                discovered.controllers.push({ prefix: `/${name}`, Controller });
            }
            discovered.entities.push(...await this.#loadDefaults<Function>(name, 'models'));
            discovered.events.push(...await this.#loadDefaults<new () => object>(name, 'events'));
            discovered.queues.push(...await this.#loadDefaults<new () => BaseQueue<unknown>>(name, 'queues'));
            discovered.gateways.push(...await this.#loadDefaults<new () => BaseGateway>(name, 'gateways'));
        }

        return discovered;
    }

    async #loadDefaults<T>(moduleName: string, category: string): Promise<T[]>{
        const dir = join(this.#modulesDir, moduleName, category);

        let files: string[];
        try{
            files = await readdir(dir);
        }catch{
            return [];
        }

        const loaded: T[] = [];
        for(const file of files.sort()){
            if(!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
            const imported = await import(pathToFileURL(join(dir, file)).href) as { default?: T };
            if(imported.default) loaded.push(imported.default);
        }
        return loaded;
    }
}
