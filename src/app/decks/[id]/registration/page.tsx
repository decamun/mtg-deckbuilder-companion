import { DeckRegistrationClient } from "./DeckRegistrationClient"

export default async function DeckRegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DeckRegistrationClient deckId={id} />
}
