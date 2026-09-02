import { randomBytes } from 'node:crypto';

const COUNTER_LIMIT = 0x1000;

let lastMillisecond = 0;
let counter = 0;

const nextCounter = (millisecond: number): number => {
    if(millisecond !== lastMillisecond){
        lastMillisecond = millisecond;
        counter = randomBytes(2).readUInt16BE(0) % (COUNTER_LIMIT >> 1);
        return counter;
    }
    counter += 1;
    return counter;
};

export const uuidv7 = (): string => {
    let millisecond = Date.now();
    let sequence = nextCounter(millisecond);

    while(sequence >= COUNTER_LIMIT){
        millisecond += 1;
        lastMillisecond = 0;
        sequence = nextCounter(millisecond);
    }

    const timestamp = millisecond.toString(16).padStart(12, '0');
    const tail = randomBytes(8);
    tail[0] = (tail[0]! & 0x3f) | 0x80;

    return [
        timestamp.slice(0, 8),
        timestamp.slice(8, 12),
        `7${sequence.toString(16).padStart(3, '0')}`,
        tail.subarray(0, 2).toString('hex'),
        tail.subarray(2, 8).toString('hex')
    ].join('-');
};

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';
