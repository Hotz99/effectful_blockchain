#!/usr/bin/env bash
# build-prompt.sh - Compose agent + skill prompt fragments for LLM submission
# Usage: build-prompt.sh <agent-name> [--skills=csv] [--file=<path>] [--selection="<text>"] [--out=<path>]
#
# Dependencies: git (optional for metadata), jq (optional for settings parsing)
# Environment variables:
#   CLAUDE_DIR - Override .claude directory location (default: ./.claude)
#   MAX_FILE_SIZE - Max file size to include in bytes (default: 50000)

set -euo pipefail

# --- Configuration ---
CLAUDE_DIR="${CLAUDE_DIR:-./.claude}"
MAX_FILE_SIZE="${MAX_FILE_SIZE:-50000}"
TRUNCATE_MARKER="[... truncated for size, use --include-full to override ...]"

# --- Argument parsing ---
AGENT_NAME=""
SKILLS=""
FILE_PATH=""
SELECTION=""
OUTPUT_PATH=""
INCLUDE_FULL=0

usage() {
    cat << EOF
Usage: $0 <agent-name> [OPTIONS]

Compose a prompt file from agent + skills + context for LLM submission.

Arguments:
  agent-name              Name of agent (from .claude/agents/<name>.md)

Options:
  --skills=SKILL1,SKILL2  Comma-separated skill names (default: all skills)
  --file=PATH             Include file contents as context
  --selection="TEXT"      Include specific text selection (requires --file)
  --out=PATH              Output path (default: mktemp)
  --include-full          Include full file even if > MAX_FILE_SIZE

Examples:
  $0 effect-expert
  $0 effect-expert --skills=layer-design,service-implementation
  $0 domain-modeler --file=src/domain/Trade.ts
  $0 react-expert --file=src/ui/App.tsx --selection="<selected code>"
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
        --out=*)
            OUTPUT_PATH="${1#*=}"
            shift
            ;;
        --include-full)
            INCLUDE_FULL=1
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
            else
                echo "ERROR: Unexpected argument: $1" >&2
                usage
            fi
            shift
            ;;
    esac
done

if [[ -z "$AGENT_NAME" ]]; then
    echo "ERROR: agent-name is required" >&2
    usage
fi

# --- Validation ---
if [[ ! -d "$CLAUDE_DIR" ]]; then
    echo "ERROR: .claude directory not found at: $CLAUDE_DIR" >&2
    exit 1
fi

AGENT_FILE="$CLAUDE_DIR/agents/${AGENT_NAME}.md"
if [[ ! -f "$AGENT_FILE" ]]; then
    echo "ERROR: Agent not found: $AGENT_NAME" >&2
    echo "Available agents:" >&2
    if [[ -d "$CLAUDE_DIR/agents" ]]; then
        for agent in "$CLAUDE_DIR/agents"/*.md; do
            if [[ -f "$agent" ]]; then
                basename "$agent" .md | sed 's/^/  - /' >&2
            fi
        done
    fi
    exit 1
fi

# --- Create output file ---
if [[ -z "$OUTPUT_PATH" ]]; then
    OUTPUT_PATH=$(mktemp /tmp/prompt_${AGENT_NAME}_XXXXXX.md)
else
    mkdir -p "$(dirname "$OUTPUT_PATH")"
fi

# --- Helper functions ---
add_separator() {
    local title="$1"
    cat >> "$OUTPUT_PATH" << EOF

# ================================================================
# $title
# ================================================================

EOF
}

add_file_content() {
    local file="$1"
    local label="$2"
    
    if [[ ! -f "$file" ]]; then
        echo "WARNING: File not found: $file" >&2
        return
    fi
    
    echo "" >> "$OUTPUT_PATH"
    echo "## $label" >> "$OUTPUT_PATH"
    echo "Source: $file" >> "$OUTPUT_PATH"
    echo "" >> "$OUTPUT_PATH"
    echo '```' >> "$OUTPUT_PATH"
    
    local file_size
    file_size=$(wc -c < "$file" | tr -d ' ')
    
    if [[ $INCLUDE_FULL -eq 0 && $file_size -gt $MAX_FILE_SIZE ]]; then
        head -c "$MAX_FILE_SIZE" "$file" >> "$OUTPUT_PATH"
        echo "" >> "$OUTPUT_PATH"
        echo "$TRUNCATE_MARKER" >> "$OUTPUT_PATH"
        echo "File size: $file_size bytes (showing first $MAX_FILE_SIZE)" >> "$OUTPUT_PATH"
    else
        cat "$file" >> "$OUTPUT_PATH"
    fi
    
    echo '```' >> "$OUTPUT_PATH"
    echo "" >> "$OUTPUT_PATH"
}

# --- Build prompt ---
{
    echo "# Composed Prompt for Agent: $AGENT_NAME"
    echo "Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo ""
    echo "This prompt was composed from the following sources:"
    echo "- Instructions: $CLAUDE_DIR/instructions.md"
    echo "- Agent: $AGENT_FILE"
    echo "- Skills: ${SKILLS:-all}"
    if [[ -n "$FILE_PATH" ]]; then
        echo "- Context file: $FILE_PATH"
    fi
    echo ""
} >> "$OUTPUT_PATH"

# 1. Include instructions.md
if [[ -f "$CLAUDE_DIR/instructions.md" ]]; then
    add_separator "PROJECT INSTRUCTIONS"
    add_file_content "$CLAUDE_DIR/instructions.md" "Project Instructions"
fi

# 2. Include agent
add_separator "AGENT: $AGENT_NAME"
add_file_content "$AGENT_FILE" "Agent Definition"

# 3. Include skills
add_separator "SKILLS"

if [[ -z "$SKILLS" ]]; then
    # Include all skills
    echo "## All Available Skills" >> "$OUTPUT_PATH"
    echo "" >> "$OUTPUT_PATH"
    
    if [[ -d "$CLAUDE_DIR/skills" ]]; then
        for skill_dir in "$CLAUDE_DIR/skills"/*/; do
            if [[ -d "$skill_dir" ]]; then
                skill_name=$(basename "$skill_dir")
                skill_file="${skill_dir}SKILL.md"
                
                if [[ -f "$skill_file" ]]; then
                    add_file_content "$skill_file" "Skill: $skill_name"
                fi
            fi
        done
    fi
else
    # Include specific skills
    IFS=',' read -ra SKILL_ARRAY <<< "$SKILLS"
    
    for skill in "${SKILL_ARRAY[@]}"; do
        skill=$(echo "$skill" | xargs) # trim whitespace
        skill_file="$CLAUDE_DIR/skills/${skill}/SKILL.md"
        
        if [[ ! -f "$skill_file" ]]; then
            echo "WARNING: Skill not found: $skill (expected: $skill_file)" >&2
            echo "" >> "$OUTPUT_PATH"
            echo "⚠️  WARNING: Skill '$skill' not found at $skill_file" >> "$OUTPUT_PATH"
            echo "" >> "$OUTPUT_PATH"
        else
            add_file_content "$skill_file" "Skill: $skill"
        fi
    done
fi

# 4. Include workspace metadata
add_separator "WORKSPACE METADATA"

{
    echo "## Git Context"
    echo ""
    
    if git rev-parse --git-dir > /dev/null 2>&1; then
        echo "- Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
        echo "- Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
        echo "- Status: $(git status --short 2>/dev/null | wc -l | xargs) file(s) modified"
    else
        echo "- Not a git repository"
    fi
    
    echo ""
    echo "## Model Configuration"
    echo ""
    
    if [[ -f "$CLAUDE_DIR/settings.json" ]]; then
        if command -v jq &> /dev/null; then
            echo "- Default model: $(jq -r '.defaults.model // "unknown"' "$CLAUDE_DIR/settings.json")"
            echo "- Project: $(jq -r '.project.name // "unknown"' "$CLAUDE_DIR/settings.json")"
        else
            echo "- Settings file: $CLAUDE_DIR/settings.json (jq not available for parsing)"
        fi
    else
        echo "- No settings.json found"
    fi
    
    echo ""
} >> "$OUTPUT_PATH"

# 5. Include file context if provided
if [[ -n "$FILE_PATH" ]]; then
    add_separator "FILE CONTEXT"
    
    if [[ -n "$SELECTION" ]]; then
        {
            echo "## File: $FILE_PATH (with selection)"
            echo ""
            echo '```'
            echo "$SELECTION"
            echo '```'
            echo ""
        } >> "$OUTPUT_PATH"
    else
        add_file_content "$FILE_PATH" "File: $FILE_PATH"
    fi
fi

# 6. User prompt placeholder
add_separator "USER PROMPT"

{
    echo "<!-- USER_PROMPT_PLACEHOLDER -->"
    echo "<!-- This section will be populated by run-copilot.sh or by manual editing -->"
    echo ""
    echo "**Awaiting user instruction...**"
    echo ""
} >> "$OUTPUT_PATH"

# --- Output result ---
echo "$OUTPUT_PATH"
