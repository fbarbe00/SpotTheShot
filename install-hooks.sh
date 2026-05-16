#!/usr/bin/env bash
#
# Install Git Hooks for SpotTheShot
#
# This script installs the pre-commit hook and makes it executable.
# Run this after cloning the repository.
#

set -e

HOOKS_DIR=".git/hooks"
SCRIPTS_DIR=".githooks"

echo "🔧 Installing Git hooks..."

# Create hooks directory if it doesn't exist
mkdir -p "$HOOKS_DIR"

# Copy pre-commit hook
if [ -f "$SCRIPTS_DIR/pre-commit" ]; then
    cp "$SCRIPTS_DIR/pre-commit" "$HOOKS_DIR/pre-commit"
    chmod +x "$HOOKS_DIR/pre-commit"
    echo "✓ Pre-commit hook installed"
elif [ -f ".git/hooks/pre-commit" ]; then
    chmod +x ".git/hooks/pre-commit"
    echo "✓ Pre-commit hook already exists and is executable"
else
    echo "✗ Pre-commit hook not found"
    exit 1
fi

echo ""
echo "✅ Git hooks installed successfully!"
echo ""
echo "The pre-commit hook will automatically:"
echo "  1. Run ESLint on src/"
echo "  2. Run all tests"
echo "  3. Check translation completeness"
echo ""
echo "To bypass the hook (not recommended):"
echo "  git commit --no-verify"
echo ""
