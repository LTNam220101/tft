export const getImageUrl = (path?: string): string => {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    const cleanPath = path.toLowerCase().replace("/lol-game-data/assets/", "");
    return `${(import.meta as any).env.VITE_CDRAGON_PATCH}/${cleanPath}`;
};

export const getSummonerIconUrl = (profileIconId: number): string =>
    `${(import.meta as any).env.VITE_CDRAGON_PATCH}/v1/profile-icons/${profileIconId}.jpg`;
