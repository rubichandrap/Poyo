package scaffold

import (
	"fmt"
	"strings"
)

func ReactPage(name string) string {
	component := name
	if strings.Contains(name, "/") {
		parts := strings.Split(name, "/")
		component = parts[len(parts)-1]
	}

	return fmt.Sprintf(`import type React from 'react';

const %s: React.FC = () => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">%s</h1>
    </div>
  );
}

export default %s;
`, component, name, component)
}

func MVCView(name string) string {
	return fmt.Sprintf(`@{
    ViewBag.Title = "%s";
}

<div id="react-root" data-page-name="%s"></div>
`, name, name)
}

func ControllerTemplate(ctrl, action, view string) string {
	return fmt.Sprintf(`using Microsoft.AspNetCore.Mvc;

namespace Poyo.Server.Controllers;

public class %s : Controller
{
    public IActionResult %s()
    {
        return View("~/%s");
    }
}
`, ctrl, action, view)
}

func ActionTemplate(action, view string) string {
	return fmt.Sprintf(`
    public IActionResult %s()
    {
        return View("~/%s");
    }
`, action, view)
}
