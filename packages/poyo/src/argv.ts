/**
 * pnpm forwards a literal `--` between the script's own arguments and the
 * user's (`poyo route add` plus `-- /GuestPage`; pnpm@9.15.9 runs the script
 * as `… route add -- /GuestPage --guest`). That token is pnpm's, not the
 * command's, so it must not reach commander as an end-of-options marker. It
 * is the *first* `--` in the list, not the first argument: the script's own
 * words come before it. Any `--` after that one is an argument the caller
 * passed on purpose, and dropping it would silently change the call.
 */
export function stripPnpmSeparator(args: string[]): string[] {
	const separatorIndex = args.indexOf("--");
	if (separatorIndex === -1) return args;
	return [...args.slice(0, separatorIndex), ...args.slice(separatorIndex + 1)];
}
