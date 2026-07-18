import { EmptyState, HeaderShell } from "../components/ui";

// Settings tab. Rating criteria editor + backup/import land in T12–T13; chrome + placeholder now.
export default function SettingsPage() {
  return (
    <>
      <HeaderShell title="Settings" />
      <EmptyState
        emoji="⚙️"
        title="Settings are on the way"
        hint="Your rating criteria, backups, and data import will live here soon."
      />
    </>
  );
}
