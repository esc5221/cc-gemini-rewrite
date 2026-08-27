#!/usr/bin/env node
// Arm a one-shot manual /rewrite for the current cwd. Called by the /rewrite command.
import { armRequest } from '../core/requests.mjs';
const note = process.argv.slice(2).join(' ').trim();
armRequest(process.cwd(), note);
process.stdout.write('\u21bb re-explaining\u2026  (\uba87 \ucd08 \ub4a4\uc5d0 \ud45c\uc2dc\ub429\ub2c8\ub2e4)');
