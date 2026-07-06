// The app is served at ronanprugh.com/espn-fantasy-stats through a proxy
// rewrite on the portfolio site (and at the same path on the bare
// espn-fantasy-stats.vercel.app domain, via vercel.json rewrites). Root
// -relative URLs — router routes, API fetches — must carry this prefix
// because neither react-router nor fetch() knows about it.
//
// Keep in sync with `base` in vite.config.ts and the paths in vercel.json.
export const BASE_PATH = '/espn-fantasy-stats'
