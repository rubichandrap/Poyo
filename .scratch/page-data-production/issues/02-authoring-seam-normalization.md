# 02: Authoring Seam Normalization in PoyoPage

**What to build:** Enforce object-only Page data at the controller boundary. `this.PoyoPage(data)` normalizes all inputs into a structured `JsonElement?`. Serializes C# objects using camelCase property naming; preserves existing property names on pre-serialized JSON strings; clones caller-supplied `JsonElement` instances; wraps `JsonException` in `ArgumentException`; and immediately throws `ArgumentException` if the payload is a primitive (number, boolean, raw string) or an array.

**Blocked by:** 01: Record ADR 0012 for Unified Page Data Production

**Status:** done — implemented in PR #62

- [x] `this.PoyoPage(data)` accepts C# objects and records, serializing them to `JsonElement` with camelCase property naming.
- [x] `this.PoyoPage(jsonString)` accepts pre-serialized JSON strings representing objects, preserving existing property names.
- [x] `this.PoyoPage` wraps `JsonException` in `ArgumentException` when an invalid JSON string is passed.
- [x] `this.PoyoPage` throws `ArgumentException` when passed a primitive (number, boolean, non-JSON string) or an array.
- [x] Caller-supplied `JsonElement` values are explicitly cloned, ensuring accessing the element after the caller disposes the underlying `JsonDocument` does not throw `ObjectDisposedException`.
- [x] Direct unit tests in `Poyo.Server.Tests` verify valid normalization, exception throwing on primitives/arrays/bad JSON, and dispose-after-pass memory safety.
