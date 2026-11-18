import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { confirm } from "@inquirer/prompts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { removeCommand } from "../src/commands/route-remove.js";
import { getPaths } from "../src/config.js";
import { deleteRouteFiles } from "../src/scaffold.js";
import { controllerTemplate } from "../src/templates.js";
import {
	execInFixture,
	existsFixtureFile,
	makeFixture,
	type Route,
	readFixtureFile,
	writeFixtureFile,
} from "./helpers.js";

vi.mock("@inquirer/prompts", () => ({ confirm: vi.fn() }));

const starter: Route[] = [
	{
		path: "/About",
		name: "About",
		files: {
			react: "src/pages/About/index.page.tsx",
			view: "Views/About/Index.cshtml",
		},
		access: "protected",
	},
	{
		path: "/Reports",
		name: "Reports",
		files: {
			react: "src/pages/Reports/index.page.tsx",
			view: "Views/Reports/Index.cshtml",
		},
		access: "protected",
		controller: "Reports",
		action: "Index",
	},
];

/** A controller the CLI could have written for two routes, in its exact shape. */
function twoActionController(first: string, second: string): string {
	const base = controllerTemplate("Poyo.Server", "ReportsController", first);
	const lastBrace = base.lastIndexOf("}");
	return `${base.slice(0, lastBrace)}\n    public IActionResult ${second}()
    {
        return this.PoyoPage(null);
    }
${base.slice(lastBrace)}`;
}

function fixtureWithFiles(): ReturnType<typeof makeFixture> {
	const fixture = makeFixture(starter);
	for (const route of starter) {
		writeFixtureFile(
			fixture,
			`poyo.client/${route.files.react}`,
			"export default () => null;\n",
		);
		writeFixtureFile(
			fixture,
			`Poyo.Server/${route.files.view}`,
			'<div id="react-root"></div>\n',
		);
	}
	if (starter.find((r) => r.controller)) {
		// The real shape `route add --controller` writes. A controller the CLI
		// did not author must never be deleted, so the fixture that expects a
		// delete has to carry a scaffolded one.
		const reports = starter.find((r) => r.controller);
		writeFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
			controllerTemplate(
				"Poyo.Server",
				"ReportsController",
				reports?.action ?? "Index",
			),
		);
	}
	return fixture;
}

describe("poyo route remove", () => {
	it("removes the route from routes.json and deletes files with --yes", () => {
		const fixture = fixtureWithFiles();
		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/About",
			"--yes",
		]);

		expect(result.status).toBe(0);
		expect(fixture.routesJson().map((r) => r.path)).toEqual(["/Reports"]);
		expect(
			existsFixtureFile(fixture, "poyo.client/src/pages/About/index.page.tsx"),
		).toBe(false);
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/About/Index.cshtml"),
		).toBe(false);
	});

	it("deletes a scaffolded controller with --yes when no other route uses it", () => {
		const fixture = fixtureWithFiles();
		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/Reports",
			"--yes",
		]);

		expect(result.status).toBe(0);
		expect(
			existsFixtureFile(
				fixture,
				"Poyo.Server/Controllers/ReportsController.cs",
			),
		).toBe(false);
		expect(result.stdout).toContain("Deleted controller");
	});

	it("keeps a controller another route still uses, and says so", () => {
		const fixture = makeFixture([]);
		execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"Reports",
			"--action",
			"Index",
		]);
		execInFixture(fixture, [
			"route",
			"add",
			"/Reports/Detail",
			"--controller",
			"Reports",
			"--action",
			"Detail",
		]);

		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/Reports",
			"--yes",
		]);

		expect(result.status).toBe(0);
		expect(fixture.routesJson().map((r) => r.path)).toEqual([
			"/Reports/Detail",
		]);
		const controller = readFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
		);
		expect(controller).toContain("public IActionResult Index()");
		expect(controller).toContain("public IActionResult Detail()");
		expect(result.stdout).toContain("Kept controller");
		expect(result.stdout).toContain(
			"Poyo.Server/Controllers/ReportsController.cs",
		);
		expect(result.stdout).toContain("/Reports/Detail");
		expect(result.stdout).toContain("Index action is left in place");
	});

	it("treats a legacy controller spelling as sharing the same controller", () => {
		const fixture = makeFixture([
			{
				path: "/Reports",
				name: "Reports",
				files: {
					react: "src/pages/Reports/index.page.tsx",
					view: "Views/Reports/Index.cshtml",
				},
				access: "protected",
				controller: "Reports",
				action: "Index",
			},
			{
				path: "/Reports/Detail",
				name: "ReportsDetail",
				files: {
					react: "src/pages/Reports/Detail/index.page.tsx",
					view: "Views/Reports/Detail/Index.cshtml",
				},
				access: "protected",
				controller: "ReportsController",
				action: "Detail",
			},
		]);
		for (const route of fixture.routesJson()) {
			writeFixtureFile(
				fixture,
				`poyo.client/${route.files.react}`,
				"export default () => null;\n",
			);
			writeFixtureFile(
				fixture,
				`Poyo.Server/${route.files.view}`,
				'<div id="react-root"></div>\n',
			);
		}
		writeFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
			twoActionController("Index", "Detail"),
		);

		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/Reports",
			"--yes",
		]);

		expect(result.status).toBe(0);
		expect(
			existsFixtureFile(
				fixture,
				"Poyo.Server/Controllers/ReportsController.cs",
			),
		).toBe(true);
		expect(result.stdout).toContain("Kept controller");
		expect(result.stdout).toContain("/Reports/Detail");
	});

	it("reports a controller file it could not find", () => {
		const fixture = makeFixture([
			{
				path: "/Reports",
				name: "Reports",
				files: {
					react: "src/pages/Reports/index.page.tsx",
					view: "Views/Reports/Index.cshtml",
				},
				access: "protected",
				controller: "Reports",
				action: "Index",
			},
		]);
		writeFixtureFile(
			fixture,
			"poyo.client/src/pages/Reports/index.page.tsx",
			"export default () => null;\n",
		);
		writeFixtureFile(
			fixture,
			"Poyo.Server/Views/Reports/Index.cshtml",
			'<div id="react-root"></div>\n',
		);

		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/Reports",
			"--yes",
		]);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(
			"Controller not found: Poyo.Server/Controllers/ReportsController.cs",
		);
	});

	it("deletes a scaffolded controller once its last route is removed", () => {
		const fixture = makeFixture([]);
		execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"Reports",
			"--action",
			"Index",
		]);
		execInFixture(fixture, [
			"route",
			"add",
			"/Reports/Detail",
			"--controller",
			"Reports",
			"--action",
			"Detail",
		]);
		execInFixture(fixture, ["route", "remove", "/Reports", "--yes"]);

		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/Reports/Detail",
			"--yes",
		]);

		expect(result.status).toBe(0);
		expect(
			existsFixtureFile(
				fixture,
				"Poyo.Server/Controllers/ReportsController.cs",
			),
		).toBe(false);
		expect(result.stdout).toContain("Deleted controller");
	});

	it("never deletes a controller holding an action the CLI did not scaffold", () => {
		const fixture = fixtureWithFiles();
		const scaffolded = controllerTemplate(
			"Poyo.Server",
			"ReportsController",
			"Index",
		);
		writeFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
			scaffolded.replace(
				"\n}\n",
				'\n    public IActionResult Export()\n    {\n        return Content("csv");\n    }\n}\n',
			),
		);

		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/Reports",
			"--yes",
		]);

		expect(result.status).toBe(0);
		const controller = readFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
		);
		expect(controller).toContain("public IActionResult Export()");
		expect(result.stdout).toContain("Kept controller");
		expect(result.stdout).toContain("did not scaffold");
	});

	it("never deletes a controller the CLI did not write", () => {
		const fixture = fixtureWithFiles();
		writeFixtureFile(
			fixture,
			"Poyo.Server/Controllers/ReportsController.cs",
			`using Microsoft.AspNetCore.Mvc;

namespace Poyo.Server.Controllers;

public class ReportsController : Controller
{
    public IActionResult Index()
    {
        return View();
    }
}
`,
		);

		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/Reports",
			"--yes",
		]);

		expect(result.status).toBe(0);
		expect(
			existsFixtureFile(
				fixture,
				"Poyo.Server/Controllers/ReportsController.cs",
			),
		).toBe(true);
		expect(result.stdout).toContain("Kept controller");
	});

	it("does not offer to delete a controller another route uses", async () => {
		const fixture = makeFixture([]);
		execInFixture(fixture, [
			"route",
			"add",
			"/Reports",
			"--controller",
			"Reports",
			"--action",
			"Index",
		]);
		execInFixture(fixture, [
			"route",
			"add",
			"/Reports/Detail",
			"--controller",
			"Reports",
			"--action",
			"Detail",
		]);
		const cwd = process.cwd();
		vi.mocked(confirm).mockResolvedValue(false);

		try {
			process.chdir(fixture.dir);
			await removeCommand().parseAsync(["/Reports"], {
				from: "user",
			});
		} finally {
			process.chdir(cwd);
		}

		expect(vi.mocked(confirm)).toHaveBeenCalledTimes(1);
		expect(
			existsFixtureFile(
				fixture,
				"Poyo.Server/Controllers/ReportsController.cs",
			),
		).toBe(true);
	});

	it("keeps files on disk and reports orphans with --keep-files", () => {
		const fixture = fixtureWithFiles();
		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/About",
			"--keep-files",
		]);

		expect(result.status).toBe(0);
		expect(fixture.routesJson().map((r) => r.path)).toEqual(["/Reports"]);
		expect(
			existsFixtureFile(fixture, "poyo.client/src/pages/About/index.page.tsx"),
		).toBe(true);
		expect(result.stdout).toContain("Orphaned files kept");
		expect(result.stdout).toContain("src/pages/About/index.page.tsx");
	});

	it("matches routes with or without a leading slash", () => {
		const fixture = fixtureWithFiles();
		execInFixture(fixture, ["route", "remove", "About", "--yes"]);
		expect(fixture.routesJson().map((r) => r.path)).toEqual(["/Reports"]);
	});

	it("errors for a route that does not exist", () => {
		const fixture = fixtureWithFiles();
		const result = execInFixture(fixture, ["route", "remove", "/Nope"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Route not found");
	});
	it("re-emits the route manifest after removing a route", () => {
		const fixture = fixtureWithFiles();
		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/About",
			"--keep-files",
		]);

		expect(result.status).toBe(0);
		const manifest = readFixtureFile(
			fixture,
			"poyo.client/routes.generated.ts",
		);
		expect(manifest).not.toContain("About");
		expect(manifest).toContain('names: "Reports";');
		expect(manifest).toContain('paths: "/Reports";');
	});
	it("preserves dynamic: false on remaining routes after removing a route", () => {
		const fixture = makeFixture([
			{ ...starter[0], dynamic: false },
			starter[1],
		]);
		const result = execInFixture(fixture, [
			"route",
			"remove",
			"/Reports",
			"--keep-files",
		]);
		expect(result.status).toBe(0);
		const about = fixture.routesJson().find((r) => r.path === "/About");
		expect(about?.dynamic).toBe(false);
	});

	it("refuses a hand-edited registry whose view leaves the project", () => {
		const fixture = fixtureWithFiles();
		const victim = path.join(
			os.tmpdir(),
			`poyo-remove-victim-${process.pid}-${Date.now()}.cshtml`,
		);
		fs.writeFileSync(victim, "victim\n");
		const registry = fixture.routesJson();
		registry[0].files = {
			react: "src/pages/About/index.page.tsx",
			view: `../../${path.basename(victim)}`,
		};
		const before = `${JSON.stringify(registry, null, 2)}\n`;
		writeFixtureFile(fixture, "routes.json", before);

		try {
			const result = execInFixture(fixture, [
				"route",
				"remove",
				"/About",
				"--yes",
			]);

			expect(result.status).toBe(1);
			expect(result.stderr).toContain('".." segment');
			expect(result.stderr).toContain('"files.view"');
			expect(fs.existsSync(victim)).toBe(true);
			expect(readFixtureFile(fixture, "routes.json")).toBe(before);
			expect(
				existsFixtureFile(
					fixture,
					"poyo.client/src/pages/About/index.page.tsx",
				),
			).toBe(true);
		} finally {
			fs.rmSync(victim, { force: true });
		}
	});

	/**
	 * The registry reader refuses these paths, but the delete must not depend on
	 * having been read through it: this calls the remove seam directly with an
	 * unvalidated route, which is the state a caller can be in when the rule at
	 * the operation is all that stands between a registry entry and a file.
	 */
	it.each([
		[
			"react",
			(file: string) => ({
				react: file,
				view: "Views/About/Index.cshtml",
			}),
			"poyo.client/src/pages/About/index.page.tsx",
		],
		[
			"view",
			(file: string) => ({
				react: "src/pages/About/index.page.tsx",
				view: file,
			}),
			"Poyo.Server/Views/About/Index.cshtml",
		],
	])("refuses an outside %s path without a validated registry", (field, filesFor, sibling) => {
		const fixture = fixtureWithFiles();
		const paths = getPaths(fixture.dir);
		const victim = path.join(
			os.tmpdir(),
			`poyo-remove-victim-${field}-${process.pid}-${Date.now()}.txt`,
		);
		fs.writeFileSync(victim, "victim\n");

		try {
			expect(() =>
				deleteRouteFiles(paths, filesFor(`../../${path.basename(victim)}`), {
					files: true,
				}),
			).toThrow(/Refusing route file path/);

			expect(fs.existsSync(victim)).toBe(true);
			expect(existsFixtureFile(fixture, sibling)).toBe(true);
		} finally {
			fs.rmSync(victim, { force: true });
		}
	});

	/**
	 * The two prompts are answered separately: keeping the page and view while
	 * deleting the controller must not delete the files the operator said to
	 * keep. The command used to pass both decisions as one, so `--yes` semantics
	 * leaked into the interactive path.
	 */
	it("keeps the page and view when the operator deletes only the controller", async () => {
		const fixture = fixtureWithFiles();
		const cwd = process.cwd();
		vi.mocked(confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

		try {
			process.chdir(fixture.dir);
			await removeCommand().parseAsync(["/Reports"], {
				from: "user",
			});
		} finally {
			process.chdir(cwd);
		}

		expect(fixture.routesJson().map((r) => r.path)).toEqual(["/About"]);
		expect(
			existsFixtureFile(
				fixture,
				"Poyo.Server/Controllers/ReportsController.cs",
			),
		).toBe(false);
		expect(
			existsFixtureFile(
				fixture,
				"poyo.client/src/pages/Reports/index.page.tsx",
			),
		).toBe(true);
		expect(
			existsFixtureFile(fixture, "Poyo.Server/Views/Reports/Index.cshtml"),
		).toBe(true);
	});

	afterEach(() => {
		vi.mocked(confirm).mockReset();
	});
});
