import { AddPlaceButton, EmptyState, HeaderShell } from "./components/ui";

// Places tab (home). Real list + filters land in T7; this renders the chrome + an inviting
// empty state so the route is complete today.
export default function PlacesPage() {
  return (
    <>
      <HeaderShell title="Places" />
      <EmptyState
        emoji="🍽️"
        title="Nothing on the table yet"
        hint="Add the first spot you've eaten — or one you're dying to try."
      >
        <AddPlaceButton />
      </EmptyState>
    </>
  );
}
