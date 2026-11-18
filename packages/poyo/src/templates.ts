import { toComponentName } from "./naming.js";

export function defaultSeo(name: string): {
	title: string;
	description: string;
} {
	return { title: name, description: `Page for ${name}` };
}

export function pageTemplate(name: string): string {
	const component = toComponentName(name);
	return `import type React from 'react';

const ${component}: React.FC = () => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{${JSON.stringify(name)}}</h1>
    </div>
  );
}

export default ${component};
`;
}

export function viewTemplate(name: string): string {
	return `@{
    ViewBag.Title = "${name}";
}

<div id="react-root" data-page-name="${name}"></div>
`;
}

export function controllerTemplate(
	serverNamespace: string,
	controllerName: string,
	actionName: string,
): string {
	return `using Microsoft.AspNetCore.Mvc;
using Poyo.Framework;

namespace ${serverNamespace}.Controllers;

public class ${controllerName} : Controller
{
    public IActionResult ${actionName}()
    {
        return this.PoyoPage(null);
    }
}
`;
}

export function actionTemplate(actionName: string): string {
	return `
    public IActionResult ${actionName}()
    {
        return this.PoyoPage(null);
    }
`;
}
