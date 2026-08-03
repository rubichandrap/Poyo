import { Command } from "commander";
import { addCommand } from "./route-add.js";
import { removeCommand } from "./route-remove.js";
import { syncCommand } from "./route-sync.js";
import { updateCommand } from "./route-update.js";

export async function run(args: string[]): Promise<void> {
	const program = new Command("poyo route")
		.description("Manage the routes registry")
		.addCommand(addCommand())
		.addCommand(updateCommand())
		.addCommand(removeCommand())
		.addCommand(syncCommand());
	await program.parseAsync(args, { from: "user" });
}
