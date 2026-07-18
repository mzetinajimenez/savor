import { EmptyState, HeaderShell } from "../components/ui";

// Journal tab. Visit log + entry form land in T11; chrome + empty state for now.
export default function JournalPage() {
  return (
    <>
      <HeaderShell title="Journal" />
      <EmptyState
        emoji="📔"
        title="Your journal is empty"
        hint="Every visit you log shows up here, newest first — dishes, notes, the whole meal."
      />
    </>
  );
}
