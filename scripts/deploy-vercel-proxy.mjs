// Compatibility entry point; all deployments use the scoped CLI wrapper.
process.argv = [process.argv[0], process.argv[1], 'deploy', '--prod', '--yes'];
await import('./vercel.mjs');
