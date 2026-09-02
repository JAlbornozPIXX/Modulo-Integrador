export default class RawResponse{
    constructor(
        readonly body: string,
        readonly contentType: string,
        readonly status: number = 200
    ){}
}
