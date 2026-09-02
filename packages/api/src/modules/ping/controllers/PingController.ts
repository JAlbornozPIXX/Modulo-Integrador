import BaseController from '@/shared/controllers/BaseController';
import { Route } from '@/shared/controllers/Route';
import { Body } from '@/shared/controllers/RequestParams';
import type { tags } from 'typia';

interface CreatePingInput{
    label: string & tags.MinLength<3>;
    email: string & tags.Format<'email'>;
}

export default class PingController extends BaseController{
    @Route('/')
    ping(){
        return { pong: true };
    }

    @Route('/', 'POST')
    create(@Body() input: CreatePingInput){
        return { echoed: input.label };
    }
}
