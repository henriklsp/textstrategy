# Code review: Single Responsibility

Review of `src/` after the fixes of 2026-09-26 to 2026-09-28. Not yet acted on.

## Housekeeping

- Delete unused files: `src/classes/TextRenderer.ts` (replaced by `TextSubstitution.ts`) and `src/classes/CharacterRequirement.ts`.
- Run `npm install` so `package-lock.json` matches `package.json` (build/test tools moved to devDependencies).
- A stray `%USERPROFILE%` folder sits in the project root.

## Findings

### 1. GameLoop creates its own UI

`GameLoop` constructs the concrete `UI` class, so another UI (possibly not HTML) cannot be plugged in.

- Define a small UI interface (show text, choices and debug info; report a selected choice or "continue") and pass the UI into `GameLoop`.
- Related bug: when no event is running, the UI is never updated, so the last page stays on screen with a button that does nothing (seen after "End" in the intro).

### 2. DataModel has about six jobs (371 lines)

- numbers and flags
- the cast of characters
- task assignments
- construction
- economy rules (production amounts, food consumption, decay, which task needs which building)
- formatting the debug text

`getDebugInfo()` is display formatting inside the model, which breaks the rule that presentation belongs to the UI; move it to the UI side.

Suggested split: `DataModel` as a thin container for `Variables`, `Cast`, `Tasks`, `Construction`, and an `Economy` that runs the daily update. This also gives the planned localStorage save a clear shape.

`startBuildingConstruction` logs warnings itself; the model should report through its return value and let the caller log.

### 3. GameLoop does five things

- the day-ordered event queue
- the named-event library, including file loading and browser/Node differences
- advancing days
- the dialog lifecycle
- UI wiring and setting up the default cast

Suggested split: a pure `EventQueue` and an `EventLibrary` built on a loader; `GameLoop` only coordinates.

### 4. EventParser mixes three jobs

- file I/O and environment detection (`fetch` vs `fs`, paths)
- text parsing and validation
- a `switch` that builds effects

Suggested split: `EventLoader`, `EventParser`, and an effect table (keyword → factory), so adding an effect doesn't mean editing the parser.

The parser also holds the game's scheduling callback only to pass it to `EventEffect`. Instead, `EventEffect` can get the scheduler through `EffectContext` when it runs, the same way `AssignTaskEffect` gets roles. That removes the parser's link to the game loop.

### 5. Dialog mixes navigation with two other jobs

- **Role assignment:** the search algorithm belongs in its own `RoleAssigner`.
- **Tag handling:** choice text replaces roles with its own regex, separate from `TextSubstitution`. The `<…>` syntax should live in one place.
- **Leaky interface:** `dataModel` is public only because `TextSubstitution` needs it. A narrow read-only interface (get / has / isSet) is enough.

### 6. Text syntax lives inside game-logic classes

- `PersonSelection.parse` and `VariablePrerequisite.parse` belong with the parser.
- `VariablePrerequisite` inherits from `Prerequisite` only to fit the type: it passes a dummy `() => false` and overrides `isMet`. Make `Prerequisite` an interface with two implementations.
- The `displayText` returned by `VariablePrerequisite.parse` is never used.

### 7. Game data is spread through the code

- **Resource names in buildings:** `ResourceCosts` and `canAfford(type, wood, copper, iron)` hard-code them, so adding a resource means editing several places. Use `Partial<Record<Resource, number>>` and check against the resource store.
- **Task-to-building links** depend on matching strings like `'enables_farming'`; a typo silently turns production off.
- **Production amounts** sit in a `switch` in `DataModel`.
- **Starting resources** are hard-coded in `Main`.

Tables like `BuildingDefinitions` (for tasks and starting state) keep rules separate from code.

### 8. Smaller points

- **Shared characters:** `DefaultCharacters` creates its `Person` objects once when the module loads, so every game and every test shares the same objects. Use a `createDefaultCharacters()` function.
- **Environment checks:** `typeof window` is tested separately in `UI` and `EventParser`.
- **Logging:** `console` calls are scattered (7 each in `GameLoop` and `EventParser`, plus `DataModel` and `AssignTaskEffect`). The parser already collects issues in `getIssues()`, so it doesn't need to log them too; let the caller decide.
- **Scoring numbers:** the role scoring values in `PersonSelection` (10, 4, -9, -3) could live in a scoring policy. Low priority.

## Suggested order

1. UI interface injected into `GameLoop` (finding 1)
2. `EventLoader` + effect table; scheduler via `EffectContext` (finding 4)
3. Split `DataModel` (finding 2)
4. Split `GameLoop` (finding 3)
5. `RoleAssigner`, one place for tag syntax, parsing out of domain classes (findings 5 and 6)
6. Data tables for tasks and starting state (finding 7)

## Rules decided so far (keep these)

- No section numbers in code. A choice pointing to a section that does not exist ends the dialog.
- All presentation (paragraph layout, "Continue" for sections without choices, HTML) belongs to the UI only. The parser keeps text lines as written.
- Debug mode is always on during development.
- A section with more roles than characters throws an error.
- Resources cannot go below 0.
- Every queued event has a day; events run on their day.
