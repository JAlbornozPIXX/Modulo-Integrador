import ClassMetadata from '@/shared/utils/ClassMetadata';
import { HttpMethod, RouteDefinition } from '@/shared/contracts/routing';
import type { Endpoint } from '@app/contracts/shared/routing';

const routesByController = new ClassMetadata<RouteDefinition>();

export const Route = <I, O>(route: string | Endpoint<I, O>, method: string = 'GET'): MethodDecorator => {
    return (target, handlerName) => {
        const definition = typeof route === 'string'
            ? { path: route, method: method.toUpperCase() as HttpMethod, absolute: false }
            : { path: route.path, method: route.method, absolute: true };

        routesByController.append(target.constructor, { ...definition, handlerName });
    };
};

export const getRoutes = (ctor: object): RouteDefinition[] => {
    return routesByController.get(ctor);
};
