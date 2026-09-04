export function hasDiagnosticsArg(argv: string[]): boolean {
  return argv.includes('--diagnostics');
}
