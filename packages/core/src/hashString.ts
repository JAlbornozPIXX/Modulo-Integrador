const OFFSET_BASIS = 0x811c9dc5;
const PRIME = 0x01000193;

export const hashString = (value: string): number => {
    let hashed = OFFSET_BASIS;
    for(let index = 0; index < value.length; index += 1){
        hashed ^= value.charCodeAt(index);
        hashed = Math.imul(hashed, PRIME);
    }
    return hashed >>> 0;
};
