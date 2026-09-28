/**
 * Restores the ambient `global` type that some vendor packages (react-native-
 * iap's debug logger, at least) reference bare, expecting it from
 * `@types/node` - this project has no such dependency (it's not a Node
 * runtime), and React Native's own type declarations augment the global
 * scope's members (`console`, `require`, etc.) without declaring `global`
 * itself. `global` is a real object at runtime in RN's JS engine regardless
 * (this file only restores its TYPE), so this is a type-only fix, not a
 * behavior change.
 */
declare var global: typeof globalThis;
