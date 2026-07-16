/**
 * Formatting utilities for Creative Production OS.
 * Centralizes the Colombian-peso currency and date formatting that was
 * previously duplicated across pages and services.
 */

const CO_LOCALE = 'es-CO';

/**
 * Formats a numeric amount as Colombian pesos with a leading "$".
 * @param {number|string} amount
 * @returns {string} e.g. "$1.500.000"
 */
export const formatCurrency = (amount) =>
    `$${(Number(amount) || 0).toLocaleString(CO_LOCALE)}`;

/**
 * Formats a numeric amount with a "COP " prefix.
 * @param {number|string} amount
 * @returns {string} e.g. "COP 1.500.000"
 */
export const formatCurrencyCode = (amount) =>
    `COP ${(Number(amount) || 0).toLocaleString(CO_LOCALE)}`;

/**
 * Formats a date value using the Colombian locale.
 * Returns an empty string for falsy/invalid dates.
 * @param {string|number|Date} date
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export const formatDate = (date, options) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(CO_LOCALE, options);
};
