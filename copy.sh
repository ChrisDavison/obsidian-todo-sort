#!/usr/bin/env bash


DESTINATION="$HOME/.obsidian/plugins/todo-sort-completed"

rsync main.js manifest.json versions.json LICENSE README.md "$DESTINATION"
echo "Copied files into my obsidian vault"
