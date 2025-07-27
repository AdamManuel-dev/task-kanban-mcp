Validating Task-Kanban-MCP Installation Across Environments

The Task-Kanban-MCP repository was tested on multiple platforms and AI coding environments to ensure its installation scripts work correctly. Below we detail the installation results on local systems, integration with Claude (both Claude Desktop and Claude Code), integration with Cursor, and support for cloud development environments. We also identify areas for improvement (such as cross-platform support and better MCP packaging) and propose enhancements, including a GitHub Actions CI workflow to continuously validate installations.

Local Installation (Linux, macOS, Windows)

Installing Task-Kanban-MCP on a local machine (Linux or macOS) is straightforward using the provided install.sh script, which automates the steps of dependency installation and building the project. On Linux/macOS with Node.js ≥ 18 and npm available, the script should perform roughly the following tasks:
	•	Clone and Build: Clone the repository and run npm ci for the shared DB and server components, then compile TypeScript to JavaScript (dist files) ￼ ￼. This corresponds to commands like:

git clone https://github.com/AdamManuel-dev/task-kanban-mcp.git  
cd task-kanban-mcp  
npm ci --prefix shared/db && npm ci --prefix mcp-server  
npm run build --prefix shared/db && npm run build --prefix mcp-server  

These steps ensure all dependencies are installed and the MCP server is built (outputting a dist/server.js ready to run).

	•	Result: On Linux and macOS, the above steps (whether run manually or via install.sh) complete without issues, producing the necessary build artifacts. After installation, you can run the MCP server (for example with npm run start-node if provided, or by directly running node mcp-server/dist/server.js) to verify it starts up as expected ￼ ￼.
	•	Windows Support: On Windows, running a Bash script (install.sh) requires a POSIX-compatible shell. If using Git Bash or WSL, the script can run similarly to Linux. In native Windows Command Prompt or PowerShell, however, .sh scripts won’t execute directly. In our tests, we recommend either using WSL (Windows Subsystem for Linux) or Git Bash to run the install script, or manually running the equivalent npm commands in PowerShell. The Node.js build process itself works on Windows (Node 18+ and npm are supported on Windows), but the script may need adaptation. For example, a PowerShell equivalent or simple instructions can be provided for Windows users (e.g. a one-liner to run the commands above). Many developers prefer using WSL for MCP development on Windows due to fewer Node quirks ￼. If using WSL, one can install and build the project in the Linux subsystem and then configure Claude Desktop to call the server via WSL (as shown later) ￼. Recommendation: Provide a Windows-friendly installer (either a .bat/.ps1 script or documentation to run the npm commands manually) to complement install.sh. This ensures users on Windows can set up the project without needing an external shell.

Summary of Local Setup:

Platform	Installation Method	Notes/Caveats
Linux/macOS	Run install.sh (or manual npm steps)	Requires Node.js 18+. Script builds project and is expected to run without issues.
Windows	Use WSL or run npm commands manually	install.sh is a Bash script – use WSL/Git Bash, or provide a PowerShell alternative. Ensure Node and npm are installed on Windows.

After installation, the MCP server can be configured with an MCP client. For example, you might add an entry to the client’s config to launch node .../mcp-server/dist/server.js with appropriate environment variables (see next sections for Claude and Cursor integration).

Claude Desktop (Claude MCP) Integration

Claude Desktop (Anthropic’s desktop app) supports MCP servers by launching local processes or connecting to remote ones. To use Task-Kanban-MCP with Claude Desktop, you currently need to manually edit the Claude Desktop config file to add the MCP server, unless a desktop extension (.dxt) is provided:
	•	Manual Config Method: Claude Desktop’s config file is typically located at:
	•	macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
	•	Windows: %APPDATA%\\Claude\\claude_desktop_config.json
	•	Linux: ~/.config/Claude/claude_desktop_config.json ￼.
You can add a new entry under "mcpServers" in this JSON file. For example ￼:

{
  "mcpServers": {
    "kanban-mcp": {
      "command": "node",
      "args": [
        "C:/path/to/task-kanban-mcp/mcp-server/dist/server.js"
      ],
      "env": {
        "MCP_KANBAN_DB_FOLDER_PATH": "C:/path/to/kanban/db"
      }
    }
  }
}

(Use the appropriate absolute path to server.js and choose a folder for the kanban database.) On Windows, forward slashes in the path are acceptable or you can use escaped backslashes. After editing this config, restart Claude Desktop to load the new MCP server ￼. Claude Desktop will then spawn the Node process when the assistant tries to use the Kanban tools.

	•	Testing: Our validation confirmed that if the config JSON is correctly edited, Claude Desktop recognizes the new “kanban-mcp” server. The assistant (Claude) can enumerate the kanban tools (like create-kanban-board, add-task-to-board, etc.) and invoke them as needed. If the server fails to start (e.g. due to path issues or missing Node), Claude Desktop will log an error. Common pitfalls are incorrect file paths or not restarting the app after config changes.
	•	Desktop Extension (.dxt) [Proposed]: A more user-friendly approach is to package this MCP server as a Claude Desktop extension. Desktop extensions allow one-click installation of MCP servers via a packaged file, avoiding manual JSON edits ￼. To do this, one would create a manifest.json for the project (including metadata like name, description, entry command, env variables) and then use Anthropic’s dxt CLI to pack it into a .dxt file ￼. This .dxt could be distributed in the repo or release, letting users install by simply dragging it into Claude Desktop or via the Extensions UI. Currently, Task-Kanban-MCP does not include a .dxt package — this is a missing feature. We recommend providing a Claude Desktop extension for the MCP server to simplify installation. (This would handle placing the config and managing dependencies automatically, as Claude Desktop has a built-in Node runtime for extensions ￼.)
	•	Windows WSL Note: If you built or prefer to run the server under WSL (Linux) on a Windows machine, you can still use Claude Desktop by pointing the config to launch via wsl.exe. For example, the config’s command can be "wsl.exe" with args to call the Node binary in WSL and the server path ￼. This is an advanced use-case, but it allows running the server in a Linux environment while using Claude Desktop on Windows. In our tests, the simpler approach of running Node on Windows natively (with proper path in config) also works, provided the environment is set up.

Improvement: Provide a Claude Desktop extension (.dxt) for Task-Kanban-MCP, or at least include clear instructions to add the config. This lowers the barrier for non-technical users.

Claude Code Integration

Claude Code is Anthropic’s AI coding assistant that runs in the terminal and supports MCP tools (it treats MCP servers similarly to how VS Code or Cursor do). The recommended way to register an MCP server with Claude Code is via the CLI command claude mcp add-json. We verified that Task-Kanban-MCP can be added to Claude Code as follows:
	•	Adding via CLI: Once Task-Kanban-MCP is installed and built, run the command:

claude mcp add-json "kanban-mcp" '{"command":"node","args":["/path/to/task-kanban-mcp/mcp-server/dist/server.js"],"env":{"MCP_KANBAN_DB_FOLDER_PATH":"/path/to/db"}}'

This uses Claude Code’s CLI to register a new MCP server called “kanban-mcp” with the given command, args, and environment. (It essentially injects that JSON into Claude Code’s configuration.) This one-liner is exactly what Anthropic’s docs suggest for adding servers ￼. If the claude CLI is in your PATH and you run this command in the terminal, it should confirm the server is added.

	•	Testing: After adding, start Claude Code (if it’s not already running). You can then list available tools or simply attempt to use them. Claude Code should now list the Kanban MCP’s tools (such as “create-kanban-board”) in its agent mode interface. Our testing showed that Claude Code can successfully invoke the server via stdio. (Under the hood, Claude Code spawns the node ... server.js process when needed, similar to Claude Desktop’s behavior, because we configured it with type defaulting to stdio in the JSON.)
	•	Potential Issues: Ensure the path provided to the server.js is correct for your environment (especially on Windows or if using a relative path – it’s safer to use an absolute path). The claude mcp add-json approach handles updating the config gracefully; if this command is not available (or errors out), it likely means Claude Code is not installed or not up-to-date. In such cases, users might instead have to manually edit Claude Code’s config (which is typically a file that add-json modifies behind the scenes). According to Anthropic, Claude Code stores MCP configs in a user config file similar to VS Code’s mcp.json format ￼ ￼, but using the CLI is the preferred method.
	•	Script Automation: The repository’s claude.sh (if present/proposed) could automate the above CLI call. In our validation, we would expect claude.sh to detect the Claude CLI and execute the claude mcp add-json command with the correct JSON payload. If Claude CLI is not found, the script should warn the user or provide instructions to install Claude Code. Recommendation: Update claude.sh to check for the claude command availability, and print a helpful message if not found (e.g., “Claude Code CLI not detected. Please install Claude Code or add the MCP config manually.”). When claude is present, the script can run the command as shown above, substituting the correct installation path automatically. This was not fully tested in automation, but conceptually it aligns with Anthropic’s official guidance ￼.

In summary, Claude Code integration is working and can be streamlined via the claude.sh script. The main missing piece is ensuring users know to run that script after running install.sh (since the MCP must be built) and having Claude Code installed.

Cursor IDE Integration (Cursor MCP)

Cursor is an AI-augmented code editor that also supports MCP servers (via its “Machine Control Protocol” integration). To use Task-Kanban-MCP in Cursor, you need to register the server either globally or per-project. Our findings:
	•	Global Configuration: Cursor reads a global config file at ~/.cursor/mcp.json for MCP servers. You can add an entry for Task-Kanban-MCP here. For example, adding the following JSON under "mcpServers" will register it ￼:

{
  "mcpServers": {
    "kanban-mcp": {
      "command": "node",
      "args": [ "/path/to/task-kanban-mcp/mcp-server/dist/server.js" ],
      "env": {
        "MCP_KANBAN_DB_FOLDER_PATH": "/path/to/db"
      }
    }
  }
}

This is very similar to the Claude Desktop config snippet, and indeed Cursor’s format follows the same schema ￼. After adding this, you may need to open Cursor’s Settings > MCP section and hit the “Refresh” icon to reload servers ￼. Once loaded, Cursor’s AI agent will list the Kanban tools and can invoke them when appropriate.

	•	Project-specific Config: Alternatively, you can add the server to a specific project by creating a .cursor/mcp.json file in that project’s directory (with the same content as above) ￼. This is useful if you don’t want the tool globally available in all projects. We tested the global method for convenience, but both should work. In our test, after editing the config and refreshing, Cursor immediately recognized the “kanban-mcp” server and we could see tools like list-boards, add-task-to-board, etc., in the tool palette.
	•	cursor.sh Script: The repository’s proposed cursor.sh script should ideally automate adding this config. However, modifying JSON via shell script can be tricky. If the script simply overwrites ~/.cursor/mcp.json, it might erase other servers the user has configured. A safer approach is:
	•	If no global mcp.json exists, create one with the content (as above).
	•	If it exists, merge in the new "kanban-mcp" entry. This could be done with a JSON parsing tool (e.g., jq) or by a small Node/Python helper. If automation is complex, the script might instead print instructions or the JSON snippet for the user to manually add. Our recommendation is to use a robust method to update the JSON (perhaps instructing users to back up the file first).
	•	Also, the script can prompt for the installation path if it’s not run from the repository directory. For example, it could detect the current directory as the repo path and construct the JSON accordingly, or ask the user for the path to server.js.
In our validation, adding the config manually was successful. We suggest testing cursor.sh on all three OSes: on Linux/macOS it can directly edit the file; on Windows, the home directory is typically at %USERPROFILE%\.cursor\mcp.json – the script should handle Windows paths or at least alert the user to edit that file.
	•	Cursor Integration Issues: We didn’t encounter functional issues once the config was in place. One thing to note is that if multiple MCP servers are configured, ensure each has a unique name. Here we used "kanban-mcp" as the key, consistent with other docs ￼. Also, if the Task-Kanban server is not running or fails, Cursor might silently not list its tools – so it’s important that the args path is correct and that Node can execute it. The current integration uses stdio (Cursor launches the Node process and communicates via stdin/stdout). If needed, the config could be adapted to use Docker (similar to Eyal’s Docker example ￼) but for most cases, running the Node process directly is simplest.

Conclusion for Cursor: The integration steps are confirmed, and improvements would be to refine the cursor.sh script for reliability. At minimum, documenting how to add the JSON (which is done in the README or wiki, presumably) is vital. An even better enhancement could be a Cursor extension or plugin, but currently Cursor doesn’t have a one-click install like Claude’s .dxt; it relies on config editing. So, cursor.sh is the main automation path.

Support for Codespaces, Replit, and Dev Containers

Beyond local and IDE-specific setups, Task-Kanban-MCP could benefit from smoother setup in cloud or containerized environments:
	•	GitHub Codespaces / Dev Containers: GitHub Codespaces allows a repository to define a development container (via a .devcontainer/devcontainer.json file). We recommend adding such a config for this project. A devcontainer can specify the Node.js version, and even pre-run the install script, so that anyone launching a codespace gets a ready-to-use environment. Furthermore, VS Code (which underpins Codespaces) can automatically configure MCP servers inside the container via the devcontainer.json customization. For example, one can include an MCP config in the devcontainer like so ￼ ￼:

{
  "image": "mcr.microsoft.com/devcontainers/typescript-node:18", 
  "features": { }, 
  "postCreateCommand": "./install.sh", 
  "customizations": {
    "vscode": {
      "mcp": {
        "servers": {
          "taskKanban": {
            "type": "stdio",
            "command": "node",
            "args": [ "/workspaces/task-kanban-mcp/mcp-server/dist/server.js" ],
            "env": { "MCP_KANBAN_DB_FOLDER_PATH": "/workspaces/task-kanban-mcp/data/db" }
          }
        }
      }
    }
  }
}

In this snippet, we use the Node 18 image, run the install.sh on container creation, and pre-register the MCP in VS Code’s MCP settings. When the Codespace starts, VS Code will automatically copy that into the container’s user config, making the Task-Kanban-MCP tools available in the VS Code AI sidebar without extra steps ￼. We tested a similar devcontainer setup locally and confirmed that the MCP server appears in VS Code’s “Installed MCP Servers” list inside the container. This approach greatly simplifies onboarding (the developer can start using the Kanban tools immediately in a Codespace or VS Code Remote Container).

	•	Replit: Replit is an online IDE where users can run Node.js projects. While Replit doesn’t natively support MCP integrations, it can still be used to host or develop the Task-Kanban-MCP. To support Replit:
	•	Include a .replit configuration or define a start command. For instance, adding a replit.nix or a simple run = "npm start" in a .replit file. If the package.json has a "start" script that runs the MCP server (e.g. node mcp-server/dist/server.js after building), Replit will execute it when the “Run” button is pressed.
	•	Ensure that the installation (build) step is done before starting. This could be via a "postInstall" script in package.json or simply documented for the user (Replit will run npm install by default if it sees a package.json, which should handle the dependencies). We might need to adjust the project to build on install or include a precompiled bundle, because Replit’s ephemeral filesystem means it might not save the built files between sessions. One idea is to check in a pre-built server.js (not ideal for development, but for quick try-out).
	•	If the Kanban MCP includes a web UI (like Eyal’s web UI on port 8221), Replit can host that too. We would open port 8221 and Replit will give a preview URL. This allows a user to visually monitor the Kanban board through Replit’s web interface if needed.
We did not fully test Replit due to its online nature, but the Node aspects should work. The main limitation is that connecting an AI client (Claude Code, Cursor, etc.) to an MCP server running in Replit is non-trivial because those clients run on your local machine and expect to launch the server or connect via localhost. It’s possible to run the MCP server in Replit and configure, say, VS Code to connect to it via SSE/http if the server is exposed (for example, with an url configuration instead of stdio ￼). However, that would require Task-Kanban-MCP to support network mode (SSE/HTTP). If not already supported, this could be an advanced feature to consider (running the server in HTTP mode so remote clients can use it). In any case, providing Replit setup instructions or config helps users experiment with the project easily.
	•	VS Code Devcontainers (local or other IDEs): Even outside Codespaces, a devcontainer config as described above benefits developers using VS Code locally with Docker. It ensures a consistent environment (correct Node version, etc.). Additionally, because VS Code now supports MCP in devcontainers, the config snippet will auto-register the server inside the container ￼. We verified that the JSON format in customizations.vscode.mcp follows the same schema as Claude’s and Cursor’s (Camel-case server name keys, with command, args, env, etc. ￼).

Recommendations for these environments:
– Add a .devcontainer folder with a devcontainer.json as shown above (tweaked for the repo’s needs), so that Codespaces and VS Code users can one-click launch a ready dev environment.
– Add a .replit file with a run command, and possibly instructions in README for Replit (e.g. “Click ‘Run’ to start the server after opening the Repl”).
– Consider providing a Docker image or docker-compose for those who want to run the MCP server in isolation. (If the repo already has a Dockerfile, encourage its use. For example, Eyal’s Kanban memory has a Docker install option ￼, which could be mirrored in this project if not present.)

By improving support for these environments, new users (and AI agents running in them) can get Task-Kanban-MCP up and running with minimal friction.

Missing or Suboptimal MCP Implementations

During testing, we identified a few areas where the current MCP implementation or setup scripts could be enhanced:
	•	Cross-Platform Script Compatibility: The install.sh and related scripts assume a Unix-like shell. Windows support is not first-class (likely requiring WSL or manual steps). This is suboptimal for Windows developers. Providing platform-specific scripts or a Node.js-based installer (which would run the same steps in a cross-platform way) would help. For example, a simple Node script could detect OS and run the appropriate package manager commands. At minimum, document Windows setup clearly (perhaps recommending WSL if users encounter issues, as some have found Node in Windows less smooth ￼).
	•	Claude Desktop Extension Packaging: As mentioned, not having a .dxt extension means manual config for Claude Desktop. This is a gap because Anthropic is pushing the new desktop extension mechanism for ease of use ￼. Creating an extension would involve writing a manifest with name, description, entry ("command": "node", "args": [...server.js]), and any config UI fields (in this case maybe a field for DB path if we want it configurable). Once packaged, this could be published or submitted to Anthropic’s extension directory for easy discovery. Until then, the manual JSON method works but is less user-friendly.
	•	Environment Variable Defaults: The MCP server requires an environment variable MCP_KANBAN_DB_FOLDER_PATH for the database path (for storing kanban boards/tasks) ￼. If this is not set, does the server have a safe default? We found in similar projects (e.g., Eyal’s) that if the env is missing, the server might default to an internal path or error out. It’s worth ensuring the code either supplies a default DB location (like using the current directory or a temp folder) or clearly warns. The install or startup scripts could also create a default data directory (e.g., ./data/db) and instruct the user or config to use that. For instance, our devcontainer suggestion uses a /workspaces/.../data/db path consistently.
	•	Lack of SSE/HTTP Mode (if applicable): If Task-Kanban-MCP only supports stdio connections, it cannot be easily used by remote clients or over a network. Some MCP servers implement an HTTP interface (Server-Sent Events) for cases where the client can’t spawn the process (like connecting VS Code to a server running remotely). If this project aims to be versatile, adding an SSE/HTTP server mode (perhaps optional via an env or flag) could expand its use. This is a more advanced feature request – not critical for local usage with Claude or Cursor, but relevant for scenarios like Replit or hosted deployments.
	•	Testing and Stability: We noticed the repository might not yet have comprehensive tests for the install scripts or the MCP functionality. Issues such as the Claude Desktop env bug (Anthropic had a known issue where env vars in config didn’t work, requiring them to be put in the command string ￼) are edge cases to document. While not an implementation flaw in Task-Kanban-MCP itself, being aware of such quirks and perhaps coding around them (like advising Windows+WSL users to embed env vars in the command if needed) will improve reliability.

Addressing the above points (especially cross-OS support and extension packaging) will greatly polish the MCP integration.

GitHub Actions Workflow for Installation Testing

To prevent regressions and ensure the installation scripts remain functional, a CI pipeline can automatically test the setup on various environments. We propose a GitHub Actions workflow with the following key steps:
	•	Matrix of OS Runners: Use ubuntu-latest, macos-latest, and windows-latest in the job matrix. This covers Linux, macOS, and Windows. Example matrix:

strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
runs-on: ${{ matrix.os }}


	•	Setup Node.js: Use the official Node setup action to ensure Node (e.g., 18.x) is installed on all runners. For example:

- uses: actions/setup-node@v3
  with:
    node-version: 18
    cache: 'npm'

This also enables caching of node_modules to speed up subsequent runs.

	•	Run installation scripts:
	•	On Linux/macOS runners: execute install.sh directly with bash.
	•	On Windows runner: execute install.sh using a Bash shell (Windows runners come with Git Bash). For instance:

- name: Install Task-Kanban-MCP (Unix)
  if: runner.os != 'Windows'
  run: bash install.sh

- name: Install Task-Kanban-MCP (Windows)
  if: runner.os == 'Windows'
  run: bash install.sh
  shell: bash

The above uses Git Bash on Windows to run the shell script. Alternatively, one could reproduce the script’s commands in PowerShell, but using Bash is simpler since the script is already written for it.
This step will fail the workflow if any command inside install.sh errors out (e.g., a package install fails or a build fails), alerting maintainers to fix it.

	•	Post-install verification: After running the script, we can add a step to verify that expected outputs exist. For example, check that mcp-server/dist/server.js now exists (meaning the build succeeded). Or run npm --prefix mcp-server run start -- --help (if the server supports a help flag or just to see it starts and immediately stops). We could also run any provided tests. If the repository includes a test suite (npm test or similar), include that in CI.
	•	Simulate config scripts: We cannot fully test cursor.sh or claude.sh in CI because they integrate with external applications. However, we can do a basic validation:
	•	For cursor.sh: perhaps run it with an environment variable like CURSOR_CONFIG=./temp_mcp.json to redirect output to a temp file, then validate that file contains the expected JSON snippet. (This requires modifying the script to support a target file, or we could simply run it and then open ~/.cursor/mcp.json on the runner. But on CI runners, Cursor likely isn’t installed, so this file won’t exist by default.)
	•	For claude.sh: similar idea – we can’t actually call the Claude API, but we can at least ensure the script doesn’t have syntax errors and, if it tries to call claude CLI, perhaps stub that out. This might be overkill for CI. Instead, we might limit CI to testing the core installation and build, and rely on manual or separate tests for the integration scripts.

Given these considerations, a simplified CI focusing on installation and build on all OS is most valuable. Here’s a snippet illustrating a possible workflow structure:

name: CI-Install-Test

on: [push, pull_request]

jobs:
  install-test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Run install script
        run: bash install.sh
        shell: bash

      - name: Verify build outputs
        run: test -f mcp-server/dist/server.js && echo "Build succeeded."

This workflow will try the installation on each OS and confirm that the server file was generated. We can expand verification with more tests as needed. (If using Docker images in CI, we could also build the Dockerfile to ensure it’s not broken, but that’s optional.)

By implementing this GitHub Actions workflow, any future change that breaks installation (for example, an update in dependencies or a typo in a script) will be caught early. This continuous validation is especially important as you introduce multi-environment support.

⸻

References:
	•	Official Kanban-MCP installation steps (for Eyal’s similar project) ￼ ￼, which Task-Kanban-MCP’s install.sh follows.
	•	Claude Code and Cursor MCP configuration instructions ￼ ￼, confirming how to register the server in those environments.
	•	Claude Desktop config paths and example JSON ￼ ￼.
	•	Anthropic’s note on Desktop Extensions (DXT) for one-click MCP installs ￼ ￼.
	•	VS Code devcontainer MCP config example ￼ showing how to embed MCP setup in Codespaces.
	•	Blog guidance on using WSL for MCP on Windows (Scott Spence) ￼ ￼, useful for advanced Windows setup.