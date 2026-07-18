import { EmptyState, HeaderShell } from "../components/ui";

// Lists tab. Category rankings + weights editor land in T10; chrome + empty state for now.
export default function ListsPage() {
  return (
    <>
      <HeaderShell title="Lists" />
      <EmptyState
        emoji="🏆"
        title="No lists yet"
        hint="Group places into your own rankings — best tacos, top ramen, whatever you crave."
      />
    </>
  );
}
