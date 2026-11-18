/**
 * pnpm forwards a literal `--` between the script's own arguments and the
 * user's (`poyo route add` plus `-- /GuestPage`). That token is pnpm's, not
 * the command's, so it must not reach commander as an end-of-options marker.
 * Only the first one is pnpm's: a `--` deeper in the list is an argument the
 * caller passed on purpose, and dropping it would silently change the call.
 */
export function stripPnpmSeparator(args: string[]): string[] {
	const separatorIndex = args.indexOf("--");
	if (separatorIndex === -1) return args;
	return [...args.slice(0, separatorIndex), ...args.slice(separatorIndex + 1)];
}
