/**
 * ID generation utilities for Creative Production OS
 */

/**
 * Generates a short random token (first segment of a UUID).
 * @returns {string}
 */
export const shortId = () => crypto.randomUUID().split('-')[0];

/**
 * Generates a prefixed short id, e.g. generateId('ASG') -> "ASG-1a2b3c4d".
 * @param {string} [prefix] Optional prefix.
 * @param {string} [sep] Separator between prefix and token (default '-').
 * @returns {string}
 */
export const generateId = (prefix = '', sep = '-') =>
    prefix ? `${prefix}${sep}${shortId()}` : shortId();
