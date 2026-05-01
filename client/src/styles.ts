import styles from "./App.module.css";

export function cx(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => styles[token] ?? token)
    .join(" ");
}

export { styles };
