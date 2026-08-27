#!/usr/bin/env node
// Arm a one-shot manual /rewrite for the current cwd. Called by the /rewrite command.
// Prints a progress line so the /rewrite gap shows something (not "(No output)").
import { armRequest } from '../core/requests.mjs';
const note = process.argv.slice(2).join(' ').trim();
armRequest(process.cwd(), note);
process.stdout.write('↻ re-explaining…  (appears in a few seconds)');
