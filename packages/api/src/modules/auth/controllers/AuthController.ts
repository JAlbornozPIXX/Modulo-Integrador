import BaseController from '@/shared/controllers/BaseController';
import { Route } from '@/shared/controllers/Route';
import { Status } from '@/shared/controllers/Status';
import { Body } from '@/shared/controllers/RequestParams';
import { Middleware } from '@/shared/middlewares/Middleware';
import { RateLimit } from '@/shared/middlewares/RateLimit';
import type { SignInInput, SignUpInput } from '@app/contracts/modules/auth/http';
import { authRoutes } from '@app/contracts/modules/auth/routes';
import AuthService from '../services/AuthService';
import { AuthenticatedRoute } from '../middlewares/AuthenticatedRoute';
import { CurrentUser } from '../middlewares/CurrentUser';

export default class AuthController extends BaseController{
    #service = new AuthService();

    @Route(authRoutes.signUp)
    @RateLimit({ max: 5, window: '1h' })
    @Status(201)
    signUp(@Body() body: SignUpInput){
        return this.#service.signUp(body);
    }

    @Route(authRoutes.signIn)
    @RateLimit({ max: 5, window: '1m' })
    signIn(@Body() body: SignInInput){
        return this.#service.signIn(body);
    }

    @Route(authRoutes.me)
    @Middleware(AuthenticatedRoute)
    me(@CurrentUser() userId: string){
        return this.#service.currentUser(userId);
    }
}
