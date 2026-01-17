package routes

import (
	"encoding/json"
	"os"
	"sort"
	"strings"
)

type Files struct {
	React string `json:"react"`
	View  string `json:"view"`
}

type Route struct {
	Path        string            `json:"path"`
	Name        string            `json:"name"`
	Files       Files             `json:"files"`
	IsPublic    bool              `json:"isPublic,omitempty"`
	IsGuestOnly bool              `json:"isGuestOnly,omitempty"`
	Controller  string            `json:"controller,omitempty"`
	Action      string            `json:"action,omitempty"`
	SEO         map[string]string `json:"seo,omitempty"`
}

func Read(path string) ([]Route, error) {
	if _, err := os.Stat(path); err != nil {
		return []Route{}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var routes []Route
	if err := json.Unmarshal(data, &routes); err != nil {
		return nil, err
	}
	return routes, nil
}

func Write(path string, routes []Route) error {
	sort.Slice(routes, func(i, j int) bool {
		return routes[i].Path < routes[j].Path
	})

	data, err := json.MarshalIndent(routes, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, append(data, '\n'), 0644)
}

func ResolvePaths(name string, isFlat bool) Files {
	if isFlat {
		// name = "Admin/Users" -> parts=["Admin", "Users"]
		parts := make([]string, 0)
		// Split logic (mimic JS split)
		// If name is "A/B", parts are "A", "B"
		// If name is "A", parts are "A"
		current := ""
		for _, c := range name {
			if c == '/' || c == '\\' {
				if current != "" {
					parts = append(parts, current)
					current = ""
				}
			} else {
				current += string(c)
			}
		}
		if current != "" {
			parts = append(parts, current)
		}

		leaf := parts[len(parts)-1]
		parent := parts[:len(parts)-1]
		
		basePath := ""
		if len(parent) > 0 {
			// Join with /
			for i, p := range parent {
				if i > 0 {
					basePath += "/"
				}
				basePath += p
			}
			basePath += "/"
		}

		return Files{
			React: "src/pages/" + basePath + strings.ToLower(leaf) + ".page.tsx",
			View:  "Views/" + basePath + leaf + ".cshtml",
		}
	}
	
	// Default folder structure
	return Files{
		React: "src/pages/" + name + "/index.page.tsx",
		View:  "Views/" + name + "/Index.cshtml",
	}
}
