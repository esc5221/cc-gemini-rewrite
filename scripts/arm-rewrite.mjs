#!/usr/bin/env node
// Arm a one-shot manual /rewrite for the current cwd. Called by the /rewrite command.
import { armRequest } from '../core/requests.mjs';
const note = process.argv.slice(2).join(' ').trim();
armRequest(process.cwd(), note);
process.stdout.write('armed');
