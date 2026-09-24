# Claude study project: folder access and context

Verified against Anthropic's public documentation on 2026-09-18, with the installed-app observations supplied by the main task below.

## What is supported

Cowork projects preserve project instructions, context, and memory across tasks. Project context can reference a local folder. Creating a project from an existing local folder is documented; that project remains on its originating computer. The current Chat/Cowork merger is rolling out, so the documented creation controls may differ from the installed UI. [Projects documentation](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork).

The merged desktop experience lists previously connected folders under **Settings → Trusted folders**. This confirms a persistent folder-access configuration surface. It does **not** explicitly establish whether several separate roots become available automatically in every new task, or whether project attachment and individual operation permissions still need confirmation. [Merged Claude experience](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude).

Folder access and prompt contents are different. The architecture describes file reads through desktop tools, with every local tool call checked against permissions. Anthropic's tutorial says Cowork finds relevant material within its working location. These support selective file retrieval; connecting a folder is not evidence that every file's complete contents enter each model request. The docs do not specify initial indexing, metadata injection, token overhead, or exact retrieval policy. [Architecture](https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview), [working-folder tutorial](https://academy.claude.com/tutorials/get-started-in-claude-cowork-in-three-steps).

Local access requires the desktop app to remain open and connected. The cross-surface guide also requires a session accessing local files remotely to have started on desktop. Cloud execution does not make connected local files permanently available after that app goes offline. [Cross-surface behavior](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile).

## Installed app observation

The main task inspected existing **SMM**, `/cowork/project/01a0b3d5-be0b-75e7-b641-c5603b3e1649`, without changing it. SMM already saves `the-vault`. Its settings show a singular **Folder**, **Choose a different folder**, and **Remove folder**. **Context → Add files** offers upload, text, and GitHub; no second local-folder control was found. The composer displays the selected vault under **SMM +1**. This demonstrates one remembered root, not automatic access to an additional repository root.

## Practical implication

SMM can retain the vault as the study workspace. Keep any project instruction short and point to the canonical learning skill; do not duplicate the learning system into uploaded project knowledge. The separate repository folder may still need attachment or permission in a new task. A project folder and the **Trusted folders** list are distinct surfaces; presence in either does not document automatic access through the other.

**Remaining uncertainty:** neither these sources nor the inspected UI establish a fully automatic two-root setup. Keep the current approval mode. No app configuration was changed for this research.

## Folder prompts follow-up

A fresh inspection on 2026-09-18 confirmed SMM still saves only the vault, and the composer already selects **Automatically approve**. The uploaded adapter currently asks to connect both the repository and vault. Reusing already-attached roots can prevent redundant requests, but changing that adapter requires one replacement upload; changing the canonical tutoring skill cannot alter access before the repository is attached. No supported persistent two-root attachment setting was established. No approval settings were changed. Auto and folder attachment are different controls; switching to Skip all approvals is not a verified folder-mount solution.

Further inspection of the installed app (2.2553.1) found **Settings → Cowork → Trusted Cowork folders**. Its exact UI text says: “Cowork tasks may use these folders, and folders inside them, without asking you first.” Both `/Users/edo/dev/python/journal` and the current iCloud vault path are already listed. This is stronger evidence than the earlier documentation-only uncertainty: the intended persistent trust mechanism exists and is configured. Recurring prompts therefore need classification as a conversational request versus an actual permission card; no setting was changed. Do not recommend adding the already-trusted roots again or turning off all approvals.
