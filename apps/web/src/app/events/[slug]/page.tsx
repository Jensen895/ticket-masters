import { EventDetails } from "@/components/EventDetails";

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EventDetails eventId={slug} />;
}
