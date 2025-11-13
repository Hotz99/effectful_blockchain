#!/usr/bin/env bash
# run-copilot.sh - Execute Copilot CLI with composed prompt and handle edits safely
# Usage: run-copilot.sh <agent-name> "<user instruction>" [OPTIONS]
#
# Dependencies: copilot CLI, git (recommended), jq (optional), bun (for TypeScript hooks)
# Environment variables:
#   COPILOT_CLI_BIN - Override Copilot CLI binary (default: auto-detect)
#   COPILOT_CLI_FLAGS - Additional flags for Copilot CLI
#   CLAUDE_DIR - Override .claude directory location (default: ./.claude)
#   LOG_DIR - Override log directory (default: ./.cli-llm/logs)

set -euo pipefail

# --- Configuration ---
COPILOT_CLI_BIN="${COPILOT_CLI_BIN:-}"
COPILOT_CLI_FLAGS="${COPILOT_CLI_FLAGS:-}"
CLAUDE_DIR="${CLAUDE_DIR:-./.claude}"
LOG_DIR="${LOG_DIR:-./.cli-llm/logs}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Argument parsing ---
AGENT_NAME=""
USER_INSTRUCTION=""
SKILLS=""
FILE_PATH=""
SELECTION=""
APPLY_MODE="prompt"  # prompt | yes | no
OUTPUT_PATH=""
DRY_RUN=0

usage() {
    cat << EOF
Usage: $0 <agent-name> "<user instruction>" [OPTIONS]

Execute Copilot CLI with composed prompt and handle edits safely.

Arguments:
  agent-name              Name of agent (from .claude/agents/<name>.md)
  user-instruction        The instruction/task for the agent

Options:
  --skills=SKILL1,SKILL2  Comma-separated skill names (default: all skills)
  --file=PATH             Include file contents as context
  --selection="TEXT"      Include specific text selection (requires --file)
  --apply=MODE            Edit application mode: prompt|yes|no (default: prompt)
                          prompt - Ask before each edit
                          yes    - Apply all edits automatically
                          no     - Show edits but don't apply
  --out=PATH              Save prompt to specific path
  --dry-run               Build prompt and show CLI invocation without executing

Examples:
  $0 effect-expert "Implement UserService layer"
  $0 effect-expert "Add error handling" --skills=layer-design --apply=prompt
  $0 domain-modeler "Create Trade ADT" --file=src/domain/Trade.ts
  $0 react-expert "Refactor component" --file=src/ui/App.tsx --dry-run
EOF
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skills=*)
            SKILLS="${1#*=}"
            shift
            ;;
        --file=*)
            FILE_PATH="${1#*=}"
            shift
            ;;
        --selection=*)
            SELECTION="${1#*=}"
            shift
            ;;
        --apply=*)
            APPLY_MODE="${1#*=}"
            if [[ ! "$APPLY_MODE" =~ ^(prompt|yes|no)$ ]]; then
                echo "ERROR: --apply must be one of: prompt, yes, no" >&2
                exit 1
            fi
            shift
            ;;
        --out=*)
            OUTPUT_PATH="${1#*=}"
            shift
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --help|-h)
            usage
            ;;
        -*)
            echo "ERROR: Unknown option: $1" >&2
            usage
            ;;
        *)
            if [[ -z "$AGENT_NAME" ]]; then
                AGENT_NAME="$1"
            elif [[ -z "$USER_INSTRUCTION" ]]; then
                USER_INSTRUCTION="$1"
            else
                echo "ERROR: Unexpected argument: $1" >&2
                usage
            fi
            shift
            ;;
    esac
done

if [[ -z "$AGENT_NAME" || -z "$USER_INSTRUCTION" ]]; then
    echo "ERROR: agent-name and user-instruction are required" >&2
    usage
fi

# --- Detect Copilot CLI ---
detect_copilot_cli() {
    local candidates=("copilot" "github-copilot" "gh copilot")
    
    if [[ -n "$COPILOT_CLI_BIN" ]]; then
        if command -v "$COPILOT_CLI_BIN" &> /dev/null; then
            echo "$COPILOT_CLI_BIN"
            return 0
        else
            echo "ERROR: COPILOT_CLI_BIN set to '$COPILOT_CLI_BIN' but not found in PATH" >&2
            return 1
        fi
    fi
    
    # Try common names
    for cmd in "${candidates[@]}"; do
        if command -v ${cmd%% *} &> /dev/null; then
            echo "$cmd"
            return 0
        fi
    done
    
    echo "ERROR: Copilot CLI not found" >&2
    echo "" >&2
    echo "Please install GitHub Copilot CLI:" >&2
    echo "  1. Install: npm install -g @githubnext/github-copilot-cli" >&2
    echo "  2. Authenticate: gh auth login" >&2
    echo "  3. Or set COPILOT_CLI_BIN environment variable" >&2
    echo "" >&2
    echo "Alternatively, install via:" >&2
    echo "  brew install github/gh/gh" >&2
    echo "  gh extension install github/gh-copilot" >&2
    return 1
}

COPILOT_CMD=$(detect_copilot_cli)
if [[ $? -ne 0 ]]; then
    exit 1
fi

# --- Build prompt ---
echo "📝 Building prompt for agent: $AGENT_NAME" >&2

BUILD_ARGS=("$AGENT_NAME")
[[ -n "$SKILLS" ]] && BUILD_ARGS+=("--skills=$SKILLS")
[[ -n "$FILE_PATH" ]] && BUILD_ARGS+=("--file=$FILE_PATH")
[[ -n "$SELECTION" ]] && BUILD_ARGS+=("--selection=$SELECTION")
[[ -n "$OUTPUT_PATH" ]] && BUILD_ARGS+=("--out=$OUTPUT_PATH")

PROMPT_FILE=$("$SCRIPT_DIR/build-prompt.sh" "${BUILD_ARGS[@]}")

if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "ERROR: Failed to build prompt file" >&2
    exit 1
fi

echo "   Prompt file: $PROMPT_FILE" >&2

# Append user instruction to prompt
{
    echo ""
    echo "## User Instruction"
    echo ""
    echo "$USER_INSTRUCTION"
    echo ""
    echo "---"
    echo ""
    echo "## Output Format Requirements"
    echo ""
    echo "Respond with ONE of the following formats:"
    echo ""
    echo "### Format 1: JSON (for edits and commands)"
    echo '```json'
    echo '{'
    echo '  "explanation": "Brief explanation of changes",  '
    echo '  "edits": ['
    echo '    {'
    echo '      "file": "relative/path/to/file.ts",'
    echo '      "patch": "--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@\n-old line\n+new line"'
    echo '    }'
    echo '  ],'
    echo '  "commands": ["bun run test", "git add ."]'
    echo '}'
    echo '```'
    echo ""
    echo "### Format 2: Unified Diff (for patches)"
    echo '```diff'
    echo '--- a/src/domain/Trade.ts'
    echo '+++ b/src/domain/Trade.ts'
    echo '@@ -10,7 +10,7 @@'
    echo ' unchanged line'
    echo '-old line'
    echo '+new line'
    echo ' unchanged line'
    echo '```'
    echo ""
    echo "### Format 3: Plain text recommendation"
    echo "Use this if no immediate file edits are needed."
    echo ""
} >> "$PROMPT_FILE"

# --- Setup logging ---
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/${AGENT_NAME}_${TIMESTAMP}.log"
RESPONSE_FILE="$LOG_DIR/${AGENT_NAME}_${TIMESTAMP}_response.txt"

{
    echo "=== Run-Copilot Log ==="
    echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo "Agent: $AGENT_NAME"
    echo "Instruction: $USER_INSTRUCTION"
    echo "Prompt file: $PROMPT_FILE"
    echo "Copilot CLI: $COPILOT_CMD"
    echo "Apply mode: $APPLY_MODE"
    echo "========================"
    echo ""
} > "$LOG_FILE"

# --- Dry run mode ---
if [[ $DRY_RUN -eq 1 ]]; then
    echo "" >&2
    echo "🔍 DRY RUN MODE" >&2
    echo "   Would execute: $COPILOT_CMD $COPILOT_CLI_FLAGS < $PROMPT_FILE" >&2
    echo "   Prompt content:" >&2
    echo "" >&2
    head -n 50 "$PROMPT_FILE" | sed 's/^/   /' >&2
    echo "   ..." >&2
    echo "" >&2
    echo "   Full prompt: $PROMPT_FILE" >&2
    echo "   Would log to: $LOG_FILE" >&2
    exit 0
fi

# --- Execute Copilot CLI ---
echo "🤖 Calling Copilot CLI..." >&2
echo "" >&2

# Note: Copilot CLI interaction varies by version. This assumes a simple stdin approach.
# Adjust based on actual Copilot CLI API (may need different flags or API calls)

# For now, we'll simulate by using the prompt as input
# Real implementation would call: gh copilot suggest or similar
# This is a placeholder that assumes a hypothetical copilot CLI that reads stdin:

if command -v gh &> /dev/null && gh extension list | grep -q copilot; then
    # GitHub CLI with Copilot extension
    # gh copilot suggest doesn't accept stdin directly, so we work around this
    # by creating a temporary wrapper
    
    echo "   Using GitHub CLI with Copilot extension" >&2
    echo "   Note: Copilot CLI integration is limited - showing prompt instead" >&2
    echo "" >&2
    
    # Since gh copilot suggest is interactive and doesn't accept file input,
    # we'll simulate by showing what we would send and capture manual response
    echo "⚠️  COPILOT CLI LIMITATION:" >&2
    echo "   GitHub Copilot CLI doesn't support non-interactive prompt submission." >&2
    echo "   Please use one of these alternatives:" >&2
    echo "" >&2
    echo "   1. Copy prompt and use in chat: $PROMPT_FILE" >&2
    echo "   2. Use GitHub Copilot Chat in VS Code" >&2
    echo "   3. Set COPILOT_CLI_BIN to an API-based tool" >&2
    echo "" >&2
    
    # For demonstration, we'll create a sample response format
    cat > "$RESPONSE_FILE" << 'EOF'
{
  "explanation": "This is a placeholder response. Real Copilot CLI output would appear here.",
  "edits": [],
  "commands": []
}
EOF
    
else
    # Hypothetical direct API access (user must configure)
    echo "   Using custom Copilot CLI: $COPILOT_CMD" >&2
    
    if $COPILOT_CMD $COPILOT_CLI_FLAGS < "$PROMPT_FILE" > "$RESPONSE_FILE" 2>&1; then
        echo "   ✓ Received response" >&2
    else
        echo "ERROR: Copilot CLI execution failed" >&2
        cat "$RESPONSE_FILE" >&2
        exit 1
    fi
fi

# Log the full response
cat "$RESPONSE_FILE" >> "$LOG_FILE"

echo "" >&2
echo "📄 Response saved to: $RESPONSE_FILE" >&2
echo "📋 Full log: $LOG_FILE" >&2

# --- Parse response ---
echo "" >&2
echo "🔍 Parsing response..." >&2

# Try to parse as JSON
if jq empty "$RESPONSE_FILE" 2>/dev/null; then
    echo "   Detected JSON response" >&2
    
    # Extract fields
    EXPLANATION=$(jq -r '.explanation // ""' "$RESPONSE_FILE")
    EDITS=$(jq -r '.edits // [] | length' "$RESPONSE_FILE")
    COMMANDS=$(jq -r '.commands // [] | length' "$RESPONSE_FILE")
    
    if [[ -n "$EXPLANATION" ]]; then
        echo "" >&2
        echo "💡 Explanation:" >&2
        echo "$EXPLANATION" | sed 's/^/   /' >&2
    fi
    
    echo "" >&2
    echo "   Found: $EDITS edit(s), $COMMANDS command(s)" >&2
    
    # Handle edits
    if [[ $EDITS -gt 0 ]]; then
        handle_json_edits "$RESPONSE_FILE"
    fi
    
    # Handle commands
    if [[ $COMMANDS -gt 0 ]]; then
        handle_json_commands "$RESPONSE_FILE"
    fi
    
elif grep -q "^--- a/" "$RESPONSE_FILE"; then
    echo "   Detected unified diff format" >&2
    handle_unified_diff "$RESPONSE_FILE"
    
else
    echo "   Plain text response (no structured edits)" >&2
    echo "" >&2
    cat "$RESPONSE_FILE" >&2
fi

echo "" >&2
echo "✅ Complete!" >&2
exit 0

# --- Helper functions ---

handle_json_edits() {
    local response_file="$1"
    local edit_count=$(jq -r '.edits | length' "$response_file")
    
    echo "" >&2
    echo "📝 Processing $edit_count edit(s)..." >&2
    
    for i in $(seq 0 $((edit_count - 1))); do
        local file_path=$(jq -r ".edits[$i].file" "$response_file")
        local patch=$(jq -r ".edits[$i].patch" "$response_file")
        
        echo "" >&2
        echo "   [$((i + 1))/$edit_count] File: $file_path" >&2
        
        if [[ "$APPLY_MODE" == "no" ]]; then
            echo "   Mode: no - Skipping (showing patch only)" >&2
            echo "$patch" | head -20 | sed 's/^/      /'  >&2
            continue
        fi
        
        # Show diff preview
        echo "   Patch preview:" >&2
        echo "$patch" | head -10 | sed 's/^/      /' >&2
        
        if [[ "$APPLY_MODE" == "prompt" ]]; then
            echo -n "   Apply this edit? [y/N] " >&2
            read -r response
            if [[ ! "$response" =~ ^[Yy]$ ]]; then
                echo "   Skipped" >&2
                continue
            fi
        fi
        
        apply_patch "$file_path" "$patch"
    done
}

apply_patch() {
    local file_path="$1"
    local patch="$2"
    
    # Create backup
    create_backup "$file_path"
    
    # Write patch to temp file
    local patch_file=$(mktemp)
    echo "$patch" > "$patch_file"
    
    # Try to apply with git apply (preferred)
    if git rev-parse --git-dir > /dev/null 2>&1; then
        if git apply --check "$patch_file" 2>/dev/null; then
            git apply "$patch_file"
            echo "   ✓ Applied with git apply" >&2
            run_post_tool_use_hooks "$file_path"
        else
            echo "   ⚠️  git apply failed, trying patch command..." >&2
            if patch -p1 < "$patch_file"; then
                echo "   ✓ Applied with patch" >&2
                run_post_tool_use_hooks "$file_path"
            else
                echo "   ✗ Failed to apply patch" >&2
                restore_backup "$file_path"
            fi
        fi
    else
        # Not a git repo, use patch
        if patch -p1 < "$patch_file"; then
            echo "   ✓ Applied with patch" >&2
            run_post_tool_use_hooks "$file_path"
        else
            echo "   ✗ Failed to apply patch" >&2
            restore_backup "$file_path"
        fi
    fi
    
    rm -f "$patch_file"
}

handle_unified_diff() {
    local response_file="$1"
    
    echo "" >&2
    echo "📝 Applying unified diff..." >&2
    
    if [[ "$APPLY_MODE" == "no" ]]; then
        echo "   Mode: no - Showing diff only" >&2
        cat "$response_file" >&2
        return
    fi
    
    if [[ "$APPLY_MODE" == "prompt" ]]; then
        echo "   Diff preview:" >&2
        head -20 "$response_file" | sed 's/^/      /' >&2
        echo -n "   Apply this diff? [y/N] " >&2
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            echo "   Skipped" >&2
            return
        fi
    fi
    
    # Extract affected files and create backups
    local files=$(grep "^--- a/" "$response_file" | sed 's/^--- a\///')
    for file in $files; do
        create_backup "$file"
    done
    
    # Apply patch
    if git rev-parse --git-dir > /dev/null 2>&1; then
        if git apply --check "$response_file" 2>/dev/null; then
            git apply "$response_file"
            echo "   ✓ Applied diff with git apply" >&2
            for file in $files; do
                run_post_tool_use_hooks "$file"
            done
        else
            echo "   ✗ Failed to apply diff" >&2
            for file in $files; do
                restore_backup "$file"
            done
        fi
    else
        if patch -p1 < "$response_file"; then
            echo "   ✓ Applied diff with patch" >&2
            for file in $files; do
                run_post_tool_use_hooks "$file"
            done
        else
            echo "   ✗ Failed to apply diff" >&2
            for file in $files; do
                restore_backup "$file"
            done
        fi
    fi
}

handle_json_commands() {
    local response_file="$1"
    local cmd_count=$(jq -r '.commands | length' "$response_file")
    
    echo "" >&2
    echo "⚡ Suggested commands ($cmd_count):" >&2
    
    for i in $(seq 0 $((cmd_count - 1))); do
        local cmd=$(jq -r ".commands[$i]" "$response_file")
        echo "   [$((i + 1))] $cmd" >&2
    done
    
    echo "" >&2
    echo -n "Execute these commands? [y/N] " >&2
    read -r response
    
    if [[ "$response" =~ ^[Yy]$ ]]; then
        for i in $(seq 0 $((cmd_count - 1))); do
            local cmd=$(jq -r ".commands[$i]" "$response_file")
            echo "   Executing: $cmd" >&2
            eval "$cmd" || echo "   ⚠️  Command failed (continuing)" >&2
        done
    else
        echo "   Skipped commands" >&2
    fi
}

create_backup() {
    local file_path="$1"
    
    if [[ ! -f "$file_path" ]]; then
        return
    fi
    
    if git rev-parse --git-dir > /dev/null 2>&1; then
        # In git repo - let git handle backups
        return
    else
        # Not in git - create .bak file
        cp "$file_path" "${file_path}.bak"
        echo "   Backup: ${file_path}.bak" >&2
    fi
}

restore_backup() {
    local file_path="$1"
    
    if [[ -f "${file_path}.bak" ]]; then
        mv "${file_path}.bak" "$file_path"
        echo "   Restored from backup" >&2
    fi
}

run_post_tool_use_hooks() {
    local file_path="$1"
    
    # Check if file is TypeScript/TSX
    if [[ ! "$file_path" =~ \.(ts|tsx)$ ]]; then
        return
    fi
    
    echo "   Running PostToolUse hooks for TypeScript..." >&2
    
    # Check if bun is available
    if ! command -v bun &> /dev/null; then
        echo "   ⚠️  bun not found - skipping format/lint/typecheck" >&2
        return
    fi
    
    # Run hooks (as defined in .claude/settings.json)
    local original_dir="$PWD"
    
    # Try to find package.json location
    local pkg_dir="$original_dir"
    while [[ "$pkg_dir" != "/" ]]; do
        if [[ -f "$pkg_dir/package.json" ]]; then
            break
        fi
        pkg_dir=$(dirname "$pkg_dir")
    done
    
    if [[ ! -f "$pkg_dir/package.json" ]]; then
        echo "   ⚠️  No package.json found - skipping hooks" >&2
        return
    fi
    
    cd "$pkg_dir"
    
    echo "      → bun run format" >&2
    bun run format 2>&1 | sed 's/^/         /' >&2 || true
    
    echo "      → bun run lint" >&2
    bun run lint 2>&1 | sed 's/^/         /' >&2 || true
    
    echo "      → bun run typecheck" >&2
    bun run typecheck 2>&1 | sed 's/^/         /' >&2 || true
    
    cd "$original_dir"
    
    echo "   ✓ Hooks complete" >&2
}
