export const LOGIN_BACKGROUND_IMAGES = [
    'background/kiriko.jpg',
    'background/le-sserafim.jpg',
    'background/quest-watch.jpg',
] as const;

export const LOGIN_BACKGROUND_ROTATION_INTERVAL_MS = 12_000;

export const pickRandomBackgroundIndex = (currentIndex?: number): number => {
    const candidateCount = currentIndex === undefined
        ? LOGIN_BACKGROUND_IMAGES.length
        : LOGIN_BACKGROUND_IMAGES.length - 1;
    const candidateIndex = Math.floor(Math.random() * candidateCount);

    if (currentIndex === undefined || candidateIndex < currentIndex) {
        return candidateIndex;
    }

    return candidateIndex + 1;
};
