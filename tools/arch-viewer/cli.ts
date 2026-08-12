export async function run(argv: readonly string[]): Promise<number> {
    if (argv.includes("--help")) {
        console.log("arch [--port <number>] [--no-open] [--once]");
        return 0;
    }
    console.error("arch server is not available yet");
    return 1;
}

if (import.meta.main) {
    process.exit(await run(process.argv.slice(2)));
}
