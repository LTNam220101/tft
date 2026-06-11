// Convex V8 runtime exposes process.env for environment variables
declare const process: {
    env: Record<string, string | undefined>;
};
