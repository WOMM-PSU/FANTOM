type IssueSource = { issues: { path: PropertyKey[]; message: string }[] };

/** Short human-readable summary of a failed schema parse, for ERROR messages. */
export function summarizeIssues(error: IssueSource, limit = 3): string {
  return error.issues
    .slice(0, limit)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}
