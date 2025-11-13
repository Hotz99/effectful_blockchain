#!/usr/bin/env bash
# validate-pipeline.sh - Run validation tests for the CLI pipeline
# This script performs basic checks to ensure the pipeline is working correctly

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASSED=0
FAILED=0

echo "🧪 CLI Pipeline Validation Tests"
echo "================================"
echo ""

# Helper functions
pass() {
    echo "✅ PASS: $1"
    ((PASSED++))
}

fail() {
    echo "❌ FAIL: $1"
    ((FAILED++))
}

test_section() {
    echo ""
    echo "--- $1 ---"
}

# Test 1: Scripts exist and are executable
test_section "Test 1: Script Files"

if [[ -x "$SCRIPT_DIR/build-prompt.sh" ]]; then
    pass "build-prompt.sh is executable"
else
    fail "build-prompt.sh not found or not executable"
fi

if [[ -x "$SCRIPT_DIR/run-copilot.sh" ]]; then
    pass "run-copilot.sh is executable"
else
    fail "run-copilot.sh not found or not executable"
fi

# Test 2: .claude directory structure
test_section "Test 2: .claude Directory Structure"

if [[ -d "$SCRIPT_DIR/.claude" ]]; then
    pass ".claude directory exists"
else
    fail ".claude directory not found"
fi

if [[ -f "$SCRIPT_DIR/.claude/instructions.md" ]]; then
    pass ".claude/instructions.md exists"
else
    fail ".claude/instructions.md not found"
fi

if [[ -f "$SCRIPT_DIR/.claude/settings.json" ]]; then
    pass ".claude/settings.json exists"
else
    fail ".claude/settings.json not found"
fi

if [[ -d "$SCRIPT_DIR/.claude/agents" ]]; then
    agent_count=$(find "$SCRIPT_DIR/.claude/agents" -name "*.md" -type f | wc -l | xargs)
    if [[ $agent_count -gt 0 ]]; then
        pass "Found $agent_count agent(s)"
    else
        fail "No agents found in .claude/agents"
    fi
else
    fail ".claude/agents directory not found"
fi

if [[ -d "$SCRIPT_DIR/.claude/skills" ]]; then
    skill_count=$(find "$SCRIPT_DIR/.claude/skills" -name "SKILL.md" -type f | wc -l | xargs)
    if [[ $skill_count -gt 0 ]]; then
        pass "Found $skill_count skill(s)"
    else
        fail "No skills found in .claude/skills"
    fi
else
    fail ".claude/skills directory not found"
fi

# Test 3: Build prompt with valid agent
test_section "Test 3: Build Prompt (Valid Agent)"

if [[ -f "$SCRIPT_DIR/.claude/agents/effect-expert.md" ]]; then
    TEMP_PROMPT=$(mktemp)
    if "$SCRIPT_DIR/build-prompt.sh" effect-expert --out="$TEMP_PROMPT" > /dev/null 2>&1; then
        if [[ -f "$TEMP_PROMPT" && -s "$TEMP_PROMPT" ]]; then
            pass "build-prompt.sh created prompt file"
            
            # Check content
            if grep -q "effect-expert" "$TEMP_PROMPT"; then
                pass "Prompt contains agent name"
            else
                fail "Prompt missing agent name"
            fi
            
            if grep -q "PROJECT INSTRUCTIONS" "$TEMP_PROMPT"; then
                pass "Prompt contains instructions section"
            else
                fail "Prompt missing instructions section"
            fi
            
            if grep -q "SKILLS" "$TEMP_PROMPT"; then
                pass "Prompt contains skills section"
            else
                fail "Prompt missing skills section"
            fi
        else
            fail "build-prompt.sh produced empty or missing file"
        fi
        rm -f "$TEMP_PROMPT"
    else
        fail "build-prompt.sh failed to execute"
    fi
else
    echo "⚠️  SKIP: effect-expert.md not found, skipping this test"
fi

# Test 4: Build prompt with invalid agent
test_section "Test 4: Build Prompt (Invalid Agent)"

if ! "$SCRIPT_DIR/build-prompt.sh" nonexistent-agent-xyz 2>&1 | grep -q "ERROR"; then
    fail "build-prompt.sh should error on invalid agent"
else
    pass "build-prompt.sh properly errors on invalid agent"
fi

# Test 5: Build prompt with specific skills
test_section "Test 5: Build Prompt (Specific Skills)"

if [[ -d "$SCRIPT_DIR/.claude/skills/layer-design" ]]; then
    TEMP_PROMPT=$(mktemp)
    if "$SCRIPT_DIR/build-prompt.sh" effect-expert --skills=layer-design --out="$TEMP_PROMPT" > /dev/null 2>&1; then
        if grep -q "layer-design" "$TEMP_PROMPT"; then
            pass "Prompt includes specified skill"
        else
            fail "Prompt missing specified skill"
        fi
        rm -f "$TEMP_PROMPT"
    else
        fail "build-prompt.sh failed with --skills flag"
    fi
else
    echo "⚠️  SKIP: layer-design skill not found, skipping this test"
fi

# Test 6: Build prompt with file context
test_section "Test 6: Build Prompt (File Context)"

TEST_FILE=$(mktemp)
echo "const x = 1;" > "$TEST_FILE"

TEMP_PROMPT=$(mktemp)
if "$SCRIPT_DIR/build-prompt.sh" effect-expert --file="$TEST_FILE" --out="$TEMP_PROMPT" > /dev/null 2>&1; then
    if grep -q "FILE CONTEXT" "$TEMP_PROMPT" && grep -q "const x = 1" "$TEMP_PROMPT"; then
        pass "Prompt includes file context"
    else
        fail "Prompt missing file context"
    fi
    rm -f "$TEMP_PROMPT"
else
    fail "build-prompt.sh failed with --file flag"
fi

rm -f "$TEST_FILE"

# Test 7: run-copilot.sh help
test_section "Test 7: run-copilot.sh Help"

if "$SCRIPT_DIR/run-copilot.sh" --help 2>&1 | grep -q "Usage:"; then
    pass "run-copilot.sh --help works"
else
    fail "run-copilot.sh --help failed"
fi

# Test 8: Dependencies check
test_section "Test 8: Dependencies"

if command -v git &> /dev/null; then
    pass "git is installed"
else
    echo "⚠️  WARNING: git not found (recommended)"
fi

if command -v jq &> /dev/null; then
    pass "jq is installed"
else
    echo "⚠️  WARNING: jq not found (recommended for settings.json parsing)"
fi

if command -v bun &> /dev/null; then
    pass "bun is installed"
else
    echo "⚠️  WARNING: bun not found (required for TypeScript hooks)"
fi

if command -v gh &> /dev/null; then
    if gh extension list 2>/dev/null | grep -q copilot; then
        pass "GitHub CLI with Copilot extension is installed"
    else
        echo "⚠️  WARNING: GitHub CLI found but Copilot extension not installed"
    fi
else
    echo "⚠️  WARNING: GitHub CLI not found (required for Copilot CLI)"
fi

# Test 9: settings.json parsing
test_section "Test 9: Settings Parsing"

if [[ -f "$SCRIPT_DIR/.claude/settings.json" ]]; then
    if command -v jq &> /dev/null; then
        if jq empty "$SCRIPT_DIR/.claude/settings.json" 2>/dev/null; then
            pass "settings.json is valid JSON"
            
            if jq -e '.hooks.PostToolUse' "$SCRIPT_DIR/.claude/settings.json" &>/dev/null; then
                pass "settings.json contains PostToolUse hooks"
            else
                echo "⚠️  WARNING: No PostToolUse hooks defined in settings.json"
            fi
        else
            fail "settings.json is invalid JSON"
        fi
    else
        echo "⚠️  SKIP: jq not available for JSON validation"
    fi
fi

# Test 10: Log directory creation
test_section "Test 10: Log Directory"

mkdir -p "$SCRIPT_DIR/.cli-llm/logs"
if [[ -d "$SCRIPT_DIR/.cli-llm/logs" ]]; then
    pass "Log directory can be created"
    
    # Create test log
    TEST_LOG="$SCRIPT_DIR/.cli-llm/logs/test_$(date +%s).txt"
    echo "test" > "$TEST_LOG"
    if [[ -f "$TEST_LOG" ]]; then
        pass "Can write to log directory"
        rm -f "$TEST_LOG"
    else
        fail "Cannot write to log directory"
    fi
else
    fail "Cannot create log directory"
fi

# Summary
echo ""
echo "================================"
echo "📊 Test Summary"
echo "================================"
echo "✅ Passed: $PASSED"
echo "❌ Failed: $FAILED"
echo ""

if [[ $FAILED -eq 0 ]]; then
    echo "🎉 All tests passed!"
    exit 0
else
    echo "⚠️  Some tests failed. Please review the output above."
    exit 1
fi
