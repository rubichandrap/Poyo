export function defaultSeo(name: string): {
	title: string;
	description: string;
} {
	return { title: name, description: `Page for ${name}` };
}

export function pageTemplate(name: string): string {
	const component = name.split("/").pop();
	return `import type React from 'react';

const ${component}: React.FC = () => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">${name}</h1>
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
	viewPath: string,
): string {
	return `using Microsoft.AspNetCore.Mvc;

namespace ${serverNamespace}.Controllers;

public class ${controllerName} : Controller
{
    public IActionResult ${actionName}()
    {
        return View("~/${viewPath}");
    }
}
`;
}

export function actionTemplate(actionName: string, viewPath: string): string {
	return `
    public IActionResult ${actionName}()
    {
        return View("~/${viewPath}");
    }
`;
}
