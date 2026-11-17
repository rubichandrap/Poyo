export declare const SOURCE_ROOTS: readonly string[];
export declare const MODULE_PATH: string;
export declare function stripNonCode(source: string): string;
export declare function deriveReservedNames(): string[];
export declare function renderModule(names: readonly string[]): string;
