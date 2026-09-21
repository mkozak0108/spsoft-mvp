# AI Usage
 
This is the only file in the project written manually. All the rest are written by Claude Code (Sonnet/Opus 5).

## Github Spec Kit

Apart from test task I've decided to try out SDD(spec driver development) via [SpecKit](https://github.com/github/spec-kit).
The idea is to generate natural language requirements first and let the AI do the implementation.

## Flow

1. Set project rules by /speckit-constitution. Simplicity, Security & Privacy, Observability and so on.
2. Describe feature via /speckit-specify. High level buisness requirement. Focuses on WHAT to do.
3. Research the plan /speckit-plan. Goes over technical details, researches the OHIF library, focuses on HOW to do.
4. Generate tasks with /speckit-tasks. Writes short user stories, where and how to implement them, including code snippets.
5. Analyze /speckit-analyze. Checks specs, plan and tasks against each other.
6. Implement via /speckit-implement. Writes the code, run the linter, typecheck, run testing (both unit and E2E by AI).

Every step requirements review every time. This approach takes significantly more time than simple prompting 
but promises more deterministic output from LLM.

Every comment and review in the code should change also the docs way how code is written so in the future same mistakes wont happen again.

## My Comments to AI
* Too many comments. Focus on WHY it's here do not describe the code.
* Use enums or constants instead of string literals
* Split code to helpers/utils/guards. Do not keep everything in single file.
* Reuse code between Bridge and Host. If it's possible import types from OHIF directly.
* Many logic and behaviour comments. Drop the loader, change the persistant state to localeStorage, etc.
* Many questions about how OHIF works internally.

## Resources Spent
* Active time is about 11 hours during 3.5 days.
* Output tokens were about 1.73M. Opus 5 wrote about 1.24M and Sonnet 5 about 0.49M
