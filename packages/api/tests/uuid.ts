export const uuid = (seed: number): string =>
    `00000000-0000-7000-8000-${seed.toString(16).padStart(12, '0')}`;
