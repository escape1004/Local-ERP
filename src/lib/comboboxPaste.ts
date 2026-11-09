type CommandSearchElement = {
  closest?: (selector: string) => unknown;
  hasAttribute?: (name: string) => boolean;
};

export function isCommandSearchInput(element: CommandSearchElement | null | undefined): boolean {
  if (!element) return false;
  if (typeof element.closest === 'function' && element.closest('[cmdk-input-wrapper]')) {
    return true;
  }
  return typeof element.hasAttribute === 'function' && element.hasAttribute('cmdk-input');
}

export function shouldAutoSelectPastedComboboxValue(isSearchFocused: boolean): boolean {
  return !isSearchFocused;
}

export function resolveSelectPaste(
  options: string[] | undefined,
  pastedText: string,
  multiple: boolean,
  currentValue: unknown,
): { matched: string[]; invalid: string[]; nextValue: string | string[] | null } {
  const optionList = options || [];

  if (multiple) {
    const pastedValues = String(pastedText || '').split(',').map((item) => item.trim()).filter(Boolean);
    const matched = optionList.filter((option) => (
      pastedValues.some((item) => option.toLowerCase() === item.toLowerCase())
    ));
    const invalid = pastedValues.filter((item) => (
      !optionList.some((option) => option.toLowerCase() === item.toLowerCase())
    ));
    if (matched.length === 0) {
      return { matched, invalid, nextValue: null };
    }
    const currentValues = Array.isArray(currentValue) ? currentValue.map(String) : [];
    return { matched, invalid, nextValue: [...new Set([...currentValues, ...matched])] };
  }

  const pastedValue = String(pastedText || '').trim();
  const matchedOption = optionList.find((option) => option.toLowerCase() === pastedValue.toLowerCase());
  if (!matchedOption) {
    return { matched: [], invalid: pastedValue ? [pastedValue] : [], nextValue: null };
  }
  return { matched: [matchedOption], invalid: [], nextValue: matchedOption };
}
