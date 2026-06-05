export function formatString(str: string): string {
  return str.trim().toLowerCase();
}

export class TextProcessor {
  process(input: string): string {
    return formatString(input);
  }
}
