import dynamic from "next/dynamic"

const DeckRegistrationClient = dynamic(
  () => import("./DeckRegistrationClient").then((m) => ({ default: m.DeckRegistrationClient })),
  { ssr: false, loading: () => <p className="px-4 py-10 text-sm text-muted-foreground">Loading…</p> },
)

export default async function DeckRegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DeckRegistrationClient deckId={id} />
}
