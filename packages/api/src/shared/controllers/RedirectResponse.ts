export default class RedirectResponse{
    constructor(readonly url: string, readonly status: number = 302){}
}
