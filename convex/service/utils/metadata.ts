/**
 * Compares an original object with an updates object and returns an array of metadata
 * describing the changes between them.
 * @param original - The original object to compare against
 * @param updates - An object containing potential updates to the original
 * @returns Array of objects containing the field name that changed, its previous value, and new value
 * @template T - Type of the original object extending Record<string, unknown>
 * @template U - Type of the updates object extending Partial<T>
 */
export const getChangeMetadata = <T extends Record<string, unknown>>(
  original: T,
  updates: Record<string, unknown>,
) => {
  return Object.entries(updates)
    .filter(([key, value]) => value !== undefined && original[key as keyof T] !== value)
    .map(([fieldChanged, newValue]) => ({
      fieldChanged,
      previousValue: String(original[fieldChanged as keyof T]),
      newValue: String(newValue),
    }));
};
