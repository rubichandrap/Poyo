package tui

import (
	"fmt"


	tea "github.com/charmbracelet/bubbletea"
)

type checkboxModel struct {
	title    string
	choices  []string // Display names
	selected map[int]bool
	cursor   int
}

func (m checkboxModel) Init() tea.Cmd {
	return nil
}

func (m checkboxModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			return m, tea.Quit
		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}
		case "down", "j":
			if m.cursor < len(m.choices)-1 {
				m.cursor++
			}
		case " ":
			_, ok := m.selected[m.cursor]
			if ok {
				delete(m.selected, m.cursor)
			} else {
				m.selected[m.cursor] = true
			}
		case "enter":
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m checkboxModel) View() string {
	s := fmt.Sprintf("%s\n\n", m.title)

	for i, choice := range m.choices {
		cursor := " " // no cursor
		if m.cursor == i {
			cursor = ">" // cursor!
		}

		checked := " " // not selected
		if _, ok := m.selected[i]; ok {
			checked = "x" // selected!
		}

		s += fmt.Sprintf("%s [%s] %s\n", cursor, checked, choice)
	}

	s += "\nPress space to select, enter to confirm.\n"
	return s
}

// Checkbox returns a list of selected *Values*.
// Choices should be a list of structs normally, but to keep it simple with our Select Choice approach:
func Checkbox(title string, choices []Choice) ([]string, error) {
	displayNames := []string{}
	for _, c := range choices {
		displayNames = append(displayNames, c.Name)
	}

	m := checkboxModel{
		title:    title,
		choices:  displayNames,
		selected: make(map[int]bool),
		cursor:   0,
	}

	p := tea.NewProgram(m)
	res, err := p.Run()
	if err != nil {
		return nil, err
	}

	finalModel := res.(checkboxModel)
	var validValues []string
	
	// Map indices back to Values
	for i := range finalModel.choices {
		if finalModel.selected[i] {
			validValues = append(validValues, choices[i].Value)
		}
	}

	return validValues, nil
}
