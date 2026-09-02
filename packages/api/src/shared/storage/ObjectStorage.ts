import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand, PutBucketCorsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { config } from '@/shared/config';
import { logger } from '@/shared/utils/Logger';

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface StoredObject{
    key: string;
    size: number;
    modifiedAt: Date;
}

export interface StoredPage{
    objects: StoredObject[];
    folders: string[];
    cursor: string | null;
}

export interface StoredStat{
    size: number;
    modifiedAt: Date;
    contentType: string | null;
    cacheControl: string | null;
    etag: string | null;
}

export interface ListOptions{
    grouped: boolean;
    limit: number;
    cursor?: string;
}

class ObjectStorage{
    #client = new S3Client({
        endpoint: config.storage.endpoint,
        region: config.storage.region,
        forcePathStyle: true,
        credentials: {
            accessKeyId: config.storage.accessKey,
            secretAccessKey: config.storage.secretKey
        }
    });
    #ensured?: Promise<void>;

    put(key: string, body: string | Uint8Array, contentType: string){
        return this.#write(key, body, contentType);
    }

    putImmutable(key: string, body: string | Uint8Array, contentType: string){
        return this.#write(key, body, contentType, IMMUTABLE_CACHE_CONTROL);
    }

    async get(key: string): Promise<Buffer>{
        await this.#ensureBucket();
        const found = await this.#client.send(new GetObjectCommand({
            Bucket: config.storage.bucket,
            Key: key
        }));

        logger.debug(key, { scope: 'storage.get' });
        return Buffer.from(await found.Body!.transformToByteArray());
    }

    async list(prefix: string, options: ListOptions): Promise<StoredPage>{
        await this.#ensureBucket();
        const page = await this.#client.send(new ListObjectsV2Command({
            Bucket: config.storage.bucket,
            Prefix: prefix === '' ? undefined : prefix,
            Delimiter: options.grouped ? '/' : undefined,
            MaxKeys: options.limit,
            ContinuationToken: options.cursor
        }));

        return {
            objects: (page.Contents ?? []).map((object) => ({
                key: object.Key!,
                size: object.Size ?? 0,
                modifiedAt: object.LastModified!
            })),
            folders: (page.CommonPrefixes ?? []).map((common) => common.Prefix!),
            cursor: page.NextContinuationToken ?? null
        };
    }

    async stat(key: string): Promise<StoredStat | null>{
        await this.#ensureBucket();

        try{
            const head = await this.#client.send(new HeadObjectCommand({
                Bucket: config.storage.bucket,
                Key: key
            }));

            return {
                size: head.ContentLength ?? 0,
                modifiedAt: head.LastModified!,
                contentType: head.ContentType ?? null,
                cacheControl: head.CacheControl ?? null,
                etag: head.ETag ?? null
            };
        }catch{
            return null;
        }
    }

    async exists(key: string): Promise<boolean>{
        await this.#ensureBucket();

        try{
            await this.#client.send(new HeadObjectCommand({
                Bucket: config.storage.bucket,
                Key: key
            }));

            return true;
        }catch{
            return false;
        }
    }

    async delete(key: string){
        await this.#ensureBucket();
        await this.#client.send(new DeleteObjectCommand({
            Bucket: config.storage.bucket,
            Key: key
        }));
        logger.debug(key, { scope: 'storage.delete' });
    }

    publicUrl(key: string): string{
        return `${config.storage.publicUrl}/${config.storage.bucket}/${key}`;
    }

    async #write(key: string, body: string | Uint8Array, contentType: string, cacheControl?: string){
        await this.#ensureBucket();
        await this.#client.send(new PutObjectCommand({
            Bucket: config.storage.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: cacheControl
        }));
        logger.debug(key, { scope: 'storage.put' });
    }

    #ensureBucket(){
        this.#ensured ??= this.#headOrCreate().catch((error) => {
            this.#ensured = undefined;
            throw error;
        });
        return this.#ensured;
    }

    async #headOrCreate(){
        try{
            await this.#client.send(new HeadBucketCommand({ Bucket: config.storage.bucket }));
        }catch{
            await this.#client.send(new CreateBucketCommand({ Bucket: config.storage.bucket }));
            await this.#setPublicReadPolicy();
        }

        await this.#allowBrowserReads();
    }

    async #allowBrowserReads(){
        await this.#client.send(new PutBucketCorsCommand({
            Bucket: config.storage.bucket,
            CORSConfiguration: {
                CORSRules: [{
                    AllowedMethods: ['GET', 'HEAD'],
                    AllowedOrigins: ['*'],
                    AllowedHeaders: ['*'],
                    ExposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
                    MaxAgeSeconds: 3600
                }]
            }
        }));
    }

    async #setPublicReadPolicy(){
        const policy = {
            Version: '2012-10-17',
            Statement: [{
                Sid: 'PublicRead',
                Effect: 'Allow',
                Principal: '*',
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${config.storage.bucket}/*`]
            }]
        };
        await this.#client.send(new PutBucketPolicyCommand({
            Bucket: config.storage.bucket,
            Policy: JSON.stringify(policy)
        }));
    }
}

export const objectStorage = new ObjectStorage();
