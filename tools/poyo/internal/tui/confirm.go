package tui

import (
	"fmt"
	tea "github.com/charmbracelet/bubbletea"
)

type confirmModel struct {
	question string
	yes      bool
	done     bool
}

func (m confirmModel) Init() tea.Cmd {
	return nil
}

func (m confirmModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "y", "Y":
			m.yes = true
			m.done = true
			return m, tea.Quit
		case "n", "N":
			m.yes = false
			m.done = true
			return m, tea.Quit
		case "enter":
			// Default to No if just enter? Or current selection?
			// Simple version: strictly wait for y/n or treat enter as default (false)
			m.done = true
			return m, tea.Quit
		case "ctrl+c", "q":
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m confirmModel) View() string {
	if m.done {
		ans := "No"
		if m.yes {
			ans = "Yes"
		}
		return fmt.Sprintf("%s %s\n", m.question, ans)
	}
	return fmt.Sprintf("%s (y/N) ", m.question)
}

func Confirm(question string) (bool, error) {
	p := tea.NewProgram(confirmModel{question: question, yes: false})
	m, err := p.Run()
	if err != nil {
		return false, err
	}
	return m.(confirmModel).yes, nil
}
