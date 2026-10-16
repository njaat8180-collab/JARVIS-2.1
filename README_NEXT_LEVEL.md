# JARVIS Pro Max — Desktop Health Upgrade

This is the Electron desktop project. The Health option is directly below
Settings in the left sidebar.

## Health Matrix

The Health screen reads:

- ReasoningAgent
- BrowserAgent
- KnowledgeAgent
- SelfLearningAgent
- MemoryManagerAgent
- LearningAgent
- TaskPlanner
- AgentMonitor
- Any additional agents registered in `AgentRegistry`

It also reads CPU, RAM, disk, network, uptime, platform, and architecture
through the native `system:info` IPC channel. On Windows, the main process
also attempts to read GPU Engine utilization through PowerShell. If GPU
utilization is not available, the UI reports that honestly instead of
inventing a percentage.

## Run

```bash
npm install
npm start
```

The native desktop source is intentionally separate from the preview-only web
companion in the workspace.